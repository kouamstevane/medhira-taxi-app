import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { DEFAULT_CURRENCY } from '../config/stripe.js';
import { createStripeClient } from '../stripe/stripe-client.js';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

type StripeClient = ReturnType<typeof createStripeClient>;
let stripe: StripeClient | null = null;

function getStripe(): StripeClient {
  if (!stripe) stripe = createStripeClient(stripeSecretKey.value().trim());
  return stripe;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

async function isAdminUser(uid: string): Promise<boolean> {
  const adminSnap = await getDb().collection('admins').doc(uid).get();
  return adminSnap.exists;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function getWaitMinutes(tripData: FirebaseFirestore.DocumentData, now: Date): number {
  const startedAt = toDate(tripData.driverArrivedAt ?? tripData.waitStartedAt ?? tripData.driverArrivedAtIso);
  if (!startedAt) throw new HttpsError('failed-precondition', 'L’heure serveur d’arrivée du chauffeur est introuvable.');
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 60000));
}

const WAIT_RATES: Record<string, { regular: number; special: number; freeReg: number; freeSpec: number }> = {
  basic: { regular: 0.8, special: 0.8, freeReg: 3, freeSpec: 0 },
  classic: { regular: 0.5, special: 0.4, freeReg: 5, freeSpec: 15 },
  premium: { regular: 0.4, special: 0.3, freeReg: 10, freeSpec: 30 },
};

interface ChargeWaitTimeInput {
  tripId: string;
  elapsedMinutes?: number;
}

interface WaitChargeClaim {
  alreadyBilled?: {
    feeBilled: number;
    overageMinutes: number;
    paymentIntentId: string;
  };
  feeAmount: number;
  overageMinutes: number;
  waitTimeMinutes: number;
}

