/**
 * API Route — Recharge portefeuille via Stripe
 * POST /api/stripe/wallet/recharge
 * @module app/api/stripe/wallet/recharge
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import { createWalletRechargePaymentIntent } from '@/services/stripe-payment.service';
import { STRIPE_CURRENCY_BY_MARKET } from '@/types/stripe';
import { ACTIVE_MARKET, LIMITS } from '@/utils/constants';
import { z } from 'zod';

const RechargeSchema = z.object({
  amount: z.number().finite('Le montant doit être un nombre fini').positive('Le montant doit être positif'),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const body = await request.json();
    const parsed = RechargeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { amount } = parsed.data;

    if (amount < LIMITS.MIN_WALLET_RECHARGE) {
      return NextResponse.json({ error: 'Montant minimum : ' + LIMITS.MIN_WALLET_RECHARGE }, { status: 400 });
    }
    if (amount > LIMITS.MAX_WALLET_RECHARGE) {
      return NextResponse.json({ error: 'Montant maximum : ' + LIMITS.MAX_WALLET_RECHARGE }, { status: 400 });
    }

    const currency = STRIPE_CURRENCY_BY_MARKET[ACTIVE_MARKET];
    if (!currency) {
      return NextResponse.json(
        { error: 'Le marché (' + ACTIVE_MARKET + ') ne supporte pas Stripe. Utilisez le paiement mobile.' },
        { status: 422 }
      );
    }

    const userSnap = await getAdminDb().collection('users').doc(userId).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const stripeCustomerId = userData?.stripeCustomerId ?? undefined;

    const result = await createWalletRechargePaymentIntent(amount, currency, userId, stripeCustomerId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[POST /api/stripe/wallet/recharge]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}