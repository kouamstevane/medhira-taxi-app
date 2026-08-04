import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import type Stripe from 'stripe';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DEFAULT_CURRENCY } from '../config/stripe.js';
import { googleMapsApiKey } from '../config/googleMaps.js';
import { createStripeClient } from '../stripe/stripe-client.js';
import {
  calculatePersonalDriverPrices,
  SPECIAL_TRIP_LIMITS,
  type PersonalDriverPlanId,
  type PersonalDriverPlanPrice,
  type PersonalDriverWeekday,
} from './pricing.js';
import { calculateAuthoritativeMonthlyDistanceKm, calculateServerRoute } from './routeDistance.js';
import { countWeekdayOccurrences, getPeriodEndDateExclusive } from './period.js';
import { localDateTimeToUtc, resolveAddressCoordinates, resolvePickupLocationAndTimeZone } from './locationTimeZone.js';
import { assertValidSubscriptionSchedule } from './subscriptionSchedule.js';
import {
  claimSubscriptionPeriodLock,
  createSubscriptionPeriodLockStripeIdempotencyKey,
  markSubscriptionPeriodLockPendingPayment,
  releaseSubscriptionPeriodLock,
  type ClaimSubscriptionPeriodLockResult,
} from './subscriptionPeriodLock.js';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const CURRENCY = DEFAULT_CURRENCY;
const MAX_AMOUNT = 10000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PAYMENT_RESULT_WAIT_TIMEOUT_MS = 30 * 1000;
const PAYMENT_RESULT_POLL_INTERVAL_MS = 100;

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
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
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
  passengerCount: z.number().int().min(1).max(8),
  notes: z.string().trim().max(1000).optional(),
}).superRefine((data, context) => {
  if (data.tripType === 'round_trip' && !data.returnTime) {
    context.addIssue({ code: 'custom', path: ['returnTime'], message: 'Heure de retour requise pour un aller-retour' });
  }
});

interface CreateSubscriptionPaymentResult {
  subscriptionId: string;
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
  quote: PersonalDriverAuthoritativeQuote;
}

interface PersonalDriverAuthoritativeQuote {
  distanceOneWayKm: number;
  distanceReturnKm: number;
  monthlyDistanceKm: number;
  selectedPlanPrice: PersonalDriverPlanPrice;
  taxAmount: 0;
  totalAmount: number;
  currency: string;
}

interface UserPaymentProfile {
  stripeCustomerId?: string;
  defaultPaymentMethodId?: string;
}

function getPersistedAuthoritativeQuote(
  data: FirebaseFirestore.DocumentData,
): PersonalDriverAuthoritativeQuote {
  return {
    distanceOneWayKm: Number(data.distanceOneWayKm),
    distanceReturnKm: Number(data.distanceReturnKm),
    monthlyDistanceKm: Number(data.monthlyDistanceKm),
    selectedPlanPrice: data.selectedPlanPrice as PersonalDriverPlanPrice,
    taxAmount: 0,
    totalAmount: Number(data.totalAmount),
    currency: String(data.currency ?? CURRENCY),
  };
}

async function getPersistedPaymentReplay(
  subscriptionRef: FirebaseFirestore.DocumentReference,
  subscriptionId: string,
  userId: string,
): Promise<CreateSubscriptionPaymentResult | null> {
  const snapshot = await subscriptionRef.get();
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  const hasReusablePaymentState = data?.status === 'active'
    ? data.paymentStatus === 'succeeded'
    : data?.status === 'pending_payment'
      && (data.paymentStatus === 'pending' || data.paymentStatus === 'requires_action');
  if (
    !data
    || data.userId !== userId
    || !hasReusablePaymentState
    || typeof data.stripePaymentIntentId !== 'string'
  ) {
    return null;
  }
  const paymentIntent = await getStripe().paymentIntents.retrieve(data.stripePaymentIntentId);
  if (!paymentIntent.client_secret) {
    throw new HttpsError('internal', 'Impossible de récupérer le PaymentIntent existant.');
  }
  return {
    subscriptionId,
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    amount: data.totalAmount,
    currency: data.currency,
    quote: getPersistedAuthoritativeQuote(data),
  };
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
  lockRef: FirebaseFirestore.DocumentReference,
  paymentCreationOwnerId: string,
  error: unknown,
): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const subscription = await transaction.get(subscriptionRef);
    const data = subscription.data();
    if (
      !subscription.exists
      || !data
      || data.paymentStatus !== 'creating'
      || data.paymentCreationOwnerId !== paymentCreationOwnerId
    ) {
      return;
    }

    const released = await releaseSubscriptionPeriodLock(transaction, lockRef, {
      subscriptionId: subscriptionRef.id,
      ownerId: paymentCreationOwnerId,
    });
    if (!released) return;

    transaction.update(subscriptionRef, {
      status: 'payment_failed',
      paymentStatus: 'failed',
      paymentCreationFailedAt: new Date(),
      paymentCreationError: getPaymentCreationError(error),
    });
  });
}

