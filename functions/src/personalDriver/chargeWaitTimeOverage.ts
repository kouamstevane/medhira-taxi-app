import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineInt, defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { DEFAULT_CURRENCY } from '../config/stripe.js';
import { createStripeClient } from '../stripe/stripe-client.js';
import { isSubscriptionEntitled } from './entitlement.js';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const maximumWaitMinutesParam = defineInt('PERSONAL_DRIVER_MAX_WAIT_MINUTES');
const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

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
  return (await getDb().collection('admins').doc(uid).get()).exists;
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

function getMaximumWaitMinutes(): number {
  const maximum = maximumWaitMinutesParam.value();
  if (!Number.isFinite(maximum) || maximum <= 0 || !Number.isInteger(maximum)) {
    throw new HttpsError('failed-precondition', 'La durée maximale d’attente n’est pas configurée.');
  }
  return maximum;
}

const WAIT_RATES: Record<string, { regular: number; special: number; freeReg: number; freeSpec: number }> = {
  basic: { regular: 0.8, special: 0.8, freeReg: 3, freeSpec: 0 },
  classic: { regular: 0.5, special: 0.4, freeReg: 5, freeSpec: 15 },
  premium: { regular: 0.4, special: 0.3, freeReg: 10, freeSpec: 30 },
};

const inputSchema = z.object({ tripId: z.string().trim().min(1) }).strict();

interface AlreadyBilledClaim {
  kind: 'already_billed';
  feeBilled: number;
  overageMinutes: number;
  waitTimeMinutes: number;
  paymentIntentId?: string;
}

interface ReviewClaim {
  kind: 'review_required';
  message: string;
}

interface FreeClaim {
  kind: 'free';
  waitTimeMinutes: number;
}

interface ChargeableClaim {
  kind: 'chargeable';
  feeAmount: number;
  overageMinutes: number;
  waitTimeMinutes: number;
  customerId?: string;
  paymentMethodId?: string;
  idempotencyKey: string;
}

type WaitChargeClaim = AlreadyBilledClaim | ReviewClaim | FreeClaim | ChargeableClaim;