export const chargePersonalDriverWaitTimeOverage = onCall(
  { region: 'europe-west1', secrets: [stripeSecretKey] },
  async (request: CallableRequest<ChargeWaitTimeInput>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise.');
    const tripId = request.data?.tripId;
    if (typeof tripId !== 'string' || !tripId.trim()) {
      throw new HttpsError('invalid-argument', 'Identifiant de trajet invalide.');
    }

    const db = getDb();
    const tripRef = db.collection('personal_driver_trips').doc(tripId);
    const initialTripSnap = await tripRef.get();
    if (!initialTripSnap.exists) throw new HttpsError('not-found', 'Trajet non trouvé.');
    const initialTripData = initialTripSnap.data();
    if (!initialTripData) throw new HttpsError('not-found', 'Données de trajet manquantes.');

    const callerIsAssignedDriver = initialTripData.assignedDriverId === request.auth.uid;
    const callerIsOwner = initialTripData.userId === request.auth.uid;
    const callerIsAdmin = await isAdminUser(request.auth.uid);
    if (!callerIsAssignedDriver && !callerIsOwner && !callerIsAdmin) {
      throw new HttpsError('permission-denied', 'Vous ne pouvez pas facturer ce trajet.');
    }

    const subscriptionRef = db.collection('personal_driver_subscriptions').doc(initialTripData.subscriptionId);
    const subscriptionSnap = await subscriptionRef.get();
    if (!subscriptionSnap.exists) throw new HttpsError('not-found', 'Abonnement introuvable.');
    const subscription = subscriptionSnap.data();
    if (!subscription) throw new HttpsError('not-found', 'Données d’abonnement manquantes.');

    const planId = initialTripData.planId ?? subscription.selectedPlanId ?? subscription.planId ?? 'basic';
    const config = WAIT_RATES[planId] ?? WAIT_RATES.basic;
    const isSpecial = Boolean(initialTripData.isSpecialTrip);
    const freeMinutes = isSpecial ? config.freeSpec : config.freeReg;
    const ratePerMin = isSpecial ? config.special : config.regular;
    const now = new Date();

    const claim = await db.runTransaction<WaitChargeClaim>(async (transaction) => {
      const tripSnap = await transaction.get(tripRef);
      if (!tripSnap.exists) throw new HttpsError('not-found', 'Trajet non trouvé.');
      const tripData = tripSnap.data();
      if (!tripData) throw new HttpsError('not-found', 'Données de trajet manquantes.');

      if (tripData.overageChargeStatus === 'billed' || tripData.overageWaitBilled === true) {
        const paymentIntentId = tripData.overagePaymentIntentId;
        if (typeof paymentIntentId !== 'string') {
          throw new HttpsError('failed-precondition', 'Les frais d’attente ont déjà été traités.');
        }
        return {
          feeAmount: Number(tripData.overageWaitFeeAmount ?? 0),
          overageMinutes: Number(tripData.overageWaitMinutes ?? 0),
          waitTimeMinutes: Number(tripData.waitTimeMinutes ?? 0),
          alreadyBilled: {
            feeBilled: Number(tripData.overageWaitFeeAmount ?? 0),
            overageMinutes: Number(tripData.overageWaitMinutes ?? 0),
            paymentIntentId,
          },
        };
      }
      if (tripData.overageChargeStatus === 'processing') {
        throw new HttpsError('aborted', 'La facturation des frais d’attente est déjà en cours.');
      }

      const waitTimeMinutes = getWaitMinutes(tripData, now);
      const overageMinutes = Math.max(0, waitTimeMinutes - freeMinutes);
      const feeAmount = Math.round(overageMinutes * ratePerMin * 100) / 100;
      transaction.update(tripRef, {
        waitTimeMinutes,
        waitEndedAt: admin.firestore.FieldValue.serverTimestamp(),
        overageWaitMinutes: overageMinutes,
        overageWaitFeeAmount: feeAmount,
        overageChargeStatus: overageMinutes > 0 ? 'processing' : 'not_required',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { feeAmount, overageMinutes, waitTimeMinutes };
    });

    if (claim.alreadyBilled) {
      return { success: true, waitTimeMinutes: claim.waitTimeMinutes, ...claim.alreadyBilled };
    }
    if (claim.overageMinutes <= 0) {
      return { success: true, waitTimeMinutes: claim.waitTimeMinutes, feeBilled: 0, overageMinutes: 0 };
    }

    const customerId = subscription.stripeCustomerId;
    const paymentMethodId = subscription.defaultPaymentMethodId;
    if (typeof customerId !== 'string' || typeof paymentMethodId !== 'string') {
      await tripRef.update({
        overageChargeStatus: 'failed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw new HttpsError('failed-precondition', 'Aucune carte enregistrée ne permet de facturer le dépassement.');
    }

    let paymentIntent: { id: string; status: string };
    try {
      paymentIntent = await getStripe().paymentIntents.create(
        {
          amount: Math.round(claim.feeAmount * 100),
          currency: DEFAULT_CURRENCY,
          customer: customerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          description: `Frais de dépassement d'attente (${claim.overageMinutes} min) - Trajet #${tripId}`,
          metadata: {
            purpose: 'personal_driver_wait_overage',
            tripId,
            subscriptionId: initialTripData.subscriptionId,
          },
        },
        { idempotencyKey: `personal_driver_wait_${tripId}` },
      );
    } catch (error) {
      await tripRef.update({
        overageChargeStatus: 'failed',
        overagePaymentError: error instanceof Error ? error.message.slice(0, 500) : 'Paiement refusé',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw new HttpsError('failed-precondition', 'Le prélèvement des frais d’attente a échoué.');
    }

    if (paymentIntent.status !== 'succeeded') {
      await tripRef.update({
        overageChargeStatus: 'review_required',
        overagePaymentIntentId: paymentIntent.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw new HttpsError('failed-precondition', 'Le paiement des frais d’attente nécessite une action supplémentaire.');
    }

    await tripRef.update({
      overageWaitBilled: true,
      overagePaymentIntentId: paymentIntent.id,
      overageChargeStatus: 'billed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      waitTimeMinutes: claim.waitTimeMinutes,
      feeBilled: claim.feeAmount,
      overageMinutes: claim.overageMinutes,
      paymentIntentId: paymentIntent.id,
    };
  },
);
