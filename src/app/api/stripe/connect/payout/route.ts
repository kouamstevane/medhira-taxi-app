/**
 * API Route — Virements chauffeurs (Connect)
 *
 * POST  /api/stripe/connect/payout  { type: 'manual' | 'weekly_all' }
 * PATCH /api/stripe/connect/payout  { weeklyPayoutEnabled: boolean }
 *
 * @module app/api/stripe/connect/payout
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import {
  triggerManualPayout,
  processWeeklyPayouts,
  setDriverWeeklyPayoutPreference,
} from '@/services/stripe-connect.service';
import { STRIPE_CURRENCY_BY_MARKET } from '@/types/stripe';
import { ACTIVE_MARKET } from '@/utils/constants';
import { z } from 'zod';

const PostPayoutSchema = z.object({
  type: z.enum(['manual', 'weekly_all'], { message: 'type invalide — valeurs: manual | weekly_all' }),
  driverId: z.string().min(1).optional(),
});

const PatchPayoutSchema = z.object({
  weeklyPayoutEnabled: z.boolean({ message: 'weeklyPayoutEnabled doit être un booléen' }),
});

function getStripeCurrency(): string {
  const currency = STRIPE_CURRENCY_BY_MARKET[ACTIVE_MARKET];
  if (!currency) throw new Error(`Devise non supportée par Stripe pour le marché ${ACTIVE_MARKET}`);
  return currency;
}

async function verifyWithRole(request: NextRequest): Promise<{ uid: string; role: 'admin' | 'driver' | 'user' }> {
  const uid = await verifyFirebaseToken(request);
  const db = getAdminDb();

  // 1) Admin explicite via collection /admins
  const adminSnap = await db.collection('admins').doc(uid).get();
  if (adminSnap.exists) {
    return { uid, role: 'admin' };
  }

  // 2) Mapping via users/{uid}.userType ('chauffeur' | 'admin' | 'user' | ...)
  const userSnap = await db.collection('users').doc(uid).get();
  const userType = userSnap.exists ? (userSnap.data()?.userType as string | undefined) : undefined;
  if (userType === 'admin') return { uid, role: 'admin' };
  if (userType === 'chauffeur') return { uid, role: 'driver' };

  // 3) Fallback: présence dans /drivers implique driver (pas de champ role dans le schéma)
  const driverSnap = await db.collection('drivers').doc(uid).get();
  if (driverSnap.exists) return { uid, role: 'driver' };

  return { uid, role: 'user' };
}

export async function POST(request: NextRequest) {
  try {
    const { uid, role } = await verifyWithRole(request);
    const body = await request.json();
    const parsed = PostPayoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { type, driverId: bodyDriverId } = parsed.data;

    if (type === 'manual') {
      // C4: restreindre aux drivers / admins, et empêcher un driver
      // de déclencher un payout sur un autre driver
      if (role !== 'driver' && role !== 'admin') {
        return NextResponse.json({ error: 'Accès réservé aux chauffeurs et administrateurs' }, { status: 403 });
      }
      const targetDriverId = role === 'admin' ? (bodyDriverId ?? uid) : uid;
      if (role === 'driver' && bodyDriverId && bodyDriverId !== uid) {
        return NextResponse.json({ error: 'Un chauffeur ne peut pas déclencher le virement d\'un autre chauffeur' }, { status: 403 });
      }
      const result = await triggerManualPayout(targetDriverId, getStripeCurrency());
      return NextResponse.json(result);
    }

    if (type === 'weekly_all') {
      if (role !== 'admin') {
        return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
      }
      const summary = await processWeeklyPayouts(getStripeCurrency());
      return NextResponse.json(summary);
    }

    return NextResponse.json({ error: 'type invalide — valeurs: manual | weekly_all' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[POST /api/stripe/connect/payout]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message.includes('non trouvé')) {
      return NextResponse.json({ error: 'Ressource non trouvée' }, { status: 404 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { uid, role } = await verifyWithRole(request);
    if (role !== 'driver' && role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux chauffeurs et administrateurs' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = PatchPayoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { weeklyPayoutEnabled } = parsed.data;
    await setDriverWeeklyPayoutPreference(uid, weeklyPayoutEnabled);

    return NextResponse.json({
      success: true,
      weeklyPayoutEnabled,
      message: weeklyPayoutEnabled
        ? 'Virements hebdomadaires automatiques activés. Vous recevrez votre part chaque lundi.'
        : 'Virements hebdomadaires désactivés. Vos gains s\'accumulent jusqu\'au prochain virement manuel.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[PATCH /api/stripe/connect/payout]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}