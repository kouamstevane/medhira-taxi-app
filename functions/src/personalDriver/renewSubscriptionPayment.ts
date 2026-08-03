import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import type Stripe from 'stripe';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DEFAULT_CURRENCY } from '../config/stripe.js';
import { createStripeClient } from '../stripe/stripe-client.js';
import {
  calculateAuthoritativeMonthlyDistanceKm,
  calculateServerRoute,
} from './routeDistance.js';
import { countWeekdayOccurrences, getPeriodEndDateExclusive } from './period.js';
import { getLocalCalendarDate, localDateTimeToUtc } from './locationTimeZone.js';
import { calculatePersonalDriverPrices } from './pricing.js';
import type { PersonalDriverPlanId, PersonalDriverWeekday } from './pricing.js';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const CURRENCY = DEFAULT_CURRENCY;
const MAX_AMOUNT = 10000;
const PAYMENT_CREATION_CLAIM_TIMEOUT_MS = 15 * 60 * 1000;
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
  return typeof value === 'string' ? new Date(value) : null;
}

function isClaimStale(data: FirebaseFirestore.DocumentData, now: Date): boolean {
  const claimedAt = toDate(data.paymentCreationClaimedAt);
  return !claimedAt || now.getTime() - claimedAt.getTime() >= PAYMENT_CREATION_CLAIM_TIMEOUT_MS;
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
});

interface RenewalClaim {
  isCreator: boolean;
  data?: FirebaseFirestore.DocumentData;
}

export interface RenewSubscriptionPaymentResult {
  subscriptionId: string;
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
}

