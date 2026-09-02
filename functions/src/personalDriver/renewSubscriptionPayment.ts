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
  calculateAuthoritativeMonthlyDistanceKm,
  calculateServerRoute,
} from './routeDistance.js';
import { countWeekdayOccurrences, getPeriodEndDateExclusive } from './period.js';
import { getLocalCalendarDate, localDateTimeToUtc, resolveAddressCoordinates } from './locationTimeZone.js';
import { calculatePersonalDriverPrices } from './pricing.js';
import type { PersonalDriverPlanId, PersonalDriverPlanPrice, PersonalDriverWeekday } from './pricing.js';
import { getConfiguredPersonalDriverPlans } from './planConfig.js';
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
const PAYMENT_RESULT_WAIT_TIMEOUT_MS = 30 * 1000;
const PAYMENT_RESULT_POLL_INTERVAL_MS = 100;

let stripe: InstanceType<typeof Stripe> | null = null;

function getStripe(): InstanceType<typeof Stripe> {
  if (!stripe) stripe = createStripeClient(stripeSecretKey.value().trim());
  return stripe;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function createRenewalId(userId: string, sourceSubscriptionId: string, requestId: string): string {
  return createHash('sha256')
    .update(userId)
    .update('\0')
    .update(sourceSubscriptionId)
    .update('\0')
    .update(requestId)
    .digest('hex');
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function getPaymentCreationError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Erreur inconnue lors de la création du paiement.';
}

function getSourceString(data: FirebaseFirestore.DocumentData, key: string): string {
  const value = data[key];
  if (typeof value !== 'string' || !value.trim()) throw new HttpsError('failed-precondition', `Configuration ${key} absente.`);
  return value;
}

async function waitForRenewalPayment(
  renewalRef: FirebaseFirestore.DocumentReference,
  timeoutMs = PAYMENT_RESULT_WAIT_TIMEOUT_MS,
): Promise<FirebaseFirestore.DocumentData> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await renewalRef.get();
    if (snapshot.exists) {
      const data = snapshot.data();
      if (data?.paymentStatus !== 'creating') return data ?? {};
    }
    await new Promise((resolve) => setTimeout(resolve, PAYMENT_RESULT_POLL_INTERVAL_MS));
  }
  throw new HttpsError('aborted', 'Création du renouvellement trop longue. Veuillez réessayer.');
}

const inputSchema = z.object({
  sourceSubscriptionId: z.string().trim().min(1),
  requestId: z.string().trim().min(1).max(128),
  pendingSubscriptionId: z.string().trim().min(1).optional(),
});

