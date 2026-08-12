import * as admin from 'firebase-admin';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import {
  CreateParcelOrderSchema,
  FinalizeParcelCardPaymentSchema,
} from '../validators/schemas.js';
import { createStripeClient, isStripeError } from '../stripe/stripe-client.js';
import { toStripeAmount } from '../food/foodOrderPricing.js';
import { calculateParcelPrice } from './parcelPricing.js';

const REGION = 'europe-west1';
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

let stripeClient: ReturnType<typeof createStripeClient> | null = null;
function getStripe() {
  if (!stripeClient) stripeClient = createStripeClient(stripeSecretKey.value());
  return stripeClient;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '');
}

function getParcelRequestId(uid: string, clientRequestId: string | undefined): string {
  const requestId = clientRequestId ?? getDb().collection('parcel_requests').doc().id;
  return `${uid}_${requestId}`;
}

async function findReceiverId(phone: string): Promise<string | null> {
  const snapshot = await getDb()
    .collection('users')
    .where('phoneNumber', '==', normalizePhone(phone))
    .limit(1)
    .get();
  return snapshot.empty ? null : snapshot.docs[0].id;
}

function buildParcelData(
  uid: string,
  parcelId: string,
  input: ReturnType<typeof CreateParcelOrderSchema.parse>,
  receiverId: string | null,
  pricing: ReturnType<typeof calculateParcelPrice>,
  paymentStatus: 'pending' | 'reserved',
  paymentIntentId?: string,
): Record<string, unknown> {
  const typeLabels: Record<string, string> = {
    food: 'Nourriture',
    medicine: 'Médicament',
    document: 'Document',
    flowers: 'Fleurs',
    other: 'Autres',
  };
  const typeLabel = typeLabels[input.parcelType] ?? 'Colis';
  const description = input.customType
    ? `${typeLabel} (${input.customType})`
    : input.description || typeLabel;
  const now = admin.firestore.FieldValue.serverTimestamp();

  return {
    parcelId,
    senderId: uid,
    receiverId: receiverId ?? '',
    recipientName: input.recipientName,
    recipientPhone: normalizePhone(input.recipientPhone),
    recipientIsGuest: receiverId === null,
    driverId: null,
    status: 'pending',
    pickupLocation: input.pickupLocation,
    dropoffLocation: input.dropoffLocation,
    parcelType: input.parcelType,
    customType: input.customType ?? '',
    description,
    sizeCategory: input.sizeCategory,
    weight: input.weight ?? 5,
    pickupInstructions: input.pickupInstructions ?? '',
    estimatedPrice: pricing.price,
    finalPrice: null,
    price: pricing.price,
    currency: pricing.currency,
    distanceKm: pricing.distanceKm,
    durationMinutes: pricing.durationMinutes,
    paymentMethod: input.paymentMethod,
    paymentStatus,
    paymentValidated: paymentStatus === 'reserved',
    driverEarnings: pricing.driverEarnings,
    platformFee: pricing.platformFee,
    driverPaidOut: false,
    ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

type CreateParcelResult = {
  parcelId: string;
  amount: number;
  currency: string;
  paymentMethod: 'wallet' | 'card';
  clientSecret?: string;
  paymentIntentId?: string;
};

export const createParcelOrder = onCall(
  { region: REGION, secrets: [stripeSecretKey] },
  async (request: CallableRequest<unknown>): Promise<CreateParcelResult> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    const uid = request.auth.uid;
    const parsed = CreateParcelOrderSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    const input = parsed.data;

    await enforceRateLimit({
      identifier: uid,
      bucket: 'parcel:createParcelOrder',
      limit: 10,
      windowSec: 60,
    });

    const db = getDb();
    const requestRef = db.collection('parcel_requests').doc(getParcelRequestId(uid, input.clientRequestId));
    const existing = await requestRef.get();
    if (existing.exists) return existing.data() as CreateParcelResult;

    const receiverId = await findReceiverId(input.recipientPhone);
    const pricing = calculateParcelPrice({
      country: input.pickupLocation.country,
      pickup: input.pickupLocation,
      dropoff: input.dropoffLocation,
      sizeCategory: input.sizeCategory,
    });
    const parcelRef = db.collection('parcels').doc();

    if (input.paymentMethod === 'wallet') {
      const walletRef = db.collection('wallets').doc(uid);
      const transactionRef = db.collection('transactions').doc(`parcel_wallet_${parcelRef.id}`);
      const parcelData = buildParcelData(uid, parcelRef.id, input, receiverId, pricing, 'reserved');

      await db.runTransaction(async (tx) => {
        const walletSnap = await tx.get(walletRef);
        if (!walletSnap.exists) throw new HttpsError('not-found', 'Portefeuille introuvable.');
        const balance = walletSnap.data()?.balance;
        if (typeof balance !== 'number' || balance < pricing.price) {
          throw new HttpsError('failed-precondition', 'Solde insuffisant.');
        }
        tx.update(walletRef, {
          balance: balance - pricing.price,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(transactionRef, {
          id: transactionRef.id,
          userId: uid,
          type: 'payment',
          paymentMethod: 'wallet',
          amount: -pricing.price,
          currency: pricing.currency,
          description: `Réservation colis #${parcelRef.id.slice(0, 8)}`,
          parcelId: parcelRef.id,
          status: 'completed',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(parcelRef, parcelData);
        tx.set(requestRef, {
          parcelId: parcelRef.id,
          amount: pricing.price,
          currency: pricing.currency,
          paymentMethod: 'wallet',
        });
      });

      return {
        parcelId: parcelRef.id,
        amount: pricing.price,
        currency: pricing.currency,
        paymentMethod: 'wallet',
      };
    }

    const amountCents = toStripeAmount(pricing.price, pricing.stripeCurrency);
    let paymentIntent;
    try {
      paymentIntent = await getStripe().paymentIntents.create(
        {
          amount: amountCents,
          currency: pricing.stripeCurrency,
          automatic_payment_methods: { enabled: true },
          metadata: {
            purpose: 'parcel_delivery',
            userId: uid,
            parcelId: parcelRef.id,
          },
          description: `Livraison de colis #${parcelRef.id.slice(0, 8)}`,
        },
        { idempotencyKey: `parcel_${parcelRef.id}_${amountCents}` },
      );
    } catch (err) {
      if (isStripeError(err)) throw new HttpsError('internal', `Stripe error: ${err.message}`);
      throw new HttpsError('internal', 'Impossible de créer le paiement carte.');
    }

    if (!paymentIntent.client_secret) {
      throw new HttpsError('internal', 'Client secret Stripe manquant.');
    }

    const parcelData = buildParcelData(
      uid,
      parcelRef.id,
      input,
      receiverId,
      pricing,
      'pending',
      paymentIntent.id,
    );
    await db.runTransaction(async (tx) => {
      const requestSnap = await tx.get(requestRef);
      if (requestSnap.exists) return;
      tx.set(parcelRef, parcelData);
      tx.set(requestRef, {
        parcelId: parcelRef.id,
        amount: pricing.price,
        currency: pricing.currency,
        paymentMethod: 'card',
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
      });
    });

    return {
      parcelId: parcelRef.id,
      amount: pricing.price,
      currency: pricing.currency,
      paymentMethod: 'card',
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  },
);

export const finalizeParcelCardPayment = onCall(
  { region: REGION, secrets: [stripeSecretKey] },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    const uid = request.auth.uid;
    const parsed = FinalizeParcelCardPaymentSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    const { parcelId, paymentIntentId } = parsed.data;

    await enforceRateLimit({
      identifier: uid,
      bucket: 'parcel:finalizeParcelCardPayment',
      limit: 20,
      windowSec: 60,
    });

    const db = getDb();
    const parcelRef = db.collection('parcels').doc(parcelId);
    const parcelSnap = await parcelRef.get();
    if (!parcelSnap.exists) throw new HttpsError('not-found', 'Colis introuvable.');
    const parcel = parcelSnap.data()!;
    if (parcel.senderId !== uid) throw new HttpsError('permission-denied', 'Colis non autorisé.');
    if (parcel.paymentMethod !== 'card' || parcel.stripePaymentIntentId !== paymentIntentId) {
      throw new HttpsError('permission-denied', 'Paiement Stripe non associé à ce colis.');
    }

    let paymentIntent;
    try {
      paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);
    } catch (err) {
      if (isStripeError(err)) throw new HttpsError('internal', `Stripe error: ${err.message}`);
      throw new HttpsError('internal', 'Impossible de vérifier le paiement carte.');
    }

    const expectedCurrency = String(parcel.currency).toLowerCase() === 'fcfa' ? 'xaf' : String(parcel.currency).toLowerCase();
    const expectedAmount = toStripeAmount(Number(parcel.price), expectedCurrency);
    if (paymentIntent.status !== 'succeeded') {
      throw new HttpsError('failed-precondition', 'Paiement carte non confirmé.');
    }
    if (paymentIntent.amount !== expectedAmount || paymentIntent.currency !== expectedCurrency) {
      throw new HttpsError('failed-precondition', 'Montant Stripe incohérent avec le colis.');
    }
    if (paymentIntent.metadata?.parcelId !== parcelId || paymentIntent.metadata?.userId !== uid) {
      throw new HttpsError('permission-denied', 'PaymentIntent invalide pour ce colis.');
    }

    const transactionRef = db.collection('transactions').doc(`parcel_card_${parcelId}`);
    await db.runTransaction(async (tx) => {
      const freshParcel = await tx.get(parcelRef);
      const existingTransaction = await tx.get(transactionRef);
      if (!freshParcel.exists) throw new HttpsError('not-found', 'Colis introuvable.');
      const freshData = freshParcel.data()!;
      if (freshData.senderId !== uid) throw new HttpsError('permission-denied', 'Colis non autorisé.');
      if (freshData.paymentStatus === 'reserved') return;
      if (freshData.paymentStatus !== 'pending') {
        throw new HttpsError('failed-precondition', 'Ce colis ne peut plus être payé.');
      }
      if (!existingTransaction.exists) {
        tx.set(transactionRef, {
          id: transactionRef.id,
          userId: uid,
          type: 'payment',
          paymentMethod: 'card',
          amount: -Number(freshData.price),
          currency: freshData.currency,
          description: `Paiement carte colis #${parcelId.slice(0, 8)}`,
          parcelId,
          stripePaymentIntentId: paymentIntentId,
          status: 'completed',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      tx.update(parcelRef, {
        paymentStatus: 'reserved',
        paymentValidated: true,
        paymentTransactionId: transactionRef.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, parcelId, paymentIntentId };
  },
);
