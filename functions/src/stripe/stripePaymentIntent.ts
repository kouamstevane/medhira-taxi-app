import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { z } from 'zod';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { DRIVER_SHARE_RATE } from '../config/stripe.js';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

let _stripe: InstanceType<typeof Stripe> | null = null;
function getStripe(): InstanceType<typeof Stripe> {
  if (!_stripe) {
    _stripe = new Stripe(stripeSecretKey.value(), { apiVersion: '2026-03-25.dahlia' });
  }
  return _stripe;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

const CURRENCY = 'cad';
const MAX_AMOUNT = 10000;

const DEFAULT_PRICING = {
  BASE_PRICE: 0,
  PRICE_PER_KM: 0,
  PRICE_PER_MINUTE: 1.00,
  PEAK_HOUR_MULTIPLIER: 1.25,
};

const MIN_RIDE_PRICE = Math.max(1, DEFAULT_PRICING.BASE_PRICE > 0 ? DEFAULT_PRICING.BASE_PRICE * 0.5 : 1);

const ZERO_DECIMAL = ['bif', 'clp', 'gnf', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'];
function toStripeAmount(amount: number, cur: string): number {
  return ZERO_DECIMAL.includes(cur.toLowerCase()) ? Math.round(amount) : Math.round(amount * 100);
}

const PAYMENT_STATUS = {
  AUTHORIZED: 'authorized',
  CAPTURED: 'captured',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
} as const;

const InputSchema = z.object({
  action: z.enum(['create', 'capture', 'cancel']),
  bookingId: z.string().min(1).optional(),
  amount: z.number().finite().positive().max(MAX_AMOUNT).optional(),
  paymentIntentId: z.string().min(1).optional(),
  captureAmount: z.number().finite().positive().max(MAX_AMOUNT).optional(),
  captureReason: z.string().trim().min(1).max(500).optional(),
});

async function accumulateDriverEarnings(driverId: string, rideAmount: number, currency: string): Promise<void> {
  const driverShareCents = Math.round(toStripeAmount(rideAmount, currency) * DRIVER_SHARE_RATE);
  const driverRef = getDb().collection('drivers').doc(driverId);
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(driverRef);
    const current = snap.data()?.pendingBalanceCents ?? 0;
    tx.update(driverRef, {
      pendingBalanceCents: current + driverShareCents,
      currency: currency.toLowerCase(),
    });
  });
}