function updateFailedClaim(
  db: FirebaseFirestore.Firestore,
  tripRef: FirebaseFirestore.DocumentReference,
  idempotencyKey: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  return db.runTransaction(async (transaction) => {
    const tripSnap = await transaction.get(tripRef);
    if (!tripSnap.exists) return false;
    const tripData = tripSnap.data();
    if (tripData?.overageChargeStatus === 'billed') return true;
    if (tripData?.overageChargeStatus !== 'processing' || tripData.overageChargeIdempotencyKey !== idempotencyKey) {
      return false;
    }
    transaction.update(tripRef, {
      ...fields,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
}

export const chargePersonalDriverWaitTimeOverage = onCall(
  { region: 'europe-west1', secrets: [stripeSecretKey] },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise.');
    const parsed = inputSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0].message);

    const maximumWaitMinutes = getMaximumWaitMinutes();
    const db = getDb();
    const tripRef = db.collection('personal_driver_trips').doc(parsed.data.tripId);
    const adminCaller = await isAdminUser(request.auth.uid);
    const now = new Date();
    const idempotencyKey = `personal_driver_wait_overage_${parsed.data.tripId}`;

    const claim = await db.runTransaction<WaitChargeClaim>(async (transaction) => {
      const tripSnap = await transaction.get(tripRef);
      if (!tripSnap.exists) throw new HttpsError('not-found', 'Trajet non trouvé.');
      const tripData = tripSnap.data();
      if (!tripData) throw new HttpsError('not-found', 'Données de trajet manquantes.');

      const subscriptionId = tripData.subscriptionId;
      if (typeof subscriptionId !== 'string' || !subscriptionId) {
        throw new HttpsError('failed-precondition', 'Le forfait du trajet est introuvable.');
      }
      const subscriptionRef = db.collection('personal_driver_subscriptions').doc(subscriptionId);
      const subscriptionSnap = await transaction.get(subscriptionRef);
      if (!subscriptionSnap.exists) throw new HttpsError('not-found', 'Abonnement introuvable.');
      const subscription = subscriptionSnap.data();
      if (!subscription) throw new HttpsError('not-found', 'Données d’abonnement manquantes.');

      const authorized = adminCaller
        || tripData.userId === request.auth!.uid
        || tripData.assignedDriverId === request.auth!.uid;
      if (!authorized) throw new HttpsError('permission-denied', 'Vous ne pouvez pas facturer ce trajet.');
      if (!isSubscriptionEntitled(subscription, now)) {
        throw new HttpsError('failed-precondition', 'Le forfait doit être payé et actif pour facturer l’attente.');
      }

      if (tripData.overageChargeStatus === 'billed' || tripData.overageWaitBilled === true) {
        return {
          kind: 'already_billed',
          feeBilled: Number(tripData.overageWaitFeeAmount ?? 0),
          overageMinutes: Number(tripData.overageWaitMinutes ?? 0),
          waitTimeMinutes: Number(tripData.waitTimeMinutes ?? 0),
          ...(typeof tripData.overagePaymentIntentId === 'string'
            ? { paymentIntentId: tripData.overagePaymentIntentId }
            : {}),
        };
      }

      if (tripData.overageChargeStatus === 'processing') {
        const claimedAt = toDate(tripData.overageChargeClaimedAt);
        if (claimedAt && now.getTime() - claimedAt.getTime() < CLAIM_TIMEOUT_MS) {
          throw new HttpsError('aborted', 'La facturation des frais d’attente est déjà en cours.');
        }
      }

      const startedAt = toDate(tripData.waitStartedAt);
      const endedAt = toDate(tripData.waitEndedAt);
      if (!startedAt || !endedAt) {
        transaction.update(tripRef, {
          overageChargeStatus: 'review_required',
          overagePaymentError: 'Timestamps serveur d’attente manquants.',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { kind: 'review_required', message: 'Les timestamps serveur d’attente sont incomplets.' };
      }

      const durationMs = endedAt.getTime() - startedAt.getTime();
      if (durationMs < 0) {
        transaction.update(tripRef, {
          overageChargeStatus: 'review_required',
          overagePaymentError: 'Durée d’attente négative.',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { kind: 'review_required', message: 'La durée d’attente serveur est invalide.' };
      }
      const waitTimeMinutes = Math.ceil(durationMs / 60000);
      if (waitTimeMinutes > maximumWaitMinutes) {
        transaction.update(tripRef, {
          waitTimeMinutes,
          overageChargeStatus: 'review_required',
          overagePaymentError: 'Durée d’attente supérieure à la limite configurée.',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { kind: 'review_required', message: 'La durée d’attente dépasse la limite autorisée.' };
      }

      const planId = subscription.selectedPlanId;
      const config = WAIT_RATES[planId];
      if (!config) throw new HttpsError('failed-precondition', 'Formule du forfait invalide.');
      const isSpecial = Boolean(tripData.isSpecialTrip);
      const freeMinutes = isSpecial ? config.freeSpec : config.freeReg;
      const ratePerMinute = isSpecial ? config.special : config.regular;
      const overageMinutes = Math.max(0, waitTimeMinutes - freeMinutes);
      const feeAmount = Math.round(overageMinutes * ratePerMinute * 100) / 100;
      transaction.update(tripRef, {
        waitTimeMinutes,
        overageWaitMinutes: overageMinutes,
        overageWaitFeeAmount: feeAmount,
        overageChargeStatus: overageMinutes > 0 ? 'processing' : 'billed',
        overageChargeClaimedAt: now,
        overageChargeIdempotencyKey: idempotencyKey,
        overageWaitBilled: overageMinutes <= 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (overageMinutes <= 0) return { kind: 'free', waitTimeMinutes };
      return {
        kind: 'chargeable',
        feeAmount,
        overageMinutes,
        waitTimeMinutes,
        customerId: typeof subscription.stripeCustomerId === 'string' ? subscription.stripeCustomerId : undefined,
        paymentMethodId: typeof subscription.defaultPaymentMethodId === 'string'
          ? subscription.defaultPaymentMethodId
          : undefined,
        idempotencyKey,
      };
    });

    if (claim.kind === 'already_billed') {
      return {
        success: true,
        waitTimeMinutes: claim.waitTimeMinutes,
        feeBilled: claim.feeBilled,
        overageMinutes: claim.overageMinutes,
        ...(claim.paymentIntentId ? { paymentIntentId: claim.paymentIntentId } : {}),
      };
    }
    if (claim.kind === 'review_required') throw new HttpsError('failed-precondition', claim.message);
    if (claim.kind === 'free') {
      return { success: true, waitTimeMinutes: claim.waitTimeMinutes, feeBilled: 0, overageMinutes: 0 };
    }

    if (!claim.customerId || !claim.paymentMethodId) {
      await updateFailedClaim(db, tripRef, claim.idempotencyKey, {
        overageChargeStatus: 'failed',
        overagePaymentError: 'Aucune carte enregistrée ne permet de facturer le dépassement.',
      });
      throw new HttpsError('failed-precondition', 'Aucune carte enregistrée ne permet de facturer le dépassement.');
    }

    let paymentIntent: { id: string; status: string };
    try {
      paymentIntent = await getStripe().paymentIntents.create(
        {
          amount: Math.round(claim.feeAmount * 100),
          currency: DEFAULT_CURRENCY,
          customer: claim.customerId,
          payment_method: claim.paymentMethodId,
          off_session: true,
          confirm: true,
          description: `Frais de dépassement d'attente (${claim.overageMinutes} min) - Trajet #${parsed.data.tripId}`,
          metadata: {
            purpose: 'personal_driver_wait_overage',
            tripId: parsed.data.tripId,
          },
        },
        { idempotencyKey: claim.idempotencyKey },
      );
    } catch (error) {
      await updateFailedClaim(db, tripRef, claim.idempotencyKey, {
        overageChargeStatus: 'failed',
        overagePaymentError: error instanceof Error ? error.message.slice(0, 500) : 'Paiement refusé',
      });
      throw new HttpsError('failed-precondition', 'Le prélèvement des frais d’attente a échoué.');
    }

    if (paymentIntent.status !== 'succeeded') {
      await updateFailedClaim(db, tripRef, claim.idempotencyKey, {
        overageChargeStatus: 'review_required',
        overagePaymentIntentId: paymentIntent.id,
        overagePaymentError: 'Le paiement nécessite une action supplémentaire.',
      });
      throw new HttpsError('failed-precondition', 'Le paiement des frais d’attente nécessite une action supplémentaire.');
    }

    const finalized = await updateFailedClaim(db, tripRef, claim.idempotencyKey, {
      overageWaitBilled: true,
      overagePaymentIntentId: paymentIntent.id,
      overageChargeStatus: 'billed',
    });
    if (!finalized) throw new HttpsError('aborted', 'La facturation des frais d’attente doit être vérifiée.');

    return {
      success: true,
      waitTimeMinutes: claim.waitTimeMinutes,
      feeBilled: claim.feeAmount,
      overageMinutes: claim.overageMinutes,
      paymentIntentId: paymentIntent.id,
    };
  },
);
