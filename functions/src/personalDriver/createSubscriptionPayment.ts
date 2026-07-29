import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import type Stripe from 'stripe';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DEFAULT_CURRENCY } from '../config/stripe.js';
import { createStripeClient } from '../stripe/stripe-client.js';
import {
  calculatePersonalDriverPrices,
  type PersonalDriverPlanId,
  type PersonalDriverWeekday,
} from './pricing.js';
import { buildPersonalDriverTripDrafts } from './schedule.js';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const CURRENCY = DEFAULT_CURRENCY;
const MAX_AMOUNT = 10000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PAYMENT_CREATION_CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

let stripe: InstanceType<typeof Stripe> | null = null;

function getStripe(): InstanceType<typeof Stripe> {
  if (!stripe) {
    stripe = createStripeClient(stripeSecretKey.value().trim());
  }
  return stripe;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function createSubscriptionId(userId: string, requestId: string): string {
  return createHash('sha256')
    .update(userId)
    .update('\0')
    .update(requestId)
    .digest('hex');
}

const inputSchema = z.object({
  selectedPlanId: z.enum(['basic', 'classic', 'premium']),
  requestId: z.string().trim().min(1, 'Identifiant de demande requis').max(128, 'Identifiant de demande trop long'),
  pickupAddress: z.string().trim().min(3).max(500),
  destinationAddress: z.string().trim().min(3).max(500),
  tripType: z.enum(['one_way', 'round_trip']),
  selectedWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7)
    .refine((weekdays) => new Set(weekdays).size === weekdays.length, 'Les jours sélectionnés doivent être uniques'),
  departureTime: z.string().trim().regex(TIME_PATTERN, 'Heure de départ invalide'),
  returnTime: z.string().trim().regex(TIME_PATTERN, 'Heure de retour invalide').optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate, 'Date de début invalide'),
  distanceOneWayKm: z.number().finite().positive().max(1000),
  distanceReturnKm: z.number().finite().nonnegative().max(1000),
  monthlyDistanceKm: z.number().finite().positive().max(100000),
  passengerCount: z.number().int().min(1).max(8),
  notes: z.string().trim().max(1000).optional(),
}).superRefine((data, context) => {
  if (data.tripType === 'round_trip' && !data.returnTime) {
    context.addIssue({ code: 'custom', path: ['returnTime'], message: 'Heure de retour requise pour un aller-retour' });
  }
  if (data.tripType === 'one_way' && data.distanceReturnKm !== 0) {
    context.addIssue({ code: 'custom', path: ['distanceReturnKm'], message: 'La distance retour doit être nulle pour un aller simple' });
  }
  if (data.tripType === 'round_trip' && data.distanceReturnKm <= 0) {
    context.addIssue({ code: 'custom', path: ['distanceReturnKm'], message: 'Distance retour requise pour un aller-retour' });
  }
});

interface CreateSubscriptionPaymentResult {
  subscriptionId: string;
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
}

interface UserPaymentProfile {
  stripeCustomerId?: string;
  defaultPaymentMethodId?: string;
}

interface SubscriptionPaymentClaim {
  isCreator: boolean;
  data?: FirebaseFirestore.DocumentData;
  paymentCreationAttempt?: number;
}

function getPaymentCreationAttempt(data: FirebaseFirestore.DocumentData | undefined): number {
  const attempt = data?.paymentCreationAttempt;
  return typeof attempt === 'number' && Number.isSafeInteger(attempt) && attempt > 0 ? attempt : 1;
}

function isPaymentCreationClaimStale(data: FirebaseFirestore.DocumentData, now: Date): boolean {
  const claimedAt = data.paymentCreationClaimedAt;
  const claimedAtDate = claimedAt instanceof Date
    ? claimedAt
    : claimedAt && typeof claimedAt.toDate === 'function'
      ? claimedAt.toDate()
      : null;
  return !claimedAtDate || now.getTime() - claimedAtDate.getTime() >= PAYMENT_CREATION_CLAIM_TIMEOUT_MS;
}

function getPaymentCreationError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Erreur inconnue lors de la création du paiement.';
}

async function getUserPaymentProfile(
  db: FirebaseFirestore.Firestore,
  userId: string,
): Promise<UserPaymentProfile> {
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) return {};
  const userData = userSnap.data();
  return {
    stripeCustomerId: typeof userData?.stripeCustomerId === 'string' ? userData.stripeCustomerId : undefined,
    defaultPaymentMethodId:
      typeof userData?.defaultPaymentMethodId === 'string' ? userData.defaultPaymentMethodId : undefined,
  };
}

