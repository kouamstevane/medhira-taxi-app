/**
 * API Route — Recharge portefeuille via Stripe
 * POST /api/stripe/wallet/recharge
 * @module app/api/stripe/wallet/recharge
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/admin-guard';
import { createWalletRechargePaymentIntent } from '@/services/stripe-payment.service';
import { STRIPE_CURRENCY_BY_MARKET } from '@/types/stripe';
import { ACTIVE_MARKET, LIMITS } from '@/utils/constants';

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const { amount } = await request.json();

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
    }
    if (amount < LIMITS.MIN_WALLET_RECHARGE) {
      return NextResponse.json({ error: `Montant minimum : ${LIMITS.MIN_WALLET_RECHARGE}` }, { status: 400 });
    }
    if (amount > LIMITS.MAX_WALLET_RECHARGE) {
      return NextResponse.json({ error: `Montant maximum : ${LIMITS.MAX_WALLET_RECHARGE}` }, { status: 400 });
    }

    const currency = STRIPE_CURRENCY_BY_MARKET[ACTIVE_MARKET];
    if (!currency) {
      return NextResponse.json(
        { error: `Le marché (${ACTIVE_MARKET}) ne supporte pas Stripe. Utilisez le paiement mobile.` },
        { status: 422 }
      );
    }

    const result = await createWalletRechargePaymentIntent(amount, currency, userId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne';
    console.error('[POST /api/stripe/wallet/recharge]', message);
    const status = message.includes('Token') ? 401 : message === 'SERVICE_UNAVAILABLE' ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
