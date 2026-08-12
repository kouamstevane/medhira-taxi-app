import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { selectNearestDriver, type DriverCandidate } from '../utils/matching.js';
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

const TWILIO_SECRETS = [twilioAccountSid, twilioAuthToken, twilioFromNumber];
const REGION = 'europe-west1';

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
  paymentStatus?: 'pending' | 'reserved' | 'paid';
  driverPaidOut?: boolean;
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

function calculateDriverEarnings(price: unknown): number {
  const numericPrice = typeof price === 'number' && Number.isFinite(price) ? price : 0;
  return Math.round(Math.max(0, numericPrice) * 0.7 * 100) / 100;
}

async function settleParcelPayout(
  tx: FirebaseFirestore.Transaction,
  parcelRef: FirebaseFirestore.DocumentReference,
  parcel: ParcelDoc,
): Promise<void> {
  const driverEarnings = calculateDriverEarnings(parcel.price);
  const earningsCents = Math.round(driverEarnings * 100);

  tx.update(parcelRef, {
    status: 'completed',
    paymentStatus: 'paid',
    driverPaidOut: true,
    confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (parcel.driverId) {
    const driverRef = admin.firestore().collection('drivers').doc(parcel.driverId);
    tx.update(driverRef, {
      deliveriesCompleted: admin.firestore.FieldValue.increment(1),
      deliveryEarnings: admin.firestore.FieldValue.increment(driverEarnings),
      pendingBalanceCents: admin.firestore.FieldValue.increment(earningsCents),
      currency: parcel.currency ? parcel.currency.toLowerCase() : 'cad',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

export const confirmParcelReceipt = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    const uid = request.auth.uid;
    const { parcelId } = (request.data as { parcelId?: string }) || {};
    if (!parcelId || typeof parcelId !== 'string') {
      throw new HttpsError('invalid-argument', 'Identifiant de colis invalide.');
    }

    const db = admin.firestore();
    const parcelRef = db.collection('parcels').doc(parcelId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(parcelRef);
      if (!snap.exists) throw new HttpsError('not-found', 'Colis introuvable.');
      const parcel = snap.data() as ParcelDoc;
      if (parcel.senderId !== uid && parcel.receiverId !== uid) {
        throw new HttpsError('permission-denied', 'Vous ne participez pas à ce colis.');
      }
      if (parcel.status !== 'delivered' && parcel.status !== 'completed') {
        throw new HttpsError('failed-precondition', 'Le colis doit être livré avant confirmation.');
      }
      if (parcel.driverPaidOut === true) return;
      await settleParcelPayout(tx, parcelRef, parcel);
    });

    return { success: true, parcelId };
  },
);

export const autoConfirmDeliveredParcels = onSchedule(
  { schedule: 'every 1 hours', region: REGION },
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
        await db.runTransaction(async (tx) => {
          const freshSnap = await tx.get(docSnap.ref);
          if (!freshSnap.exists) return;
          const parcel = freshSnap.data() as ParcelDoc;
          if (parcel.status !== 'delivered' || parcel.driverPaidOut === true) return;
          await settleParcelPayout(tx, docSnap.ref, parcel);
        });
      } catch (err) {
        console.error(`[autoConfirmDeliveredParcels] failed ${docSnap.id}:`, err);
      }
    }
  },
);

export { createParcelOrder, finalizeParcelCardPayment };
