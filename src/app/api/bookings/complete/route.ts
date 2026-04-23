/**
 * API Route — Terminer une course (côté serveur)
 * POST /api/bookings/complete
 *
 * Délégation serveur de completeTrip : calcule le prix final, gère le
 * paiement (Stripe capture ou wallet), marque le booking completed et
 * libère le chauffeur — le tout via Admin SDK (contourne les Firestore
 * rules qui bloquent les écritures client-side sur les champs financiers).
 *
 * @module app/api/bookings/complete
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseToken, getAdminDb } from '@/lib/admin-guard';
import { captureRidePayment } from '@/services/stripe-payment.service';
import { accumulateDriverEarnings } from '@/services/stripe-connect.service';
import { DEFAULT_PRICING, CURRENCY_CODE, PEAK_HOURS, ACTIVE_MARKET } from '@/utils/constants';
import { PAYMENT_STATUS, STRIPE_CURRENCY_BY_MARKET } from '@/types/stripe';
import { z } from 'zod';

export const runtime = 'nodejs';

const MAX_PAY_AMOUNT = 100_000;
const MIN_RIDE_PRICE = Math.max(1, DEFAULT_PRICING.BASE_PRICE > 0 ? DEFAULT_PRICING.BASE_PRICE * 0.5 : 1);

const CompleteSchema = z.object({
  bookingId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const uid = await verifyFirebaseToken(request);
    const body = await request.json();
    const parsed = CompleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { bookingId } = parsed.data;
    const db = getAdminDb();

    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();
    if (!bookingDoc.exists) {
      return NextResponse.json({ error: 'Réservation introuvable' }, { status: 404 });
    }
    const booking = bookingDoc.data()!;

    if (booking.driverId !== uid) {
      return NextResponse.json({ error: 'Seul le chauffeur assigné peut terminer la course' }, { status: 403 });
    }

    if (booking.status === 'completed') {
      return NextResponse.json({ success: true, alreadyCompleted: true });
    }

    const completableStatuses = ['in_progress', 'driver_arrived'];
    if (!completableStatuses.includes(booking.status)) {
      return NextResponse.json({ error: 'La course n\'est pas dans un état permettant la complétion' }, { status: 400 });
    }

    const startedAt = booking.startedAt;
    let startTime: Date;
    if (startedAt && typeof (startedAt as any).toDate === 'function') {
      startTime = (startedAt as any).toDate();
    } else if (startedAt instanceof Date) {
      startTime = startedAt;
    } else {
      startTime = new Date();
    }
    const endTime = new Date();
    const durationMinutes = Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 60000));

    const carTypesSnap = await db.collection('carTypes').limit(10).get();
    const carTypeDoc = carTypesSnap.docs.find(d => d.data().name === booking.carType);
    const fallback = carTypesSnap.docs.length > 0 ? carTypesSnap.docs[0] : null;
    const ct = (carTypeDoc || fallback)?.data();

    const basePrice = ct?.basePrice ?? DEFAULT_PRICING.BASE_PRICE;
    const pricePerKm = ct?.pricePerKm ?? DEFAULT_PRICING.PRICE_PER_KM;
    const pricePerMinute = ct?.pricePerMinute ?? DEFAULT_PRICING.PRICE_PER_MINUTE;

    let finalPrice = basePrice + ((booking.distance ?? 0) * pricePerKm) + (durationMinutes * pricePerMinute);

    const hours = endTime.getHours();
    const isPeak = (hours >= PEAK_HOURS.MORNING_START && hours <= PEAK_HOURS.MORNING_END) ||
                   (hours >= PEAK_HOURS.EVENING_START && hours <= PEAK_HOURS.EVENING_END);
    if (isPeak) finalPrice *= DEFAULT_PRICING.PEAK_HOUR_MULTIPLIER;
    finalPrice = Math.round(finalPrice * 100) / 100;

    if (finalPrice < MIN_RIDE_PRICE) finalPrice = MIN_RIDE_PRICE;
    if (finalPrice > MAX_PAY_AMOUNT) {
      return NextResponse.json({ error: 'Montant de course invalide' }, { status: 400 });
    }

    let finalPaymentStatus: string;
    const currentPs = booking.paymentStatus;

    if (currentPs === PAYMENT_STATUS.CAPTURED || currentPs === 'captured') {
      finalPaymentStatus = PAYMENT_STATUS.CAPTURED;
    } else if (currentPs === PAYMENT_STATUS.WALLET_PAID || currentPs === 'wallet_paid') {
      finalPaymentStatus = PAYMENT_STATUS.WALLET_PAID;
    } else if (currentPs === PAYMENT_STATUS.PROCESSING || currentPs === 'processing') {
      return NextResponse.json({ error: 'Paiement déjà en cours de traitement' }, { status: 409 });
    } else {
      const locked = await db.runTransaction(async (tx) => {
        const snap = await tx.get(bookingRef);
        const ps = snap.data()?.paymentStatus;
        if (ps === PAYMENT_STATUS.CAPTURED || ps === PAYMENT_STATUS.WALLET_PAID || ps === PAYMENT_STATUS.PROCESSING) {
          return ps as string;
        }
        tx.update(bookingRef, { paymentStatus: PAYMENT_STATUS.PROCESSING });
        return 'acquired';
      });

      if (locked !== 'acquired') {
        if (locked === PAYMENT_STATUS.CAPTURED || locked === 'captured') {
          finalPaymentStatus = PAYMENT_STATUS.CAPTURED;
        } else if (locked === PAYMENT_STATUS.WALLET_PAID || locked === 'wallet_paid') {
          finalPaymentStatus = PAYMENT_STATUS.WALLET_PAID;
        } else {
          return NextResponse.json({ error: 'Paiement déjà en cours de traitement' }, { status: 409 });
        }
      } else {
        const paymentMethod = booking.paymentMethod;
        let paymentFailed = false;
        let paymentErrorMessage = '';

        try {
          if (paymentMethod === 'card' && booking.stripePaymentIntentId) {
            const currency = STRIPE_CURRENCY_BY_MARKET[ACTIVE_MARKET];
            if (!currency) throw new Error('Devise non supportée');

            const price = Number(booking.price);
            const minCapture = Math.max(50, price * 0.5);
            const maxCapture = price * 1.5;
            let captureAmount = finalPrice;
            if (captureAmount < minCapture) captureAmount = minCapture;
            if (captureAmount > maxCapture) captureAmount = maxCapture;
            if (captureAmount > MAX_PAY_AMOUNT) captureAmount = MAX_PAY_AMOUNT;

            await captureRidePayment(booking.stripePaymentIntentId, captureAmount, currency);

            if (booking.driverId) {
              await accumulateDriverEarnings(booking.driverId, captureAmount, currency);
            }
            finalPaymentStatus = PAYMENT_STATUS.CAPTURED;
          } else {
            const passengerId = booking.userId || booking.passengerId;
            if (!passengerId) throw new Error('Passager introuvable');

            const walletRef = db.collection('wallets').doc(passengerId);
            const txRef = db.collection('transactions').doc();

            await db.runTransaction(async (tx) => {
              const walletDoc = await tx.get(walletRef);
              if (!walletDoc.exists) throw new Error('Portefeuille introuvable');
              const balance = walletDoc.data()?.balance ?? 0;
              if (balance < finalPrice) throw new Error('Solde insuffisant');

              tx.update(walletRef, { balance: balance - finalPrice, updatedAt: FieldValue.serverTimestamp() });
              tx.set(txRef, {
                id: txRef.id,
                userId: passengerId,
                type: 'payment',
                amount: -finalPrice,
                currency: CURRENCY_CODE,
                description: 'Paiement de course',
                bookingId,
                status: 'completed',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              });
            });
            finalPaymentStatus = PAYMENT_STATUS.WALLET_PAID;
          }
        } catch (payError) {
          paymentFailed = true;
          paymentErrorMessage = payError instanceof Error ? payError.message : 'Erreur paiement';
          finalPaymentStatus = PAYMENT_STATUS.FAILED;
        }

        if (paymentFailed) {
          try {
            await db.runTransaction(async (tx) => {
              tx.update(bookingRef, {
                status: 'completed',
                finalPrice,
                price: finalPrice,
                actualDuration: durationMinutes,
                completedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                paymentStatus: PAYMENT_STATUS.FAILED,
              });
              if (booking.driverId) {
                tx.update(db.collection('drivers').doc(booking.driverId), {
                  status: 'available',
                  isAvailable: true,
                  currentBookingId: null,
                  updatedAt: FieldValue.serverTimestamp(),
                });
              }
            });
          } catch (finalError) {
            console.error('[POST /api/bookings/complete] CRITICAL: échec mise à jour après erreur paiement', finalError);
            try { await bookingRef.update({ paymentStatus: PAYMENT_STATUS.FAILED }); } catch { /* last resort */ }
          }

          const safeError = paymentErrorMessage.includes('insuffisant')
            ? 'Solde insuffisant'
            : 'Erreur lors du paiement';
          return NextResponse.json({
            success: false,
            paymentFailed: true,
            error: safeError,
            finalPrice,
            durationMinutes,
          }, { status: 201 });
        }
      }
    }

    await db.runTransaction(async (tx) => {
      tx.update(bookingRef, {
        status: 'completed',
        finalPrice,
        price: finalPrice,
        actualDuration: durationMinutes,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        paymentStatus: finalPaymentStatus,
      });
      if (booking.driverId) {
        tx.update(db.collection('drivers').doc(booking.driverId), {
          status: 'available',
          isAvailable: true,
          currentBookingId: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    try {
      await db.collection('audit_logs').add({
        eventType: 'RIDE_COMPLETED',
        action: 'RIDE_COMPLETED',
        userId: uid,
        bookingId,
        finalPrice,
        durationMinutes,
        paymentMethod: booking.paymentMethod ?? 'wallet',
        paymentStatus: finalPaymentStatus,
        timestamp: FieldValue.serverTimestamp(),
      });
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true, finalPrice, durationMinutes }, { status: 201 });

  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    console.error('[POST /api/bookings/complete]', message);
    if (message.includes('Token') || message.includes('auth')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if (message === 'SERVICE_UNAVAILABLE') {
      return NextResponse.json({ error: 'Service temporairement indisponible' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 });
  }
}
