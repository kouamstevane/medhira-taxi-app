/**
 * API Route — Stripe PaymentIntents (courses taxi)
 *
 * POST   /api/stripe/payment-intent        → Créer une autorisation
 * PUT    /api/stripe/payment-intent        → Capturer ou annuler
 *
 * @module app/api/stripe/payment-intent
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import {
  createRidePaymentIntent,
  captureRidePayment,
  cancelRidePayment,
} from '@/services/stripe-payment.service';
import { accumulateDriverEarnings } from '@/services/stripe-connect.service';
import type {
  CreateRidePaymentIntentRequest,
  UpdatePaymentIntentRequest,
} from '@/types/stripe';
import { STRIPE_CURRENCY_BY_MARKET, PAYMENT_STATUS } from '@/types/stripe';
import { ACTIVE_MARKET } from '@/utils/constants';

function getStripeCurrency(): string {
  const currency = STRIPE_CURRENCY_BY_MARKET[ACTIVE_MARKET];
  if (!currency) {
    throw new Error(
      `Le marché actif (${ACTIVE_MARKET}) utilise une devise non supportée par Stripe.`
    );
  }
  return currency;
}

// ============================================================================
// POST — Créer un PaymentIntent (autorisation)
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const body: CreateRidePaymentIntentRequest = await request.json();
    const { bookingId, amount } = body;

    if (!bookingId || !amount || amount <= 0) {
      return NextResponse.json({ error: 'bookingId et amount sont requis' }, { status: 400 });
    }

    // Vérification d'ownership : seul le passager propriétaire peut créer un PaymentIntent
    const bookingSnap = await getAdminDb().collection('bookings').doc(bookingId).get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: 'Réservation introuvable' }, { status: 404 });
    }
    const bookingOwner = bookingSnap.data()?.passengerId ?? bookingSnap.data()?.userId;
    if (bookingOwner !== userId) {
      return NextResponse.json({ error: 'Accès refusé : vous n\'êtes pas le passager de cette réservation' }, { status: 403 });
    }

    const currency = getStripeCurrency();
    const result = await createRidePaymentIntent(amount, currency, userId, bookingId);

    await getAdminDb().collection('bookings').doc(bookingId).update({
      stripePaymentIntentId: result.paymentIntentId,
      paymentStatus: PAYMENT_STATUS.AUTHORIZED,
      paymentCurrency: currency,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne';
    console.error('[POST /api/stripe/payment-intent]', message);
    const status =
      message.includes('Token') ? 401 :
      message.includes('non supportée') ? 422 :
      message === 'SERVICE_UNAVAILABLE' ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// ============================================================================
// PUT — Capturer ou annuler un PaymentIntent
// ============================================================================

export async function PUT(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const body: UpdatePaymentIntentRequest = await request.json();
    const { paymentIntentId, action, captureAmount } = body;

    if (!paymentIntentId || !action) {
      return NextResponse.json({ error: 'paymentIntentId et action sont requis' }, { status: 400 });
    }

    const db = getAdminDb();

    if (action === 'capture') {
      const bookingsSnap = await db
        .collection('bookings')
        .where('stripePaymentIntentId', '==', paymentIntentId)
        .limit(1)
        .get();

      if (bookingsSnap.empty) {
        return NextResponse.json({ error: 'Réservation introuvable pour ce PaymentIntent' }, { status: 404 });
      }

      const booking = bookingsSnap.docs[0];
      const bookingData = booking.data();

      // Vérification d'ownership
      const bookingOwner = bookingData.passengerId ?? bookingData.userId;
      if (bookingOwner !== userId) {
        return NextResponse.json({ error: 'Accès refusé : vous n\'êtes pas le passager de cette réservation' }, { status: 403 });
      }

      // Idempotence : déjà capturé → répondre sans rien faire
      if (bookingData?.paymentStatus === PAYMENT_STATUS.CAPTURED) {
        return NextResponse.json({ success: true, alreadyCaptured: true });
      }

      const currency = captureAmount ? getStripeCurrency() : undefined;
      await captureRidePayment(paymentIntentId, captureAmount, currency);

      const driverId = bookingData.driverId;
      const finalAmount = captureAmount ?? bookingData.price;
      const cur = bookingData.paymentCurrency ?? getStripeCurrency();

      if (driverId && finalAmount) {
        await accumulateDriverEarnings(driverId, finalAmount, cur);
      }
      await booking.ref.update({ paymentStatus: PAYMENT_STATUS.CAPTURED, finalPrice: finalAmount });

      return NextResponse.json({ success: true, action: 'captured' });
    }

    if (action === 'cancel') {
      const bookingsSnap = await db
        .collection('bookings')
        .where('stripePaymentIntentId', '==', paymentIntentId)
        .limit(1)
        .get();

      if (bookingsSnap.empty) {
        return NextResponse.json({ error: 'Réservation introuvable pour ce PaymentIntent' }, { status: 404 });
      }

      const bookingData = bookingsSnap.docs[0].data();

      // Vérification d'ownership
      const bookingOwner = bookingData.passengerId ?? bookingData.userId;
      if (bookingOwner !== userId) {
        return NextResponse.json({ error: 'Accès refusé : vous n\'êtes pas le passager de cette réservation' }, { status: 403 });
      }

      await cancelRidePayment(paymentIntentId);
      await bookingsSnap.docs[0].ref.update({ paymentStatus: PAYMENT_STATUS.CANCELLED });

      return NextResponse.json({ success: true, action: 'cancelled' });
    }

    return NextResponse.json({ error: 'Action invalide (capture | cancel)' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur interne';
    console.error('[PUT /api/stripe/payment-intent]', message);
    const status = message === 'SERVICE_UNAVAILABLE' ? 503 : message.includes('Token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
