import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import type Stripe from 'stripe';
import { selectNearestDriver, type DriverCandidate } from '../utils/matching.js';
import { createStripeClient } from '../stripe/stripe-client.js';
import {
  sendSms,
  twilioAccountSid,
  twilioAuthToken,
  twilioFromNumber,
} from '../utils/smsService.js';
import { isEligibleForAutoConfirmation } from './parcelLifecycle.js';
import {
  createParcelOrder,
  finalizeParcelCardPayment,
} from './createParcelOrder.js';
import {
  buildParcelDriverTransfer,
  calculateParcelSettlement,
  type ParcelSettlement,
} from './parcelSettlement.js';

const TWILIO_SECRETS = [twilioAccountSid, twilioAuthToken, twilioFromNumber];
const REGION = 'europe-west1';
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

let stripeClient: InstanceType<typeof Stripe> | null = null;
function getStripe(): InstanceType<typeof Stripe> {
  if (!stripeClient) stripeClient = createStripeClient(stripeSecretKey.value());
  return stripeClient;
}

async function setActiveDeliveryOrderClaim(uid: string | undefined | null, orderId: string | null): Promise<void> {
  if (!uid) return;
  try {
    const user = await admin.auth().getUser(uid);
    await admin.auth().setCustomUserClaims(uid, {
      ...(user.customClaims ?? {}),
      activeDeliveryOrderId: orderId,
    });
  } catch (err) {
    console.warn('[parcels] Failed to update active delivery claim', { uid, orderId, err });
  }
}

async function setDeliveryTrackingAccess(
  parcelId: string,
  driverId: string,
  participantIds: Array<string | undefined | null>,
): Promise<void> {
  const participants = participantIds.reduce<Record<string, boolean>>((acc, uid) => {
    if (uid) acc[uid] = true;
    return acc;
  }, {});

  await admin.database().ref(`delivery_tracking/${parcelId}`).update({
    driverId,
    participants,
  });
}

interface ParcelLocation {
  address: string;
  latitude: number;
  longitude: number;
  country: string;
}

interface ParcelDoc {
  parcelId: string;
  senderId: string;
  receiverId: string;
  recipientPhone: string;
  recipientName: string;
  recipientIsGuest: boolean;
  driverId: string | null;
  status: 'pending' | 'accepted' | 'in_transit' | 'delivered' | 'cancelled' | 'completed';
  pickupLocation: ParcelLocation;
  dropoffLocation: ParcelLocation;
  description: string;
  parcelType?: string;
  customType?: string;
  sizeCategory?: 'small' | 'medium' | 'large';
  pickupInstructions?: string;
  price: number;
  currency: string;
  distanceKm: number;
  paymentMethod?: 'wallet' | 'card';
  stripePaymentIntentId?: string;
  driverEarnings?: number;
  platformFee?: number;
  paymentStatus?: 'pending' | 'reserved' | 'paid';
  driverPaidOut?: boolean;
  driverPayoutStatus?: 'pending' | 'processing' | 'succeeded' | 'credited_to_balance' | 'failed';
  stripeTransferId?: string | null;
  deliveredAt?: admin.firestore.Timestamp | Date;
  updatedAt?: admin.firestore.Timestamp | Date;
}