async function waitForSubscriptionPayment(
  subscriptionRef: FirebaseFirestore.DocumentReference,
  timeoutMs = PAYMENT_RESULT_WAIT_TIMEOUT_MS,
): Promise<FirebaseFirestore.DocumentData> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await subscriptionRef.get();
    if (snapshot.exists) {
      const data = snapshot.data();
      if (data?.paymentStatus !== 'creating') return data ?? {};
    }
    await new Promise((resolve) => setTimeout(resolve, PAYMENT_RESULT_POLL_INTERVAL_MS));
  }
  throw new HttpsError('aborted', 'Création du paiement trop longue. Veuillez réessayer.');
}

export const createPersonalDriverSubscriptionPayment = onCall(
  { region: 'europe-west1', secrets: [stripeSecretKey, googleMapsApiKey] },
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

    const db = getDb();
    const requestedSubscriptionRef = db.collection('personal_driver_subscriptions')
      .doc(createSubscriptionId(userId, input.requestId));
    const requestedSubscriptionId = requestedSubscriptionRef.id;
    const persistedReplay = await getPersistedPaymentReplay(
      requestedSubscriptionRef,
      requestedSubscriptionId,
      userId,
    );
    if (persistedReplay) return persistedReplay;

    const now = new Date();
    const periodEndDateExclusive = getPeriodEndDateExclusive(input.startDate);
    const occurrences = countWeekdayOccurrences(input.startDate, periodEndDateExclusive, selectedWeekdays);
    const [pickupLocation, destinationLocation, outboundRoute] = await Promise.all([
      resolvePickupLocationAndTimeZone(input.pickupAddress, now),
      resolveAddressCoordinates(input.destinationAddress),
      calculateServerRoute({
        origin: input.pickupAddress,
        destination: input.destinationAddress,
      }),
    ]);
    try {
      assertValidSubscriptionSchedule({
        startDate: input.startDate,
        departureTime: input.departureTime,
        returnTime: input.returnTime,
        tripType: input.tripType,
        serviceTimeZone: pickupLocation.serviceTimeZone,
        now,
      });
    } catch {
      throw new HttpsError('invalid-argument', 'La date ou les horaires du forfait sont invalides.');
    }
    const returnRoute = input.tripType === 'round_trip'
      ? await calculateServerRoute({
        origin: input.destinationAddress,
        destination: input.pickupAddress,
      })
      : null;
    const authoritativeMonthlyDistanceKm = calculateAuthoritativeMonthlyDistanceKm({
      outboundKm: outboundRoute.distanceKm,
      returnKm: returnRoute?.distanceKm ?? 0,
      tripType: input.tripType,
      occurrences,
    });
    const priceComparison = calculatePersonalDriverPrices({
      monthlyDistanceKm: authoritativeMonthlyDistanceKm,
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
    const quote: PersonalDriverAuthoritativeQuote = {
      distanceOneWayKm: outboundRoute.distanceKm,
      distanceReturnKm: returnRoute?.distanceKm ?? 0,
      monthlyDistanceKm: authoritativeMonthlyDistanceKm,
      selectedPlanPrice,
      taxAmount,
      totalAmount: amount,
      currency: CURRENCY,
    };
    const periodStartAtUtc = localDateTimeToUtc(input.startDate, '00:00', pickupLocation.serviceTimeZone);
    const periodEndAtUtc = localDateTimeToUtc(periodEndDateExclusive, '00:00', pickupLocation.serviceTimeZone);

    const paymentCreationOwnerId = randomUUID();
    const paymentCreationClaimedAt = new Date();
    const subscriptionClaim = await db.runTransaction<ClaimSubscriptionPeriodLockResult>(async (transaction) => {
      const periodClaim = await claimSubscriptionPeriodLock(transaction, db, {
        userId,
        periodStartDate: input.startDate,
        requestedSubscriptionId,
        ownerId: paymentCreationOwnerId,
        now: paymentCreationClaimedAt,
      });
      if (periodClaim.kind === 'existing') return periodClaim;

      const claimedSubscriptionRef = db.collection('personal_driver_subscriptions').doc(periodClaim.subscriptionId);
      const creatingData = {
        id: periodClaim.subscriptionId,
        userId,
        periodStartDate: input.startDate,
        status: 'pending_payment',
        paymentStatus: 'creating',
        paymentCreationOwnerId,
        paymentCreationClaimedAt,
        paymentCreationAttempt: periodClaim.attempt,
        paymentCreationError: null,
      };
      if (periodClaim.subscriptionExists) {
        transaction.update(claimedSubscriptionRef, creatingData);
      } else {
        transaction.create(claimedSubscriptionRef, { ...creatingData, createdAt: paymentCreationClaimedAt });
      }
      return periodClaim;
    });
    const subscriptionId = subscriptionClaim.subscriptionId;
    const subscriptionRef = db.collection('personal_driver_subscriptions').doc(subscriptionId);

    if (subscriptionClaim.kind === 'existing') {
      const existingData = subscriptionClaim.state === 'creating'
        ? await waitForSubscriptionPayment(subscriptionRef)
        : (await subscriptionRef.get()).data();
      if (!existingData || existingData.userId !== request.auth.uid) {
        throw new HttpsError('internal', 'Impossible de récupérer le paiement existant.');
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
        quote: getPersistedAuthoritativeQuote(existingData),
      };
    }

    const amountInSmallestUnit = Math.round(quote.totalAmount * 100);
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
      {
        idempotencyKey: createSubscriptionPeriodLockStripeIdempotencyKey(
          subscriptionClaim.lockId,
          subscriptionId,
          subscriptionClaim.attempt,
        ),
      },
    ).catch(async (error) => {
      try {
        await markPaymentCreationFailed(
          db,
          subscriptionRef,
          subscriptionClaim.lockRef,
          paymentCreationOwnerId,
          error,
        );
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
        subscriptionClaim.lockRef,
        paymentCreationOwnerId,
        new Error('PaymentIntent client_secret missing'),
      );
      throw new HttpsError('internal', 'Impossible de créer le PaymentIntent : client_secret manquant.');
    }

    try {
      await db.runTransaction(async (transaction) => {
        const subscriptionSnapshot = await transaction.get(subscriptionRef);
        const lockFinalized = await markSubscriptionPeriodLockPendingPayment(
          transaction,
          subscriptionClaim.lockRef,
          {
            subscriptionId,
            ownerId: paymentCreationOwnerId,
            paymentIntentId: paymentIntent.id,
            now: new Date(),
          },
        );
        if (
          !lockFinalized
          || !subscriptionSnapshot.exists
          || subscriptionSnapshot.data()?.paymentStatus !== 'creating'
          || subscriptionSnapshot.data()?.paymentCreationOwnerId !== paymentCreationOwnerId
        ) {
          throw new HttpsError('aborted', 'La création du paiement a déjà été traitée.');
        }
        transaction.update(subscriptionRef, {
          id: subscriptionId,
          userId,
          status: 'pending_payment',
          selectedPlanId,
          pickupAddress: input.pickupAddress,
          destinationAddress: input.destinationAddress,
          tripType: input.tripType,
          selectedWeekdays,
          departureTime: input.departureTime,
          returnTime: input.returnTime ?? null,
          startDate: input.startDate,
          periodStartDate: input.startDate,
          periodEndDateExclusive,
          periodStartAtUtc,
          periodEndAtUtc,
          serviceTimeZone: pickupLocation.serviceTimeZone,
          pickupLocation: {
            latitude: pickupLocation.latitude,
            longitude: pickupLocation.longitude,
          },
          destinationLocation,
          distanceOneWayKm: quote.distanceOneWayKm,
          distanceReturnKm: quote.distanceReturnKm,
          monthlyDistanceKm: quote.monthlyDistanceKm,
          monthlyDistanceKmRemaining: quote.monthlyDistanceKm,
          includedSpecialTrips: SPECIAL_TRIP_LIMITS[selectedPlanId],
          specialTripsUsed: 0,
          specialTripsDistanceUsedKm: 0,
          passengerCount: input.passengerCount,
          notes: input.notes ?? null,
          selectedPlanPrice: quote.selectedPlanPrice,
          priceComparison,
          taxAmount: quote.taxAmount,
          taxStatus: 'pending_confirmation',
          totalAmount: quote.totalAmount,
          currency: quote.currency,
          stripePaymentIntentId: paymentIntent.id,
          stripeCustomerId: userPaymentProfile.stripeCustomerId ?? null,
          defaultPaymentMethodId: userPaymentProfile.defaultPaymentMethodId ?? null,
          paymentStatus: 'pending',
        });
      });
    } catch (error) {
      if (error instanceof HttpsError && error.code === 'aborted') throw error;
      throw new HttpsError('internal', 'Impossible d’enregistrer l’abonnement.');
    }

    return {
      subscriptionId,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount: quote.totalAmount,
      currency: quote.currency,
      quote,
    };
  },
);
