/**
 * API Route — Compte Stripe Connect chauffeur
 * GET  /api/stripe/connect/account  → Statut du compte Connect
 * POST /api/stripe/connect/account  → Créer un compte Connect
 * @module app/api/stripe/connect/account
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, verifyFirebaseTokenFull, getAdminDb } from '@/lib/admin-guard';
import { createDriverConnectAccount, syncDriverAccountStatus } from '@/services/stripe-connect.service';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const db = getAdminDb();

    const snap = await db.collection('drivers').doc(userId).get();
    if (!snap.exists) {
      return NextResponse.json({ status: 'not_created', stripeAccountId: null }, { status: 200 });
    }

    const data = snap.data()!;
    const accountId: string | null = data.stripeAccountId ?? null;
    let status = data.stripeAccountStatus ?? 'not_created';

    if (accountId && status !== 'disabled') {
      status = await syncDriverAccountStatus(userId, accountId);
    }

    return NextResponse.json({
      stripeAccountId: accountId,
      status,
      weeklyPayoutEnabled: data.weeklyPayoutEnabled ?? false,
      pendingBalance: data.pendingBalanceCents ?? 0,
      currency: data.currency ?? 'cad',
      lastPayoutAt: data.lastPayoutAt ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[GET /api/stripe/connect/account]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { uid, email: tokenEmail, emailVerified } = await verifyFirebaseTokenFull(request);

    if (!tokenEmail || !emailVerified) {
      return NextResponse.json({ error: 'Email vérifié requis' }, { status: 400 });
    }

    const connectAccountSchema = z.object({
      country: z.string().length(2)
    });
    const parsed = connectAccountSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { country } = parsed.data;

    const email = tokenEmail;

    const snap = await getAdminDb().collection('drivers').doc(uid).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Réservé aux chauffeurs' }, { status: 403 });
    }
    if (snap.data()?.stripeAccountId) {
      return NextResponse.json({ error: 'Un compte Stripe Connect existe déjà' }, { status: 409 });
    }

    const accountId = await createDriverConnectAccount(uid, email, country);
    return NextResponse.json({ accountId, status: 'pending' }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[POST /api/stripe/connect/account]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}
