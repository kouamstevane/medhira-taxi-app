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

function getStripeCurrency(): string {
  const currency = STRIPE_CURRENCY_BY_MARKET[ACTIVE_MARKET];
  if (!currency) throw new Error(`Devise non supportée par Stripe pour le marché ${ACTIVE_MARKET}`);
  return currency;
}

async function verifyWithRole(request: NextRequest): Promise<{ uid: string; role?: string }> {
  const uid = await verifyFirebaseToken(request);
  const userSnap = await getAdminDb().collection('users').doc(uid).get();
  const role: string | undefined = userSnap.data()?.role;
  return { uid, role };
}

export async function POST(request: NextRequest) {
  try {
    const { uid, role } = await verifyWithRole(request);
    const { type } = await request.json();

    if (type === 'manual') {
      const result = await triggerManualPayout(uid, getStripeCurrency());
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
    const message = err instanceof Error ? err.message : 'Erreur interne';
    console.error('[POST /api/stripe/connect/payout]', message);
    const status =
      message.includes('Token') ? 401 :
      message.includes('non trouvé') ? 404 :
      message === 'SERVICE_UNAVAILABLE' ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { uid } = await verifyWithRole(request);
    const { weeklyPayoutEnabled } = await request.json();

    if (typeof weeklyPayoutEnabled !== 'boolean') {
      return NextResponse.json({ error: 'weeklyPayoutEnabled doit être un booléen' }, { status: 400 });
    }

    await setDriverWeeklyPayoutPreference(uid, weeklyPayoutEnabled);

    return NextResponse.json({
      success: true,
      weeklyPayoutEnabled,
      message: weeklyPayoutEnabled
        ? 'Virements hebdomadaires automatiques activés. Vous recevrez votre part chaque lundi.'
        : 'Virements hebdomadaires désactivés. Vos gains s\'accumulent jusqu\'au prochain virement manuel.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne';
    console.error('[PATCH /api/stripe/connect/payout]', message);
    const status = message.includes('Token') ? 401 : message === 'SERVICE_UNAVAILABLE' ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
