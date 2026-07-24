import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import type Stripe from 'stripe';
import { createHash } from 'node:crypto';
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

export const createPersonalDriverSubscriptionPayment = onCall(
  { region: 'europe-west1', secrets: [stripeSecretKey] },
  async (request: CallableRequest<unknown>): Promise<CreateSubscriptionPaymentResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

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
    const existingSubscription = await subscriptionRef.get();
    if (existingSubscription.exists) {
      const existingData = existingSubscription.data();
      if (!existingData || existingData.userId !== request.auth.uid || !existingData.stripePaymentIntentId) {
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
    const paymentIntent = await getStripe().paymentIntents.create(
      {
        amount: amountInSmallestUnit,
        currency: CURRENCY,
        capture_method: 'automatic',
        metadata: {
          purpose: 'personal_driver_subscription',
          subscriptionId,
          userId: request.auth.uid,
        },
        description: `Abonnement chauffeur personnel #${subscriptionId}`,
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: `personal_driver_subscription_${subscriptionId}_${amountInSmallestUnit}` },
    );
    if (!paymentIntent.client_secret) {
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
        paymentIntentIsOrphaned = !persistedSubscription.exists;
      } catch (verificationError) {
        console.error('[createPersonalDriverSubscriptionPayment] Failed to verify subscription after batch commit failure', {
          paymentIntentId: paymentIntent.id,
          error: verificationError instanceof Error ? verificationError.message : verificationError,
        });
      }

      if (paymentIntentIsOrphaned) {
        try {
          await getStripe().paymentIntents.cancel(paymentIntent.id, undefined, {
            idempotencyKey: `cancel_personal_driver_subscription_${paymentIntent.id}`,
          });
        } catch (cancelError) {
          console.error('[createPersonalDriverSubscriptionPayment] Failed to cancel orphaned PaymentIntent', {
            paymentIntentId: paymentIntent.id,
            error: cancelError instanceof Error ? cancelError.message : cancelError,
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