async function markPaymentCreationFailed(
  db: FirebaseFirestore.Firestore,
  subscriptionRef: FirebaseFirestore.DocumentReference,
  paymentCreationClaimId: string,
  error: unknown,
  advancePaymentCreationAttempt: boolean,
): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const subscription = await transaction.get(subscriptionRef);
    if (!subscription.exists) return;

    const data = subscription.data();
    if (
      !data
      || data.paymentStatus !== 'creating_payment'
      || data.paymentCreationClaimId !== paymentCreationClaimId
    ) {
      return;
    }

    transaction.update(subscriptionRef, {
      paymentStatus: 'payment_creation_failed',
      paymentCreationFailedAt: new Date(),
      paymentCreationError: getPaymentCreationError(error),
      paymentCreationAttempt: getPaymentCreationAttempt(data) + (advancePaymentCreationAttempt ? 1 : 0),
    });
  });
}

export const createPersonalDriverSubscriptionPayment = onCall(
  { region: 'europe-west1', secrets: [stripeSecretKey] },
  async (request: CallableRequest<unknown>): Promise<CreateSubscriptionPaymentResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    const userId = request.auth.uid;

    const parsed = inputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    }

    const input = parsed.data;
    const selectedWeekdays = input.selectedWeekdays as PersonalDriverWeekday[];
    const selectedPlanId = input.selectedPlanId as PersonalDriverPlanId;
    if (selectedPlanId === 'basic' && selectedWeekdays.some((weekday) => weekday === 0 || weekday === 6)) {
      throw new HttpsError('invalid-argument', 'Le forfait Basic est disponible du lundi au vendredi uniquement.');
    }

    const priceComparison = calculatePersonalDriverPrices({
      monthlyDistanceKm: input.monthlyDistanceKm,
      requestedWeekdays: selectedWeekdays,
    });
    const selectedPlanPrice = priceComparison.plans[selectedPlanId];
    if (!selectedPlanPrice.isEligible) {
      throw new HttpsError('invalid-argument', 'Le forfait sélectionné ne couvre pas les jours demandés.');
    }

    const taxAmount = 0;
    const amount = toMoney(selectedPlanPrice.totalBeforeTax + taxAmount);
    if (amount > MAX_AMOUNT) {
      throw new HttpsError('invalid-argument', `Montant maximum : ${MAX_AMOUNT}`);
    }

    const db = getDb();
    const subscriptionRef = db.collection('personal_driver_subscriptions')
      .doc(createSubscriptionId(request.auth.uid, input.requestId));
    const subscriptionId = subscriptionRef.id;
    const paymentCreationClaimId = randomUUID();
    const paymentCreationClaimedAt = new Date();
    const subscriptionClaim = await db.runTransaction<SubscriptionPaymentClaim>(async (transaction) => {
      const existingSubscription = await transaction.get(subscriptionRef);
      if (existingSubscription.exists) {
        const existingData = existingSubscription.data();
        if (!existingData) {
          return { isCreator: false };
        }

        const canReclaim = existingData.paymentStatus === 'payment_creation_failed'
          || (
            existingData.paymentStatus === 'creating_payment'
            && isPaymentCreationClaimStale(existingData, paymentCreationClaimedAt)
          );
        if (!canReclaim) {
          return { isCreator: false, data: existingData };
        }

        const paymentCreationAttempt = getPaymentCreationAttempt(existingData);
        transaction.update(subscriptionRef, {
          paymentStatus: 'creating_payment',
          paymentCreationClaimId,
          paymentCreationClaimedAt,
          paymentCreationError: null,
        });
        return { isCreator: true, paymentCreationAttempt };
      }

      transaction.create(subscriptionRef, {
        id: subscriptionId,
        userId,
        status: 'pending_payment',
        paymentStatus: 'creating_payment',
        paymentCreationClaimId,
        paymentCreationClaimedAt,
        paymentCreationAttempt: 1,
        createdAt: new Date(),
      });
      return { isCreator: true, paymentCreationAttempt: 1 };
    });

    if (!subscriptionClaim.isCreator) {
      const existingData = subscriptionClaim.data;
      if (!existingData || existingData.userId !== request.auth.uid) {
        throw new HttpsError('internal', 'Impossible de récupérer le paiement existant.');
      }

      if (existingData.paymentStatus === 'creating_payment') {
        throw new HttpsError('aborted', 'Création du paiement en cours. Veuillez réessayer.');
      }

      if (!existingData.stripePaymentIntentId) {
        throw new HttpsError('internal', 'Impossible de récupérer le paiement existant.');
      }

      const existingPaymentIntent = await getStripe().paymentIntents.retrieve(existingData.stripePaymentIntentId);
      if (!existingPaymentIntent.client_secret) {
        throw new HttpsError('internal', 'Impossible de récupérer le PaymentIntent existant.');
      }

      return {
        subscriptionId,
        paymentIntentId: existingPaymentIntent.id,
        clientSecret: existingPaymentIntent.client_secret,
        amount: existingData.totalAmount,
        currency: existingData.currency,
      };
    }

    const amountInSmallestUnit = Math.round(amount * 100);
    const paymentCreationAttempt = subscriptionClaim.paymentCreationAttempt ?? 1;
    const userPaymentProfile = await getUserPaymentProfile(db, request.auth.uid);
    const paymentIntent = await getStripe().paymentIntents.create(
      {
        amount: amountInSmallestUnit,
        currency: CURRENCY,
        capture_method: 'automatic',
        ...(userPaymentProfile.stripeCustomerId ? { customer: userPaymentProfile.stripeCustomerId } : {}),
        setup_future_usage: 'off_session',
        metadata: {
          purpose: 'personal_driver_subscription',
          subscriptionId,
          userId: request.auth.uid,
        },
        description: `Abonnement chauffeur personnel #${subscriptionId}`,
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: `personal_driver_subscription_${subscriptionId}_${paymentCreationAttempt}` },
    ).catch(async (error) => {
      try {
        await markPaymentCreationFailed(db, subscriptionRef, paymentCreationClaimId, error, false);
      } catch (markError) {
        console.error('[createPersonalDriverSubscriptionPayment] Failed to mark PaymentIntent creation failure', {
          subscriptionId,
          error: markError instanceof Error ? markError.message : markError,
        });
      }
      throw new HttpsError('internal', 'Impossible de créer le PaymentIntent.');
    });
    if (!paymentIntent.client_secret) {
      await markPaymentCreationFailed(
        db,
        subscriptionRef,
        paymentCreationClaimId,
        new Error('PaymentIntent client_secret missing'),
        false,
      );
      throw new HttpsError('internal', 'Impossible de créer le PaymentIntent : client_secret manquant.');
    }

    const trips = buildPersonalDriverTripDrafts({
      subscriptionId,
      userId: request.auth.uid,
      startDate: input.startDate,
      selectedWeekdays,
      tripType: input.tripType,
      departureTime: input.departureTime,
      returnTime: input.returnTime,
      pickupAddress: input.pickupAddress,
      destinationAddress: input.destinationAddress,
      planId: selectedPlanId,
    });
    const batch = db.batch();
    batch.set(subscriptionRef, {
      id: subscriptionId,
      userId: request.auth.uid,
      status: 'pending_payment',
      selectedPlanId,
      pickupAddress: input.pickupAddress,
      destinationAddress: input.destinationAddress,
      tripType: input.tripType,
      selectedWeekdays,
      departureTime: input.departureTime,
      returnTime: input.returnTime ?? null,
      startDate: input.startDate,
      distanceOneWayKm: input.distanceOneWayKm,
      distanceReturnKm: input.distanceReturnKm,
      monthlyDistanceKm: input.monthlyDistanceKm,
      passengerCount: input.passengerCount,
      notes: input.notes ?? null,
      selectedPlanPrice,
      priceComparison,
      taxAmount,
      totalAmount: amount,
      currency: CURRENCY,
      stripePaymentIntentId: paymentIntent.id,
      stripeCustomerId: userPaymentProfile.stripeCustomerId ?? null,
      defaultPaymentMethodId: userPaymentProfile.defaultPaymentMethodId ?? null,
      paymentStatus: 'authorized',
      createdAt: new Date(),
    });
    trips.forEach((trip, index) => {
      batch.set(db.collection('personal_driver_trips').doc(`${subscriptionId}_${index}`), {
        ...trip,
        createdAt: new Date(),
      });
    });
    try {
      await batch.commit();
    } catch (error) {
      let paymentIntentIsOrphaned = false;
      try {
        const persistedSubscription = await subscriptionRef.get();
        paymentIntentIsOrphaned = !persistedSubscription.exists
          || persistedSubscription.data()?.stripePaymentIntentId !== paymentIntent.id;
      } catch (verificationError) {
        console.error('[createPersonalDriverSubscriptionPayment] Failed to verify subscription after batch commit failure', {
          paymentIntentId: paymentIntent.id,
          error: verificationError instanceof Error ? verificationError.message : verificationError,
        });
      }

      if (paymentIntentIsOrphaned) {
        let paymentIntentWasCancelled = false;
        try {
          await getStripe().paymentIntents.cancel(paymentIntent.id, undefined, {
            idempotencyKey: `cancel_personal_driver_subscription_${paymentIntent.id}`,
          });
          paymentIntentWasCancelled = true;
        } catch (cancelError) {
          console.error('[createPersonalDriverSubscriptionPayment] Failed to cancel orphaned PaymentIntent', {
            paymentIntentId: paymentIntent.id,
            error: cancelError instanceof Error ? cancelError.message : cancelError,
          });
        }
        try {
          await markPaymentCreationFailed(
            db,
            subscriptionRef,
            paymentCreationClaimId,
            error,
            paymentIntentWasCancelled,
          );
        } catch (markError) {
          console.error('[createPersonalDriverSubscriptionPayment] Failed to mark subscription persistence failure', {
            subscriptionId,
            error: markError instanceof Error ? markError.message : markError,
          });
        }
      }
      throw new HttpsError('internal', 'Impossible d’enregistrer l’abonnement.');
    }

    return {
      subscriptionId,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount,
      currency: CURRENCY,
    };
  },
);