export interface PersonalDriverAuthoritativeQuote {
  distanceOneWayKm: number;
  distanceReturnKm: number;
  monthlyDistanceKm: number;
  selectedPlanPrice: PersonalDriverPlanPrice;
  taxAmount: 0;
  totalAmount: number;
  currency: string;
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

export interface RenewSubscriptionPaymentResult {
  subscriptionId: string;
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
  quote: PersonalDriverAuthoritativeQuote;
}

export const renewPersonalDriverSubscriptionPayment = onCall(
  { region: 'europe-west1', secrets: [stripeSecretKey, googleMapsApiKey] },
  async (request: CallableRequest<unknown>): Promise<RenewSubscriptionPaymentResult> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    const parsed = inputSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0].message);

    const userId = request.auth.uid;
    const { sourceSubscriptionId, requestId, pendingSubscriptionId } = parsed.data;
    const db = getDb();
    const sourceRef = db.collection('personal_driver_subscriptions').doc(sourceSubscriptionId);
    const sourceSnapshot = await sourceRef.get();
    if (!sourceSnapshot.exists) throw new HttpsError('not-found', 'Abonnement source introuvable.');
    const source = sourceSnapshot.data();
    if (!source || source.userId !== userId) throw new HttpsError('permission-denied', 'Cet abonnement ne vous appartient pas.');

    const serviceTimeZone = getSourceString(source, 'serviceTimeZone');
    const sourcePeriodStartDate = getSourceString(source, 'periodStartDate');
    const sourcePeriodEndDate = getSourceString(source, 'periodEndDateExclusive');
    if (!isCalendarDate(sourcePeriodStartDate) || !isCalendarDate(sourcePeriodEndDate)) {
      throw new HttpsError('failed-precondition', 'Les dates locales de la période source sont invalides.');
    }
    if (getPeriodEndDateExclusive(sourcePeriodStartDate) !== sourcePeriodEndDate) {
      throw new HttpsError('failed-precondition', 'La période source ne couvre pas exactement 30 jours.');
    }
    const sourcePeriodStartAtUtc = toDate(source.periodStartAtUtc);
    const sourcePeriodEndAtUtc = toDate(source.periodEndAtUtc);
    if (!sourcePeriodStartAtUtc || !sourcePeriodEndAtUtc || sourcePeriodEndAtUtc <= sourcePeriodStartAtUtc) {
      throw new HttpsError('failed-precondition', 'Les bornes UTC de la période source sont invalides.');
    }
    const sourceStatus = source.status;
    const expectedPaymentStatus: Record<string, string> = {
      active: 'succeeded',
      payment_failed: 'failed',
      cancelled: 'cancelled',
      expired: 'succeeded',
    };
    if (!Object.hasOwn(expectedPaymentStatus, sourceStatus) || source.paymentStatus !== expectedPaymentStatus[sourceStatus]) {
      throw new HttpsError('failed-precondition', 'Ce forfait ne peut pas encore être renouvelé.');
    }

    const now = new Date();
    const paymentCreationOwnerId = randomUUID();
    let periodStartDate: string;
    let claim: ClaimSubscriptionPeriodLockResult | undefined;
    if (pendingSubscriptionId) {
      const pendingRef = db.collection('personal_driver_subscriptions').doc(pendingSubscriptionId);
      const pendingSnapshot = await pendingRef.get();
      const pending = pendingSnapshot.exists ? pendingSnapshot.data() : undefined;
      const pendingPeriodStartDate = pending?.periodStartDate;
      if (
        !pending
        || pending.userId !== userId
        || pending.sourceSubscriptionId !== sourceSubscriptionId
        || !(
          (pending.status === 'pending_payment' && ['creating', 'pending', 'requires_action'].includes(pending.paymentStatus))
          || (pending.status === 'active' && pending.paymentStatus === 'succeeded')
        )
        || typeof pendingPeriodStartDate !== 'string'
        || !isCalendarDate(pendingPeriodStartDate)
      ) {
        throw new HttpsError('failed-precondition', 'Renouvellement en attente invalide.');
      }

      const recoveryClaim = await db.runTransaction<ClaimSubscriptionPeriodLockResult>(async (transaction) => {
        const periodClaim = await claimSubscriptionPeriodLock(transaction, db, {
          userId,
          periodStartDate: pendingPeriodStartDate,
          requestedSubscriptionId: pendingSubscriptionId,
          ownerId: paymentCreationOwnerId,
          now,
        });
        if (periodClaim.subscriptionId !== pendingSubscriptionId) {
          throw new HttpsError('failed-precondition', 'Le paiement en attente ne peut pas être récupéré.');
        }
        if (periodClaim.kind === 'claimed') {
          if (!periodClaim.subscriptionExists) {
            throw new HttpsError('failed-precondition', 'Le paiement en attente ne peut pas être récupéré.');
          }
          transaction.update(pendingRef, {
            id: pendingSubscriptionId,
            userId,
            sourceSubscriptionId,
            periodStartDate: pendingPeriodStartDate,
            status: 'pending_payment',
            paymentStatus: 'creating',
            activationStatus: 'pending_payment',
            activationError: null,
            paymentCreationOwnerId,
            paymentCreationClaimedAt: now,
            paymentCreationAttempt: periodClaim.attempt,
            paymentCreationError: null,
          });
        }
        return periodClaim;
      });
      if (recoveryClaim.kind === 'existing') {
        const settledData = recoveryClaim.state === 'creating'
          ? await waitForRenewalPayment(pendingRef)
          : (await pendingRef.get()).data();
        const reusablePayment = settledData?.status === 'active'
          ? settledData.paymentStatus === 'succeeded'
          : settledData?.status === 'pending_payment'
            && ['pending', 'requires_action'].includes(settledData.paymentStatus);
        if (
          settledData?.userId !== userId
          || settledData.sourceSubscriptionId !== sourceSubscriptionId
          || settledData.periodStartDate !== pendingPeriodStartDate
          || !reusablePayment
          || typeof settledData.stripePaymentIntentId !== 'string'
        ) {
          throw new HttpsError('failed-precondition', 'Le paiement en attente ne peut pas être récupéré.');
        }
        const existingPaymentIntent = await getStripe().paymentIntents.retrieve(settledData.stripePaymentIntentId);
        if (!existingPaymentIntent.client_secret) {
          throw new HttpsError('internal', 'Secret du paiement de renouvellement manquant.');
        }
        return {
          subscriptionId: pendingSubscriptionId,
          paymentIntentId: existingPaymentIntent.id,
          clientSecret: existingPaymentIntent.client_secret,
          amount: Number(settledData.totalAmount ?? 0),
          currency: String(settledData.currency ?? CURRENCY),
          quote: getPersistedAuthoritativeQuote(settledData),
        };
      }
      periodStartDate = pendingPeriodStartDate;
      claim = recoveryClaim;
    } else {
      periodStartDate = sourceStatus === 'active' && now < sourcePeriodEndAtUtc
        ? sourcePeriodEndDate
        : getLocalCalendarDate(now, serviceTimeZone);
    }

    const tripType = source.tripType === 'round_trip' ? 'round_trip' : 'one_way';
    const departureTime = getSourceString(source, 'departureTime');
    const returnTime = tripType === 'round_trip' ? getSourceString(source, 'returnTime') : null;
    if (!pendingSubscriptionId) {
      try {
        assertValidSubscriptionSchedule({
          startDate: periodStartDate,
          departureTime,
          returnTime,
          tripType,
          serviceTimeZone,
          now,
        });
      } catch {
        throw new HttpsError('failed-precondition', 'La date ou les horaires du forfait source sont invalides.');
      }
    }

    const requestedRenewalId = createRenewalId(userId, sourceSubscriptionId, requestId);
    claim ??= await db.runTransaction<ClaimSubscriptionPeriodLockResult>(async (transaction) => {
      const periodClaim = await claimSubscriptionPeriodLock(transaction, db, {
        userId,
        periodStartDate,
        requestedSubscriptionId: requestedRenewalId,
        ownerId: paymentCreationOwnerId,
        now,
      });
      if (periodClaim.kind === 'existing') return periodClaim;

      const claimedRenewalRef = db.collection('personal_driver_subscriptions').doc(periodClaim.subscriptionId);
      const creatingData = {
        id: periodClaim.subscriptionId,
        userId,
        sourceSubscriptionId,
        periodStartDate,
        status: 'pending_payment',
        paymentStatus: 'creating',
        activationStatus: 'pending_payment',
        activationError: null,
        paymentCreationOwnerId,
        paymentCreationClaimedAt: now,
        paymentCreationAttempt: periodClaim.attempt,
        paymentCreationError: null,
      };
      if (periodClaim.subscriptionExists) {
        transaction.update(claimedRenewalRef, creatingData);
      } else {
        transaction.create(claimedRenewalRef, { ...creatingData, createdAt: now });
      }
      return periodClaim;
    });
    const renewalId = claim.subscriptionId;
    const renewalRef = db.collection('personal_driver_subscriptions').doc(renewalId);

    if (claim.kind === 'existing') {
      const settledData = claim.state === 'creating'
        ? await waitForRenewalPayment(renewalRef)
        : (await renewalRef.get()).data();
      if (settledData?.paymentStatus === 'failed') {
        throw new HttpsError('internal', 'Impossible de créer le paiement du renouvellement.');
      }
      const paymentIntentId = settledData?.stripePaymentIntentId;
      if (typeof paymentIntentId !== 'string') throw new HttpsError('internal', 'Paiement de renouvellement introuvable.');
      const existingPaymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);
      if (!existingPaymentIntent.client_secret) throw new HttpsError('internal', 'Secret du paiement de renouvellement manquant.');
      return {
        subscriptionId: renewalId,
        paymentIntentId: existingPaymentIntent.id,
        clientSecret: existingPaymentIntent.client_secret,
        amount: Number(settledData?.totalAmount ?? 0),
        currency: String(settledData?.currency ?? CURRENCY),
        quote: getPersistedAuthoritativeQuote(settledData ?? {}),
      };
    }

    const selectedPlanId = source.selectedPlanId ?? source.planId;
    if (!['basic', 'classic', 'premium'].includes(selectedPlanId)) {
      throw new HttpsError('failed-precondition', 'Formule source invalide.');
    }
    const rawSelectedWeekdays: unknown = source.selectedWeekdays;
    if (
      !Array.isArray(rawSelectedWeekdays)
      || rawSelectedWeekdays.length === 0
      || !rawSelectedWeekdays.every((weekday): weekday is PersonalDriverWeekday => (
        typeof weekday === 'number' && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
      ))
    ) {
      throw new HttpsError('failed-precondition', 'Jours source absents.');
    }
    const selectedWeekdays = rawSelectedWeekdays as PersonalDriverWeekday[];
    const selectedPlanIdTyped = selectedPlanId as PersonalDriverPlanId;
    const configuredPlans = await getConfiguredPersonalDriverPlans(db);
    const selectedPlan = configuredPlans[selectedPlanIdTyped];
    if (!selectedWeekdays.every((weekday) => selectedPlan.allowedWeekdays.includes(weekday))) {
      throw new HttpsError('failed-precondition', 'La formule source ne couvre plus les jours demandés.');
    }

    const periodEndDateExclusive = getPeriodEndDateExclusive(periodStartDate);
    const occurrences = countWeekdayOccurrences(periodStartDate, periodEndDateExclusive, selectedWeekdays);
    const pickupAddress = getSourceString(source, 'pickupAddress');
    const destinationAddress = getSourceString(source, 'destinationAddress');
    const outboundRoute = await calculateServerRoute({ origin: pickupAddress, destination: destinationAddress });
    const returnRoute = tripType === 'round_trip'
      ? await calculateServerRoute({ origin: destinationAddress, destination: pickupAddress })
      : null;
    const destinationLocation = await resolveAddressCoordinates(destinationAddress);
    const monthlyDistanceKm = calculateAuthoritativeMonthlyDistanceKm({
      outboundKm: outboundRoute.distanceKm,
      returnKm: returnRoute?.distanceKm ?? 0,
      tripType,
      occurrences,
    });
    const priceComparison = calculatePersonalDriverPrices({
      monthlyDistanceKm,
      requestedWeekdays: selectedWeekdays,
    }, configuredPlans);
    const selectedPlanPrice = priceComparison.plans[selectedPlanIdTyped];
    if (!selectedPlanPrice.isEligible) throw new HttpsError('failed-precondition', 'La formule source ne couvre plus les jours demandés.');
    const amount = toMoney(selectedPlanPrice.totalBeforeTax);
    if (amount > MAX_AMOUNT) throw new HttpsError('invalid-argument', `Montant maximum : ${MAX_AMOUNT}`);
    const periodStartAtUtc = localDateTimeToUtc(periodStartDate, '00:00', serviceTimeZone);
    const periodEndAtUtc = localDateTimeToUtc(periodEndDateExclusive, '00:00', serviceTimeZone);
    const quote: PersonalDriverAuthoritativeQuote = {
      distanceOneWayKm: outboundRoute.distanceKm,
      distanceReturnKm: returnRoute?.distanceKm ?? 0,
      monthlyDistanceKm,
      selectedPlanPrice,
      taxAmount: 0,
      totalAmount: amount,
      currency: CURRENCY,
    };
    const paymentIntent = await getStripe().paymentIntents.create(
      {
        amount: Math.round(quote.totalAmount * 100),
        currency: quote.currency,
        capture_method: 'automatic',
        ...(typeof source.stripeCustomerId === 'string' ? { customer: source.stripeCustomerId } : {}),
        setup_future_usage: 'off_session',
        metadata: {
          purpose: 'personal_driver_subscription',
          subscriptionId: renewalId,
          userId,
          sourceSubscriptionId,
        },
        description: `Renouvellement chauffeur personnel #${renewalId}`,
        automatic_payment_methods: { enabled: true },
      },
      {
        idempotencyKey: createSubscriptionPeriodLockStripeIdempotencyKey(
          claim.lockId,
          renewalId,
          claim.attempt,
        ),
      },
    ).catch(async (error) => {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(renewalRef);
        const released = await releaseSubscriptionPeriodLock(transaction, claim.lockRef, {
          subscriptionId: renewalId,
          ownerId: paymentCreationOwnerId,
        });
        if (
          released
          && snapshot.exists
          && snapshot.data()?.paymentStatus === 'creating'
          && snapshot.data()?.paymentCreationOwnerId === paymentCreationOwnerId
        ) {
          transaction.update(renewalRef, {
            status: 'payment_failed',
            paymentStatus: 'failed',
            paymentCreationError: getPaymentCreationError(error),
          });
        }
      });
      throw new HttpsError('internal', 'Impossible de créer le paiement du renouvellement.');
    });
    if (!paymentIntent.client_secret) throw new HttpsError('internal', 'Secret du paiement de renouvellement manquant.');

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(renewalRef);
      const lockFinalized = await markSubscriptionPeriodLockPendingPayment(transaction, claim.lockRef, {
        subscriptionId: renewalId,
        ownerId: paymentCreationOwnerId,
        paymentIntentId: paymentIntent.id,
        now: new Date(),
      });
      if (
        !lockFinalized
        || !snapshot.exists
        || snapshot.data()?.paymentStatus !== 'creating'
        || snapshot.data()?.paymentCreationOwnerId !== paymentCreationOwnerId
      ) {
        throw new HttpsError('aborted', 'Le renouvellement a déjà été traité.');
      }
      transaction.update(renewalRef, {
        id: renewalId,
        userId,
        sourceSubscriptionId,
        selectedPlanId,
        pickupAddress,
        destinationAddress,
        tripType,
        selectedWeekdays,
        departureTime,
        returnTime,
        startDate: periodStartDate,
        periodStartDate,
        periodEndDateExclusive,
        periodStartAtUtc,
        periodEndAtUtc,
        serviceTimeZone,
        pickupLocation: source.pickupLocation,
        destinationLocation,
        distanceOneWayKm: quote.distanceOneWayKm,
        distanceReturnKm: quote.distanceReturnKm,
        monthlyDistanceKm: quote.monthlyDistanceKm,
        monthlyDistanceKmRemaining: quote.monthlyDistanceKm,
        includedSpecialTrips: selectedPlanPrice.includedSpecialTrips,
        specialTripsUsed: 0,
        specialTripsDistanceUsedKm: 0,
        passengerCount: Number(source.passengerCount ?? 1),
        notes: source.notes ?? null,
        selectedPlanPrice: quote.selectedPlanPrice,
        priceComparison,
        taxStatus: 'pending_confirmation',
        taxAmount: quote.taxAmount,
        totalAmount: quote.totalAmount,
        currency: quote.currency,
        stripePaymentIntentId: paymentIntent.id,
        stripeCustomerId: typeof source.stripeCustomerId === 'string' ? source.stripeCustomerId : null,
        defaultPaymentMethodId: source.defaultPaymentMethodId ?? null,
        paymentStatus: 'pending',
        activationStatus: 'pending_payment',
        activationError: null,
        paymentCreationError: null,
      });
    });

    return {
      subscriptionId: renewalId,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount: quote.totalAmount,
      currency: quote.currency,
      quote,
    };
  },
);
