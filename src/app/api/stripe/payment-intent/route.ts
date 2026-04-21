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
import { z } from 'zod';

const MAX_AMOUNT = 10000;

const PostPaymentIntentSchema = z.object({
  bookingId: z.string().min(1, 'bookingId est requis'),
  amount: z.number().finite().positive('Le montant doit être positif').max(MAX_AMOUNT, 'Le montant ne peut dépasser ' + MAX_AMOUNT),
});

const PutPaymentIntentSchema = z.object({
  paymentIntentId: z.string().min(1, 'paymentIntentId est requis'),
  action: z.enum(['capture', 'cancel'], { message: 'Action invalide (capture | cancel)' }),
  captureAmount: z.number().finite().positive().max(MAX_AMOUNT).optional(),
  captureReason: z.string().trim().min(1).max(500).optional(),
});

function getStripeCurrency(): string {
  const currency = STRIPE_CURRENCY_BY_MARKET[ACTIVE_MARKET];
  if (!currency) {
    throw new Error(
      'Le marché actif (' + ACTIVE_MARKET + ') utilise une devise non supportée par Stripe.'
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
    const body = await request.json();
    const parsed = PostPaymentIntentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { bookingId, amount } = parsed.data;

    const bookingSnap = await getAdminDb().collection('bookings').doc(bookingId).get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: 'Réservation introuvable' }, { status: 404 });
    }
    const bookingOwner = bookingSnap.data()?.passengerId ?? bookingSnap.data()?.userId;
    if (bookingOwner !== userId) {
      return NextResponse.json({ error: 'Accès refusé : vous n\'êtes pas le passager de cette réservation' }, { status: 403 });
    }

    const currency = getStripeCurrency();

    const userSnap = await getAdminDb().collection('users').doc(userId).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const stripeCustomerId = userData?.stripeCustomerId ?? undefined;
    const defaultPaymentMethodId = userData?.defaultPaymentMethodId ?? undefined;

    const result = await createRidePaymentIntent(
      amount,
      currency,
      userId,
      bookingId,
      stripeCustomerId,
      defaultPaymentMethodId
    );

    await getAdminDb().collection('bookings').doc(bookingId).update({
      stripePaymentIntentId: result.paymentIntentId,
      paymentStatus: PAYMENT_STATUS.AUTHORIZED,
      paymentCurrency: currency,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[POST /api/stripe/payment-intent]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message.includes('non supportée')) {
      return NextResponse.json({ error: 'Devise non supportée' }, { status: 422 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}

// ============================================================================
// PUT — Capturer ou annuler un PaymentIntent
// ============================================================================

export async function PUT(request: NextRequest) {
  try {
    const userId = await verifyFirebaseToken(request);
    const body = await request.json();
    const parsed = PutPaymentIntentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { paymentIntentId, action, captureAmount, captureReason } = parsed.data;

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

      const bookingOwner = bookingData.userId || bookingData.passengerId;
      const bookingDriver = bookingData.driverId;
      if (bookingOwner !== userId && bookingDriver !== userId) {
        return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
      }

      // Déterminer le rôle du demandeur (admin, driver, passenger)
      const adminSnap = await db.collection('admins').doc(userId).get();
      let requestingRole: 'admin' | 'driver' | 'passenger';
      if (adminSnap.exists) {
        requestingRole = 'admin';
      } else if (bookingDriver === userId) {
        requestingRole = 'driver';
      } else {
        requestingRole = 'passenger';
      }

      if (bookingData?.paymentStatus === PAYMENT_STATUS.CAPTURED) {
        return NextResponse.json({ success: true, alreadyCaptured: true });
      }

      // C15.1 — La capture n'est autorisée qu'après la fin de la course
      const captureAllowedStatuses = ['completed', 'arrived'];
      if (!captureAllowedStatuses.includes(bookingData.status)) {
        return NextResponse.json(
          { error: 'Cannot capture before ride completion' },
          { status: 400 }
        );
      }

      const price = Number(bookingData.price);
      if (!Number.isFinite(price) || price <= 0) {
        return NextResponse.json({ error: 'Prix de la course invalide' }, { status: 400 });
      }

      // C15.2 — Un chauffeur ne peut pas modifier le captureAmount : on le force au prix initial
      let effectiveCaptureAmount = captureAmount;
      if (requestingRole === 'driver' && captureAmount !== undefined && captureAmount !== price) {
        effectiveCaptureAmount = price;
      }

      // C15.3 & C15.4 — Bornes min/max et exigence de captureReason si > prix
      if (effectiveCaptureAmount !== undefined) {
        const minAmount = Math.max(50, price * 0.5);
        const maxAmount = price * 1.15;
        if (effectiveCaptureAmount < minAmount) {
          return NextResponse.json(
            { error: 'Montant de capture trop faible (minimum 50% du prix initial)' },
            { status: 400 }
          );
        }
        if (effectiveCaptureAmount > maxAmount) {
          return NextResponse.json({ error: 'Montant de capture invalide' }, { status: 400 });
        }
        if (effectiveCaptureAmount > price && (!captureReason || captureReason.trim().length === 0)) {
          return NextResponse.json(
            { error: 'captureReason requis lorsque le montant dépasse le prix initial' },
            { status: 400 }
          );
        }
      }

      const currency = effectiveCaptureAmount ? getStripeCurrency() : undefined;
      await captureRidePayment(paymentIntentId, effectiveCaptureAmount, currency);

      const driverId = bookingData.driverId;
      const finalAmount = effectiveCaptureAmount ?? price;
      if (!finalAmount) {
        return NextResponse.json({ error: 'Montant final introuvable' }, { status: 400 });
      }
      const cur = bookingData.paymentCurrency ?? getStripeCurrency();

      if (driverId) {
        await accumulateDriverEarnings(driverId, finalAmount, cur);
      }
      await booking.ref.update({ paymentStatus: PAYMENT_STATUS.CAPTURED, finalPrice: finalAmount });

      // C15.5 — Audit log de la capture
      try {
        await db.collection('audit_logs').add({
          eventType: 'RIDE_PAYMENT_CAPTURED',
          userId,
          role: requestingRole,
          bookingId: booking.id,
          paymentIntentId,
          oldAmount: price,
          newAmount: finalAmount,
          reason: captureReason ?? null,
          level: effectiveCaptureAmount && effectiveCaptureAmount > price ? 'warning' : 'info',
          success: true,
          timestamp: new Date(),
        });
      } catch (auditErr) {
        console.error('[PUT /api/stripe/payment-intent] audit log failed', auditErr);
      }

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

      const bookingOwner = bookingData.passengerId ?? bookingData.userId;
      const bookingDriver = bookingData.driverId;
      if (bookingOwner !== userId && bookingDriver !== userId) {
        return NextResponse.json({ error: 'Accès refusé : vous n\'êtes pas autorisé à annuler cette réservation' }, { status: 403 });
      }

      await cancelRidePayment(paymentIntentId);
      await bookingsSnap.docs[0].ref.update({ paymentStatus: PAYMENT_STATUS.CANCELLED });

      return NextResponse.json({ success: true, action: 'cancelled' });
    }

    return NextResponse.json({ error: 'Action invalide (capture | cancel)' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[PUT /api/stripe/payment-intent]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}