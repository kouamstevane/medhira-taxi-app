/**
 * API Route — Compte Stripe Connect chauffeur
 * GET  /api/stripe/connect/account  → Statut du compte Connect
 * POST /api/stripe/connect/account  → Créer un compte Connect
 * @module app/api/stripe/connect/account
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import { createDriverConnectAccount, syncDriverAccountStatus } from '@/services/stripe-connect.service';

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
    const message = err instanceof Error ? err.message : 'Erreur interne';
    console.error('[GET /api/stripe/connect/account]', message);
    const status = message.includes('Token') ? 401 : message === 'SERVICE_UNAVAILABLE' ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const { email, country } = await request.json();

    if (!email || !country) {
      return NextResponse.json({ error: 'email et country sont requis' }, { status: 400 });
    }

    const snap = await getAdminDb().collection('drivers').doc(userId).get();
    if (snap.exists && snap.data()?.stripeAccountId) {
      return NextResponse.json({ error: 'Un compte Stripe Connect existe déjà' }, { status: 409 });
    }

    const accountId = await createDriverConnectAccount(userId, email, country);
    return NextResponse.json({ accountId, status: 'pending' }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne';
    console.error('[POST /api/stripe/connect/account]', message);
    const status = message.includes('Token') ? 401 : message === 'SERVICE_UNAVAILABLE' ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
