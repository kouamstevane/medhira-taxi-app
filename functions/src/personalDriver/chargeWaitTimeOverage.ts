import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import type Stripe from 'stripe';
import { DEFAULT_CURRENCY } from '../config/stripe.js';
import { createStripeClient } from '../stripe/stripe-client.js';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

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

interface ChargeWaitTimeInput {
  tripId: string;
  elapsedMinutes: number;
}

export const chargePersonalDriverWaitTimeOverage = onCall(
  { region: 'europe-west1', secrets: [stripeSecretKey] },
  async (request: CallableRequest<ChargeWaitTimeInput>) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise.');
    }

    const { tripId, elapsedMinutes } = request.data ?? {};
    if (!tripId || typeof elapsedMinutes !== 'number' || elapsedMinutes < 0) {
      throw new HttpsError('invalid-argument', 'Paramètres de trajet invalides.');
    }

    const db = getDb();
    const tripRef = db.collection('personal_driver_trips').doc(tripId);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists) {
      throw new HttpsError('not-found', 'Trajet non trouvé.');
    }

    const tripData = tripSnap.data();
    if (!tripData) throw new HttpsError('not-found', 'Données de trajet manquantes.');

    const subscriptionRef = db.collection('personal_driver_subscriptions').doc(tripData.subscriptionId);
    const subSnap = await subscriptionRef.get();
    if (!subSnap.exists) throw new HttpsError('not-found', 'Abonnement introuvable.');

    const subData = subSnap.data();
    const planId = tripData.planId ?? subData?.selectedPlanId ?? 'basic';

    const rates: Record<string, { regular: number; special: number; freeReg: number; freeSpec: number }> = {
      basic: { regular: 0.8, special: 0.8, freeReg: 3, freeSpec: 0 },
      classic: { regular: 0.5, special: 0.4, freeReg: 5, freeSpec: 15 },
      premium: { regular: 0.4, special: 0.3, freeReg: 10, freeSpec: 30 },
    };

    const config = rates[planId] ?? rates.basic;
    const isSpecial = Boolean(tripData.isSpecialTrip);
    const freeMinutes = isSpecial ? config.freeSpec : config.freeReg;
    const ratePerMin = isSpecial ? config.special : config.regular;

    const overageMinutes = Math.max(0, Math.floor(elapsedMinutes) - freeMinutes);
    if (overageMinutes <= 0) {
      return { success: true, feeBilled: 0, overageMinutes: 0 };
    }

    const feeAmount = Math.round(overageMinutes * ratePerMin * 100) / 100;
    const feeInCents = Math.round(feeAmount * 100);

    const customerId = subData?.stripeCustomerId;
    const paymentMethodId = subData?.defaultPaymentMethodId;

    let paymentIntentId: string | null = null;
    if (customerId && paymentMethodId) {
      const paymentIntent = await getStripe().paymentIntents.create({
        amount: feeInCents,
        currency: DEFAULT_CURRENCY,
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `Frais de dépassement d'attente (${overageMinutes} min) - Trajet #${tripId}`,
        metadata: {
          purpose: 'personal_driver_wait_overage',
          tripId,
          subscriptionId: tripData.subscriptionId,
        },
      });
      paymentIntentId = paymentIntent.id;
    }

    await tripRef.update({
      waitTimeMinutes: elapsedMinutes,
      overageWaitMinutes: overageMinutes,
      overageWaitFeeAmount: feeAmount,
      overageWaitBilled: true,
      overagePaymentIntentId: paymentIntentId ?? null,
      updatedAt: new Date(),
    });

    return {
      success: true,
      feeBilled: feeAmount,
      overageMinutes,
      paymentIntentId,
    };
  },
);