export const stripePaymentIntent = onCall(
  { region: 'europe-west1', secrets: [stripeSecretKey] },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    const uid = request.auth.uid;

    await enforceRateLimit({
      identifier: uid,
      bucket: 'stripe:stripePaymentIntent',
      limit: 20,
      windowSec: 60,
    });

    const parsed = InputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    }
    const { action } = parsed.data;

    try {
      if (action === 'create') {
        const { bookingId, amount } = parsed.data;
        if (!bookingId) throw new HttpsError('invalid-argument', 'bookingId est requis');
        if (!amount) throw new HttpsError('invalid-argument', 'amount est requis');

        const db = getDb();
        const bookingSnap = await db.collection('bookings').doc(bookingId).get();
        if (!bookingSnap.exists) throw new HttpsError('not-found', 'Réservation introuvable');

        const bookingOwner = bookingSnap.data()?.passengerId ?? bookingSnap.data()?.userId;
        if (bookingOwner !== uid) {
          throw new HttpsError('permission-denied', "Accès refusé : vous n'êtes pas le passager de cette réservation");
        }

        const bookingRaw = bookingSnap.data()!;
        const bookingPrice = (bookingRaw.price ?? 0) + (bookingRaw.bonus ?? 0);
        if (typeof bookingPrice !== 'number' || !Number.isFinite(bookingPrice) || bookingPrice <= 0) {
          throw new HttpsError('invalid-argument', 'Prix de la réservation invalide');
        }
        if (bookingPrice < MIN_RIDE_PRICE) {
          throw new HttpsError('invalid-argument', 'Prix de la réservation en dessous du minimum');
        }
        if (Math.abs(amount - bookingPrice) > 0.01) {
          throw new HttpsError('invalid-argument', 'Le montant ne correspond pas au prix de la réservation');
        }

        const userSnap = await db.collection('users').doc(uid).get();
        const userData = userSnap.exists ? userSnap.data() : {};
        const stripeCustomerId = userData?.stripeCustomerId ?? undefined;
        const defaultPaymentMethodId = userData?.defaultPaymentMethodId ?? undefined;

        const stripeClient = getStripe();
        let paymentIntent: Awaited<ReturnType<typeof stripeClient.paymentIntents.create>>;

        if (stripeCustomerId && defaultPaymentMethodId) {
          try {
            paymentIntent = await stripeClient.paymentIntents.create(
              {
                amount: toStripeAmount(amount, CURRENCY),
                currency: CURRENCY.toLowerCase(),
                capture_method: 'manual',
                metadata: { purpose: 'taxi_ride', userId: uid, bookingId },
                description: `Course taxi #${bookingId}`,
                automatic_payment_methods: { enabled: true },
                setup_future_usage: 'off_session',
                customer: stripeCustomerId,
                payment_method: defaultPaymentMethodId,
                confirm: true,
                off_session: true,
                return_url: 'https://medjira.app/taxi/confirmation',
              },
              { idempotencyKey: `pi_${bookingId}_${toStripeAmount(amount, CURRENCY)}_taxi_ride` },
            );
          } catch (stripeErr: unknown) {
            if (stripeErr instanceof Stripe.errors.StripeError) {
              console.error('[stripePaymentIntent] Stripe error', {
                type: stripeErr.type,
                code: stripeErr.code,
                statusCode: stripeErr.statusCode,
                message: stripeErr.message,
                requestId: stripeErr.requestId,
              });
              throw new HttpsError('internal', `Stripe error: ${stripeErr.message}`);
            }
            console.error('[stripePaymentIntent] Non-Stripe error during PI create', stripeErr);
            throw new HttpsError('internal', 'Échec de la création du PaymentIntent');
          }
        } else {
          try {
            paymentIntent = await stripeClient.paymentIntents.create(
              {
                amount: toStripeAmount(amount, CURRENCY),
                currency: CURRENCY.toLowerCase(),
                capture_method: 'manual',
                metadata: { purpose: 'taxi_ride', userId: uid, bookingId },
                description: `Course taxi #${bookingId}`,
                automatic_payment_methods: { enabled: true },
                setup_future_usage: 'off_session',
              },
              { idempotencyKey: `pi_${bookingId}_${toStripeAmount(amount, CURRENCY)}_taxi_ride` },
            );
          } catch (stripeErr: unknown) {
            if (stripeErr instanceof Stripe.errors.StripeError) {
              console.error('[stripePaymentIntent] Stripe error', {
                type: stripeErr.type,
                code: stripeErr.code,
                statusCode: stripeErr.statusCode,
                message: stripeErr.message,
                requestId: stripeErr.requestId,
              });
              throw new HttpsError('internal', `Stripe error: ${stripeErr.message}`);
            }
            console.error('[stripePaymentIntent] Non-Stripe error during PI create', stripeErr);
            throw new HttpsError('internal', 'Échec de la création du PaymentIntent');
          }
        }

        if (!paymentIntent.client_secret) {
          throw new HttpsError('internal', 'Impossible de créer le PaymentIntent : client_secret manquant.');
        }

        await db.collection('bookings').doc(bookingId).update({
          stripePaymentIntentId: paymentIntent.id,
          paymentStatus: PAYMENT_STATUS.AUTHORIZED,
          paymentCurrency: CURRENCY,
        });

        return {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount,
          currency: CURRENCY,
        };
      }

      if (action === 'capture') {
        const { paymentIntentId, captureAmount, captureReason } = parsed.data;
        if (!paymentIntentId) throw new HttpsError('invalid-argument', 'paymentIntentId est requis');

        const db = getDb();
        const bookingsSnap = await db
          .collection('bookings')
          .where('stripePaymentIntentId', '==', paymentIntentId)
          .limit(1)
          .get();

        if (bookingsSnap.empty) throw new HttpsError('not-found', 'Réservation introuvable pour ce PaymentIntent');

        const booking = bookingsSnap.docs[0];
        const bookingData = booking.data();
        const bookingOwner = bookingData.userId || bookingData.passengerId;
        const bookingDriver = bookingData.driverId;
        if (bookingOwner !== uid && bookingDriver !== uid) {
          throw new HttpsError('permission-denied', 'Non autorisé');
        }

        const adminSnap = await db.collection('admins').doc(uid).get();
        let requestingRole: 'admin' | 'driver' | 'passenger';
        if (adminSnap.exists) {
          requestingRole = 'admin';
        } else if (bookingDriver === uid) {
          requestingRole = 'driver';
        } else {
          requestingRole = 'passenger';
        }

        if (bookingData?.paymentStatus === PAYMENT_STATUS.CAPTURED) {
          return { success: true, alreadyCaptured: true };
        }

        const captureAllowedStatuses = ['completed', 'arrived'];
        if (!captureAllowedStatuses.includes(bookingData.status)) {
          throw new HttpsError('invalid-argument', 'Cannot capture before ride completion');
        }

        const price = Number(bookingData.price);
        if (!Number.isFinite(price) || price <= 0) {
          throw new HttpsError('invalid-argument', 'Prix de la course invalide');
        }

        let effectiveCaptureAmount = captureAmount;
        if (requestingRole === 'driver' && captureAmount !== undefined && captureAmount !== price) {
          effectiveCaptureAmount = price;
        }

        if (effectiveCaptureAmount !== undefined) {
          const minAmount = Math.max(50, price * 0.5);
          const maxAmount = price * 1.15;
          if (effectiveCaptureAmount < minAmount) {
            throw new HttpsError('invalid-argument', 'Montant de capture trop faible (minimum 50% du prix initial)');
          }
          if (effectiveCaptureAmount > maxAmount) {
            throw new HttpsError('invalid-argument', 'Montant de capture invalide');
          }
          if (effectiveCaptureAmount > price && (!captureReason || captureReason.trim().length === 0)) {
            throw new HttpsError('invalid-argument', 'captureReason requis lorsque le montant dépasse le prix initial');
          }
        }

        const captureParams = effectiveCaptureAmount
          ? { amount_to_capture: toStripeAmount(effectiveCaptureAmount, CURRENCY) }
          : undefined;

        await getStripe().paymentIntents.capture(paymentIntentId, captureParams, {
          idempotencyKey: `capture_${paymentIntentId}`,
        });

        const driverId = bookingData.driverId;
        const finalAmount = effectiveCaptureAmount ?? price;
        if (!finalAmount) throw new HttpsError('invalid-argument', 'Montant final introuvable');
        const cur = bookingData.paymentCurrency ?? CURRENCY;

        if (driverId) {
          await getDb().runTransaction(async (tx) => {
            await accumulateDriverEarnings(driverId, finalAmount, cur);
            tx.update(booking.ref, { paymentStatus: PAYMENT_STATUS.CAPTURED, finalPrice: finalAmount });
          });
        } else {
          await booking.ref.update({ paymentStatus: PAYMENT_STATUS.CAPTURED, finalPrice: finalAmount });
        }

        try {
          await db.collection('audit_logs').add({
            eventType: 'RIDE_PAYMENT_CAPTURED',
            userId: uid,
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
          console.error('[stripePaymentIntent] audit log failed', auditErr);
        }

        return { success: true, action: 'captured' };
      }

      if (action === 'cancel') {
        const { paymentIntentId } = parsed.data;
        if (!paymentIntentId) throw new HttpsError('invalid-argument', 'paymentIntentId est requis');

        const db = getDb();
        const bookingsSnap = await db
          .collection('bookings')
          .where('stripePaymentIntentId', '==', paymentIntentId)
          .limit(1)
          .get();

        if (bookingsSnap.empty) throw new HttpsError('not-found', 'Réservation introuvable pour ce PaymentIntent');

        const bookingData = bookingsSnap.docs[0].data();
        const bookingOwner = bookingData.passengerId ?? bookingData.userId;
        const bookingDriver = bookingData.driverId;
        if (bookingOwner !== uid && bookingDriver !== uid) {
          throw new HttpsError('permission-denied', "Accès refusé : vous n'êtes pas autorisé à annuler cette réservation");
        }

        await getStripe().paymentIntents.cancel(paymentIntentId, undefined, {
          idempotencyKey: `cancel_${paymentIntentId}`,
        });
        await bookingsSnap.docs[0].ref.update({ paymentStatus: PAYMENT_STATUS.CANCELLED });

        return { success: true, action: 'cancelled' };
      }

      throw new HttpsError('invalid-argument', 'Action invalide');
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const message = err instanceof Error ? err.message : '';
      console.error('[stripePaymentIntent]', message);
      throw new HttpsError('internal', 'Une erreur est survenue. Veuillez réessayer.');
    }
  },
);
