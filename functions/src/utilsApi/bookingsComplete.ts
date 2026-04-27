/**
 * Cloud Function — bookingsComplete
 *
 * Termine une course : calcule le prix final, gère le paiement
 * (Stripe capture ou wallet), marque le booking completed et
 * libère le chauffeur — via Admin SDK.
 *
 * Migration de Next.js POST /api/bookings/complete vers onCall pour Capacitor mobile.
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import StripeConstructor from 'stripe';
import { z } from 'zod';
import { enforceRateLimit } from '../utils/rateLimiter.js';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

function getStripe() {
  const key = stripeSecretKey.value();
  if (!key) throw new HttpsError('failed-precondition', 'STRIPE_SECRET_KEY non configuré.');
  return new StripeConstructor(key, { typescript: true });
}

const MAX_PAY_AMOUNT = 100_000;

const DEFAULT_PRICING = {
  BASE_PRICE: 0,
  PRICE_PER_KM: 0,
  PRICE_PER_MINUTE: 1.00,
  PEAK_HOUR_MULTIPLIER: 1.25,
};

const MIN_RIDE_PRICE = Math.max(1, DEFAULT_PRICING.BASE_PRICE > 0 ? DEFAULT_PRICING.BASE_PRICE * 0.5 : 1);

const PEAK_HOURS = {
  MORNING_START: 7,
  MORNING_END: 9,
  EVENING_START: 16,
  EVENING_END: 19,
};

const CURRENCY_CODE = 'CAD';
const ACTIVE_MARKET = 'CA';

const STRIPE_CURRENCY_BY_MARKET: Record<string, string | null> = {
  CM: null,
  CA: 'cad',
  FR: 'eur',
  BE: 'eur',
};

const PAYMENT_STATUS = {
  PENDING: 'pending',
  AUTHORIZED: 'authorized',
  PROCESSING: 'processing',
  CAPTURED: 'captured',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  WALLET_PAID: 'wallet_paid',
} as const;

const DRIVER_SHARE_RATE = 0.70;

function toStripeAmount(amount: number, currency: string): number {
  const zeroDecimalCurrencies = ['bif', 'clp', 'gnf', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'];
  if (zeroDecimalCurrencies.includes(currency.toLowerCase())) {
    return Math.round(amount);
  }
  return Math.round(amount * 100);
}

const CompleteSchema = z.object({
  bookingId: z.string().min(1),
});

interface BookingsCompletePayload {
  bookingId?: string;
}

interface BookingsCompleteResult {
  success: boolean;
  finalPrice?: number;
  durationMinutes?: number;
  alreadyCompleted?: boolean;
  paymentFailed?: boolean;
  error?: string;
}

export const bookingsComplete = onCall(
  {
    region: 'europe-west1',
    secrets: [stripeSecretKey],
  },
  async (request: CallableRequest<BookingsCompletePayload>): Promise<BookingsCompleteResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    const uid = request.auth.uid;

    await enforceRateLimit({
      identifier: uid,
      bucket: 'utils:bookingsComplete',
      limit: 10,
      windowSec: 60,
    });

    const parsed = CompleteSchema.safeParse(request.data ?? {});
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    }
    const { bookingId } = parsed.data;

    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore();

    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();
    if (!bookingDoc.exists) {
      throw new HttpsError('not-found', 'Réservation introuvable');
    }
    const booking = bookingDoc.data()!;

    if (booking.driverId !== uid) {
      throw new HttpsError('permission-denied', 'Seul le chauffeur assigné peut terminer la course');
    }

    if (booking.status === 'completed') {
      return { success: true, alreadyCompleted: true };
    }

    const completableStatuses = ['in_progress', 'driver_arrived'];
    if (!completableStatuses.includes(booking.status)) {
      throw new HttpsError('invalid-argument', 'La course n\'est pas dans un état permettant la complétion');
    }

    const startedAt = booking.startedAt;
    const startTime = startedAt instanceof admin.firestore.Timestamp
      ? startedAt.toDate()
      : startedAt instanceof Date
        ? startedAt
        : new Date();
    const endTime = new Date();
    const durationMinutes = Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 60000));

    const carTypesSnap = await db.collection('carTypes').limit(10).get();
    const carTypeDoc = carTypesSnap.docs.find(d => d.data().name === booking.carType);
    const fallback = carTypesSnap.docs.length > 0 ? carTypesSnap.docs[0] : null;
    const ct = (carTypeDoc || fallback)?.data();

    const basePrice = ct?.basePrice ?? DEFAULT_PRICING.BASE_PRICE;
    const pricePerKm = ct?.pricePerKm ?? DEFAULT_PRICING.PRICE_PER_KM;
    const pricePerMinute = ct?.pricePerMinute ?? DEFAULT_PRICING.PRICE_PER_MINUTE;

    const bookingBonus = typeof booking.bonus === 'number' ? booking.bonus : 0;

    let finalPrice = basePrice + ((booking.distance ?? 0) * pricePerKm) + (durationMinutes * pricePerMinute);

    const hours = endTime.getHours();
    const isPeak = (hours >= PEAK_HOURS.MORNING_START && hours <= PEAK_HOURS.MORNING_END) ||
                   (hours >= PEAK_HOURS.EVENING_START && hours <= PEAK_HOURS.EVENING_END);
    if (isPeak) finalPrice *= DEFAULT_PRICING.PEAK_HOUR_MULTIPLIER;
    finalPrice = Math.round(finalPrice * 100) / 100;

    if (finalPrice < MIN_RIDE_PRICE) finalPrice = MIN_RIDE_PRICE;
    finalPrice += bookingBonus;
    finalPrice = Math.round(finalPrice * 100) / 100;
    if (finalPrice > MAX_PAY_AMOUNT) {
      throw new HttpsError('invalid-argument', 'Montant de course invalide');
    }

    let finalPaymentStatus: string;
    const currentPs = booking.paymentStatus;

    if (currentPs === PAYMENT_STATUS.CAPTURED || currentPs === 'captured') {
      finalPaymentStatus = PAYMENT_STATUS.CAPTURED;
    } else if (currentPs === PAYMENT_STATUS.WALLET_PAID || currentPs === 'wallet_paid') {
      finalPaymentStatus = PAYMENT_STATUS.WALLET_PAID;
    } else if (currentPs === PAYMENT_STATUS.PROCESSING || currentPs === 'processing') {
      throw new HttpsError('failed-precondition', 'Paiement déjà en cours de traitement');
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
          throw new HttpsError('failed-precondition', 'Paiement déjà en cours de traitement');
        }
      } else {
        const paymentMethod = booking.paymentMethod;
        let paymentFailed = false;
        let paymentErrorMessage = '';

        try {
          if (paymentMethod === 'card' && booking.stripePaymentIntentId) {
            const currency = STRIPE_CURRENCY_BY_MARKET[ACTIVE_MARKET];
            if (!currency) throw new Error('Devise non supportée');

            const price = Number(booking.price) + bookingBonus;
            const minCapture = Math.max(50, price * 0.5);
            const maxCapture = price * 1.5;
            let captureAmount = finalPrice;
            if (captureAmount < minCapture) captureAmount = minCapture;
            if (captureAmount > maxCapture) captureAmount = maxCapture;
            if (captureAmount > MAX_PAY_AMOUNT) captureAmount = MAX_PAY_AMOUNT;

            const stripeClient = getStripe();
            await stripeClient.paymentIntents.capture(
              booking.stripePaymentIntentId,
              { amount_to_capture: toStripeAmount(captureAmount, currency) },
              { idempotencyKey: `capture_${booking.stripePaymentIntentId}` },
            );

            if (booking.driverId) {
              const driverShareCents = Math.round(
                toStripeAmount(captureAmount, currency) * DRIVER_SHARE_RATE,
              );
              const driverRef = db.collection('drivers').doc(booking.driverId);
              await db.runTransaction(async (tx) => {
                const snap = await tx.get(driverRef);
                const current = snap.data()?.pendingBalanceCents ?? 0;
                tx.update(driverRef, {
                  pendingBalanceCents: current + driverShareCents,
                  currency: currency.toLowerCase(),
                });
              });
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

              tx.update(walletRef, { balance: balance - finalPrice, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
              tx.set(txRef, {
                id: txRef.id,
                userId: passengerId,
                type: 'payment',
                amount: -finalPrice,
                currency: CURRENCY_CODE,
                description: 'Paiement de course',
                bookingId,
                status: 'completed',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                paymentStatus: PAYMENT_STATUS.FAILED,
              });
              if (booking.driverId) {
                tx.update(db.collection('drivers').doc(booking.driverId), {
                  status: 'available',
                  isAvailable: true,
                  currentBookingId: null,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
              }
            });
          } catch (finalError) {
            console.error('[bookingsComplete] CRITICAL: échec mise à jour après erreur paiement', finalError);
            try { await bookingRef.update({ paymentStatus: PAYMENT_STATUS.FAILED }); } catch { /* last resort */ }
          }

          const safeError = paymentErrorMessage.includes('insuffisant')
            ? 'Solde insuffisant'
            : 'Erreur lors du paiement';
          return {
            success: false,
            paymentFailed: true,
            error: safeError,
            finalPrice,
            durationMinutes,
          };
        }
      }
    }

    await db.runTransaction(async (tx) => {
      tx.update(bookingRef, {
        status: 'completed',
        finalPrice,
        price: finalPrice,
        actualDuration: durationMinutes,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentStatus: finalPaymentStatus,
      });
      if (booking.driverId) {
        tx.update(db.collection('drivers').doc(booking.driverId), {
          status: 'available',
          isAvailable: true,
          currentBookingId: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch { /* non-critical */ }

    return { success: true, finalPrice, durationMinutes };
  },
);