async function assignPendingParcel(
  snap: FirebaseFirestore.DocumentSnapshot,
  parcel: ParcelDoc,
): Promise<void> {
  if (
    parcel.status !== 'pending' ||
    parcel.driverId ||
    (parcel.paymentMethod && parcel.paymentStatus !== 'reserved' && parcel.paymentStatus !== 'paid')
  ) return;

    const db = admin.firestore();
    const driversSnap = await db
      .collection('drivers')
      .where('status', '==', 'approved')
      .where('isAvailable', '==', true)
      .limit(50)
      .get();

    if (driversSnap.empty) return;

    const candidates: DriverCandidate[] = [];
    for (const driver of driversSnap.docs) {
      const data = driver.data();
      const loc = data.currentLocation;
      if (!loc) continue;
      const lat = typeof loc.lat === 'number' ? loc.lat : loc.latitude;
      const lng = typeof loc.lng === 'number' ? loc.lng : loc.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      candidates.push({ id: driver.id, data, loc: { lat, lng } });
    }

    const matched = selectNearestDriver(candidates, {
      lat: parcel.pickupLocation.latitude,
      lng: parcel.pickupLocation.longitude,
    });
    if (!matched) return;

    const driverRef = db.collection('drivers').doc(matched.id);
    const driverDoc = await driverRef.get();
    if (driverDoc.data()?.activeDeliveryOrderId) return;

    await db.runTransaction(async (tx) => {
      tx.update(snap.ref, {
        driverId: matched.id,
        status: 'accepted',
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(driverRef, {
        activeDeliveryOrderId: parcel.parcelId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await setDeliveryTrackingAccess(parcel.parcelId, matched.id, [
      matched.id,
      parcel.senderId,
      parcel.receiverId,
    ]);

    await Promise.all([
      setActiveDeliveryOrderClaim(matched.id, parcel.parcelId),
      setActiveDeliveryOrderClaim(parcel.senderId, parcel.parcelId),
      setActiveDeliveryOrderClaim(parcel.receiverId, parcel.receiverId ? parcel.parcelId : null),
    ]);

    const fcmToken = driverDoc.data()?.fcmToken;
    if (fcmToken) {
      try {
        await admin.messaging().send({
          token: fcmToken,
          notification: {
            title: 'Nouveau colis à transporter',
            body: `Retrait : ${parcel.pickupLocation.address}`,
          },
          data: { type: 'parcel_assigned', parcelId: parcel.parcelId },
        });
      } catch (err) {
        console.warn(`[onParcelCreated] FCM push échec ${parcel.parcelId}:`, err);
      }
    }
}

export const onParcelCreated = onDocumentCreated(
  {
    document: 'parcels/{parcelId}',
    region: REGION,
  },
  async (event) => {
    if (!event.data) return;
    await assignPendingParcel(event.data, event.data.data() as ParcelDoc);
  },
);

export const onParcelPaymentValidated = onDocumentUpdated(
  {
    document: 'parcels/{parcelId}',
    region: REGION,
  },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data() as ParcelDoc | undefined;
    const after = event.data.after.data() as ParcelDoc | undefined;
    if (!before || !after || before.paymentStatus === after.paymentStatus) return;
    if (after.paymentStatus === 'reserved') {
      await assignPendingParcel(event.data.after, after);
    }
  },
);

export const onParcelStatusChanged = onDocumentUpdated(
  {
    document: 'parcels/{parcelId}',
    region: REGION,
    secrets: TWILIO_SECRETS,
  },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data() as ParcelDoc | undefined;
    const after = event.data.after.data() as ParcelDoc | undefined;
    if (!before || !after || before.status === after.status) return;

    const greeting = after.recipientName ? `${after.recipientName}, ` : '';
    let body: string | null = null;
    if (after.recipientPhone) {
      switch (after.status) {
        case 'accepted':
          body = `${greeting}un colis vous est destiné via Medjira. Un chauffeur a été assigné et va récupérer le colis sous peu.`;
          break;
        case 'in_transit':
          body = `${greeting}votre colis Medjira est en route ! Livraison prévue à : ${after.dropoffLocation.address}.`;
          break;
        case 'delivered':
          body = `${greeting}votre colis a été livré. Merci d'utiliser Medjira !`;
          break;
        case 'cancelled':
          body = `${greeting}l'envoi du colis qui vous était destiné a été annulé. Contactez l'expéditeur pour plus d'informations.`;
          break;
      }
    }

    if (body) {
      const result = await sendSms({ to: after.recipientPhone, body });
      if (!result.success) {
        console.error(`[onParcelStatusChanged] SMS échec ${event.params.parcelId}:`, result.error);
      }
    }

    if ((after.status === 'delivered' || after.status === 'cancelled') && after.driverId) {
      const db = admin.firestore();
      try {
        await db.collection('drivers').doc(after.driverId).update({
          activeDeliveryOrderId: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await Promise.all([
          setActiveDeliveryOrderClaim(after.driverId, null),
          setActiveDeliveryOrderClaim(after.senderId, null),
          setActiveDeliveryOrderClaim(after.receiverId, null),
        ]);
        await admin.database().ref(`delivery_tracking/${event.params.parcelId}`).remove();
      } catch (err) {
        console.error(`[onParcelStatusChanged] cleanup failed ${event.params.parcelId}:`, err);
      }
    }
  },
);

interface PreparedParcelSettlement {
  parcelRef: FirebaseFirestore.DocumentReference;
  parcel: ParcelDoc;
  driverRef: FirebaseFirestore.DocumentReference;
  stripeAccountId: string | null;
  settlementRef: FirebaseFirestore.DocumentReference;
  settlement: ParcelSettlement;
  existingTransferId: string | null;
  alreadySettled: boolean;
}

async function prepareParcelSettlement(
  parcelId: string,
  actorUid?: string,
): Promise<PreparedParcelSettlement> {
  const db = admin.firestore();
  const parcelRef = db.collection('parcels').doc(parcelId);
  const settlementRef = db.collection('parcel_settlements').doc(parcelId);

  return db.runTransaction(async (tx) => {
    const parcelSnap = await tx.get(parcelRef);
    if (!parcelSnap.exists) throw new HttpsError('not-found', 'Colis introuvable.');

    const parcel = parcelSnap.data() as ParcelDoc;
    if (actorUid && parcel.senderId !== actorUid && parcel.receiverId !== actorUid) {
      throw new HttpsError('permission-denied', 'Vous ne participez pas à ce colis.');
    }
    if (parcel.status !== 'delivered' && parcel.status !== 'completed') {
      throw new HttpsError('failed-precondition', 'Le colis doit être livré avant confirmation.');
    }
    if (!parcel.driverId) {
      throw new HttpsError('failed-precondition', 'Aucun chauffeur n’est associé à ce colis.');
    }

    const driverRef = db.collection('drivers').doc(parcel.driverId);
    const [driverSnap, settlementSnap] = await Promise.all([
      tx.get(driverRef),
      tx.get(settlementRef),
    ]);
    if (!driverSnap.exists) throw new HttpsError('failed-precondition', 'Profil chauffeur introuvable.');

    const settlement = calculateParcelSettlement(parcel.price, parcel.currency);
    const existingSettlement = settlementSnap.exists ? settlementSnap.data() : undefined;
    const existingTransferId = typeof existingSettlement?.stripeTransferId === 'string'
      ? existingSettlement.stripeTransferId
      : null;

    if (parcel.driverPaidOut === true) {
      return {
        parcelRef,
        parcel,
        driverRef,
        stripeAccountId: typeof driverSnap.data()?.stripeAccountId === 'string'
          ? driverSnap.data()?.stripeAccountId
          : null,
        settlementRef,
        settlement,
        existingTransferId,
        alreadySettled: true,
      };
    }

    if (parcel.paymentMethod === 'card') {
      const driverData = driverSnap.data() ?? {};
      if (typeof driverData.stripeAccountId !== 'string' || driverData.stripeAccountStatus !== 'active') {
        throw new HttpsError(
          'failed-precondition',
          'Le compte Stripe du chauffeur n’est pas prêt à recevoir son paiement.',
        );
      }
      if (typeof parcel.stripePaymentIntentId !== 'string') {
        throw new HttpsError('failed-precondition', 'Paiement Stripe introuvable pour ce colis.');
      }
    }

    tx.set(settlementRef, {
      parcelId,
      driverId: parcel.driverId,
      paymentMethod: parcel.paymentMethod ?? 'wallet',
      settlementVersion: 'parcel_split_v1',
      totalAmount: settlement.totalAmount,
      driverEarnings: settlement.driverEarnings,
      platformFee: settlement.platformFee,
      currency: settlement.currency,
      stripeCurrency: settlement.stripeCurrency,
      totalAmountMinor: settlement.totalAmountMinor,
      driverEarningsMinor: settlement.driverEarningsMinor,
      platformFeeMinor: settlement.platformFeeMinor,
      status: existingSettlement?.status === 'succeeded' ? 'succeeded' : 'processing',
      stripeTransferId: existingTransferId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      parcelRef,
      parcel,
      driverRef,
      stripeAccountId: typeof driverSnap.data()?.stripeAccountId === 'string'
        ? driverSnap.data()?.stripeAccountId
        : null,
      settlementRef,
      settlement,
      existingTransferId,
      alreadySettled: false,
    };
  });
}

async function transferParcelDriverShare(
  prepared: PreparedParcelSettlement,
): Promise<string | null> {
  if (prepared.alreadySettled || prepared.parcel.paymentMethod !== 'card') return null;
  if (prepared.existingTransferId) return prepared.existingTransferId;
  if (!prepared.stripeAccountId || !prepared.parcel.stripePaymentIntentId) {
    throw new HttpsError('failed-precondition', 'Le transfert chauffeur ne peut pas être préparé.');
  }

  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.retrieve(prepared.parcel.stripePaymentIntentId);
  if (paymentIntent.status !== 'succeeded') {
    throw new HttpsError('failed-precondition', 'Le paiement client n’est pas confirmé par Stripe.');
  }
  if (paymentIntent.currency !== prepared.settlement.stripeCurrency) {
    throw new HttpsError('failed-precondition', 'La devise du paiement Stripe est incohérente.');
  }

  const latestCharge = typeof paymentIntent.latest_charge === 'string'
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id;
  const transfer = await stripe.transfers.create(
    {
      ...buildParcelDriverTransfer(
        prepared.parcel.parcelId,
        prepared.parcel.driverId!,
        prepared.stripeAccountId,
        prepared.settlement,
      ),
      ...(latestCharge ? { source_transaction: latestCharge } : {}),
    },
    { idempotencyKey: `parcel_driver_transfer_${prepared.parcel.parcelId}` },
  );
  return transfer.id;
}

async function markParcelSettlementFailed(
  prepared: PreparedParcelSettlement,
  error: unknown,
): Promise<void> {
  await prepared.settlementRef.set({
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function finalizeParcelSettlement(
  prepared: PreparedParcelSettlement,
  stripeTransferId: string | null,
): Promise<void> {
  if (prepared.alreadySettled) return;

  const db = admin.firestore();
  await db.runTransaction(async (tx) => {
    const [parcelSnap, driverSnap] = await Promise.all([
      tx.get(prepared.parcelRef),
      tx.get(prepared.driverRef),
    ]);
    if (!parcelSnap.exists || !driverSnap.exists) {
      throw new HttpsError('not-found', 'Données de règlement introuvables.');
    }
    const parcel = parcelSnap.data() as ParcelDoc;
    if (parcel.driverPaidOut === true) return;

    const driverUpdate: Record<string, unknown> = {
      deliveriesCompleted: admin.firestore.FieldValue.increment(1),
      deliveryEarnings: admin.firestore.FieldValue.increment(prepared.settlement.driverEarnings),
      currency: prepared.settlement.stripeCurrency,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (prepared.parcel.paymentMethod !== 'card') {
      driverUpdate.pendingBalanceCents = admin.firestore.FieldValue.increment(
        prepared.settlement.driverEarningsMinor,
      );
    }

    tx.update(prepared.parcelRef, {
      status: 'completed',
      paymentStatus: 'paid',
      driverPaidOut: true,
      driverEarnings: prepared.settlement.driverEarnings,
      platformFee: prepared.settlement.platformFee,
      driverPayoutStatus: prepared.parcel.paymentMethod === 'card' ? 'succeeded' : 'credited_to_balance',
      stripeTransferId,
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(prepared.driverRef, driverUpdate);
    tx.set(prepared.settlementRef, {
      status: prepared.parcel.paymentMethod === 'card' ? 'succeeded' : 'credited_to_balance',
      stripeTransferId,
      settledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function settleParcelPayout(parcelId: string, actorUid?: string): Promise<void> {
  const prepared = await prepareParcelSettlement(parcelId, actorUid);
  if (prepared.alreadySettled) return;

  let stripeTransferId: string | null = prepared.existingTransferId;
  try {
    stripeTransferId = await transferParcelDriverShare(prepared);
  } catch (error) {
    await markParcelSettlementFailed(prepared, error);
    throw error;
  }

  await finalizeParcelSettlement(prepared, stripeTransferId);
}

export const confirmParcelReceipt = onCall(
  { region: REGION, secrets: [stripeSecretKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    const uid = request.auth.uid;
    const { parcelId } = (request.data as { parcelId?: string }) || {};
    if (!parcelId || typeof parcelId !== 'string') {
      throw new HttpsError('invalid-argument', 'Identifiant de colis invalide.');
    }

    await settleParcelPayout(parcelId, uid);

    return { success: true, parcelId };
  },
);

export const autoConfirmDeliveredParcels = onSchedule(
  { schedule: 'every 1 hours', region: REGION, secrets: [stripeSecretKey] },
  async () => {
    const db = admin.firestore();
    const nowMs = Date.now();
    const snap = await db
      .collection('parcels')
      .where('status', '==', 'delivered')
      .limit(100)
      .get();

    for (const docSnap of snap.docs) {
      const raw = docSnap.data() as ParcelDoc;
      const deliveredAtMs = raw.deliveredAt && typeof (raw.deliveredAt as { toMillis?: () => number }).toMillis === 'function'
        ? (raw.deliveredAt as { toMillis: () => number }).toMillis()
        : undefined;
      const updatedAtMs = raw.updatedAt && typeof (raw.updatedAt as { toMillis?: () => number }).toMillis === 'function'
        ? (raw.updatedAt as { toMillis: () => number }).toMillis()
        : undefined;

      if (!isEligibleForAutoConfirmation({
        status: raw.status,
        driverPaidOut: raw.driverPaidOut,
        deliveredAtMs,
        updatedAtMs,
      }, nowMs)) continue;

      try {
        await settleParcelPayout(docSnap.id);
      } catch (err) {
        console.error(`[autoConfirmDeliveredParcels] failed ${docSnap.id}:`, err);
      }
    }
  },
);

export { createParcelOrder, finalizeParcelCardPayment };