export const renewPersonalDriverSubscriptionPayment = onCall(
  { region: 'europe-west1', secrets: [stripeSecretKey] },
  async (request: CallableRequest<unknown>): Promise<RenewSubscriptionPaymentResult> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    const parsed = inputSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0].message);

    const userId = request.auth.uid;
    const { sourceSubscriptionId, requestId } = parsed.data;
    const db = getDb();
    const sourceRef = db.collection('personal_driver_subscriptions').doc(sourceSubscriptionId);
    const sourceSnapshot = await sourceRef.get();
    if (!sourceSnapshot.exists) throw new HttpsError('not-found', 'Abonnement source introuvable.');
    const source = sourceSnapshot.data();
    if (!source || source.userId !== userId) throw new HttpsError('permission-denied', 'Cet abonnement ne vous appartient pas.');

    const serviceTimeZone = getSourceString(source, 'serviceTimeZone');
    const sourcePeriodEndDate = getSourceString(source, 'periodEndDateExclusive');
    const sourcePeriodEndAtUtc = toDate(source.periodEndAtUtc);
    if (!sourcePeriodEndAtUtc) throw new HttpsError('failed-precondition', 'La période source est incomplète.');
    const sourceStatus = source.status;
    if (!['active', 'payment_failed', 'cancelled', 'expired'].includes(sourceStatus)) {
      throw new HttpsError('failed-precondition', 'Ce forfait ne peut pas encore être renouvelé.');
    }

    const renewalId = createRenewalId(userId, sourceSubscriptionId, requestId);
    const renewalRef = db.collection('personal_driver_subscriptions').doc(renewalId);
    const now = new Date();
    const claim = await db.runTransaction<RenewalClaim>(async (transaction) => {
      const existingSnapshot = await transaction.get(renewalRef);
      if (existingSnapshot.exists) {
        const existingData = existingSnapshot.data();
        if (!existingData || existingData.userId !== userId || existingData.sourceSubscriptionId !== sourceSubscriptionId) {
          throw new HttpsError('internal', 'Demande de renouvellement incohérente.');
        }
        const canReclaim = existingData.paymentStatus === 'failed'
          || (existingData.paymentStatus === 'creating' && isClaimStale(existingData, now));
        if (!canReclaim) return { isCreator: false, data: existingData };
        transaction.update(renewalRef, {
          status: 'pending_payment',
          paymentStatus: 'creating',
          paymentCreationClaimedAt: now,
          paymentCreationError: null,
        });
        return { isCreator: true };
      }

      transaction.create(renewalRef, {
        id: renewalId,
        userId,
        sourceSubscriptionId,
        status: 'pending_payment',
        paymentStatus: 'creating',
        paymentCreationClaimedAt: now,
        createdAt: now,
      });
      return { isCreator: true };
    });

    if (!claim.isCreator) {
      const settledData = claim.data?.paymentStatus === 'creating'
        ? await waitForRenewalPayment(renewalRef)
        : claim.data;
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

    const periodStartDate = sourceStatus === 'active' && now < sourcePeriodEndAtUtc
      ? sourcePeriodEndDate
      : getLocalCalendarDate(now, serviceTimeZone);
    const periodEndDateExclusive = getPeriodEndDateExclusive(periodStartDate);
    const occurrences = countWeekdayOccurrences(periodStartDate, periodEndDateExclusive, selectedWeekdays);
    const pickupAddress = getSourceString(source, 'pickupAddress');
    const destinationAddress = getSourceString(source, 'destinationAddress');
    const tripType = source.tripType === 'round_trip' ? 'round_trip' : 'one_way';
    const outboundRoute = await calculateServerRoute({ origin: pickupAddress, destination: destinationAddress });
    const returnRoute = tripType === 'round_trip'
      ? await calculateServerRoute({ origin: destinationAddress, destination: pickupAddress })
      : null;
    const monthlyDistanceKm = calculateAuthoritativeMonthlyDistanceKm({
      outboundKm: outboundRoute.distanceKm,
      returnKm: returnRoute?.distanceKm ?? 0,
      tripType,
      occurrences,
    });
    const priceComparison = calculatePersonalDriverPrices({
      monthlyDistanceKm,
      requestedWeekdays: selectedWeekdays,
    });
    const selectedPlanPrice = priceComparison.plans[selectedPlanId as PersonalDriverPlanId];
    if (!selectedPlanPrice.isEligible) throw new HttpsError('failed-precondition', 'La formule source ne couvre plus les jours demandés.');
    const amount = toMoney(selectedPlanPrice.totalBeforeTax);
    if (amount > MAX_AMOUNT) throw new HttpsError('invalid-argument', `Montant maximum : ${MAX_AMOUNT}`);
    const periodStartAtUtc = localDateTimeToUtc(periodStartDate, '00:00', serviceTimeZone);
    const periodEndAtUtc = localDateTimeToUtc(periodEndDateExclusive, '00:00', serviceTimeZone);
    const paymentIntent = await getStripe().paymentIntents.create(
      {
        amount: Math.round(amount * 100),
        currency: CURRENCY,
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
      { idempotencyKey: `personal_driver_renewal_${renewalId}_1` },
    ).catch(async (error) => {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(renewalRef);
        if (snapshot.exists && snapshot.data()?.paymentStatus === 'creating') {
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
      if (!snapshot.exists || snapshot.data()?.paymentStatus !== 'creating') {
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
        departureTime: getSourceString(source, 'departureTime'),
        returnTime: source.returnTime ?? null,
        startDate: periodStartDate,
        periodStartDate,
        periodEndDateExclusive,
        periodStartAtUtc,
        periodEndAtUtc,
        serviceTimeZone,
        pickupLocation: source.pickupLocation,
        distanceOneWayKm: outboundRoute.distanceKm,
        distanceReturnKm: returnRoute?.distanceKm ?? 0,
        monthlyDistanceKm,
        monthlyDistanceKmRemaining: monthlyDistanceKm,
        includedSpecialTrips: selectedPlanPrice.planId === 'premium' ? 4 : selectedPlanPrice.planId === 'classic' ? 2 : 0,
        specialTripsUsed: 0,
        specialTripsDistanceUsedKm: 0,
        passengerCount: Number(source.passengerCount ?? 1),
        notes: source.notes ?? null,
        selectedPlanPrice,
        priceComparison,
        taxStatus: 'pending_confirmation',
        taxAmount: 0,
        totalAmount: amount,
        currency: CURRENCY,
        stripePaymentIntentId: paymentIntent.id,
        stripeCustomerId: typeof source.stripeCustomerId === 'string' ? source.stripeCustomerId : null,
        defaultPaymentMethodId: source.defaultPaymentMethodId ?? null,
        paymentStatus: 'pending',
        paymentCreationError: null,
      });
    });

    return {
      subscriptionId: renewalId,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount,
      currency: CURRENCY,
    };
  },
);
