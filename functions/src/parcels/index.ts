/**
 * Cloud Functions pour la livraison de colis (national + urbain).
 *
 * Triggers Firestore :
 *  - onParcelCreated  : assigne le chauffeur le plus proche disponible (status: pending → accepted)
 *  - onParcelStatusChanged : envoie SMS au destinataire selon le cycle de vie
 *
 * Le SMS est toujours envoyé : que le destinataire ait un compte (recipientIsGuest=false)
 * ou pas (recipientIsGuest=true). Le compte permet juste de voir le suivi en in-app
 * en plus du SMS.
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { selectNearestDriver, type DriverCandidate } from '../utils/matching.js';
import {
  sendSms,
  twilioAccountSid,
  twilioAuthToken,
  twilioFromNumber,
} from '../utils/smsService.js';

const TWILIO_SECRETS = [twilioAccountSid, twilioAuthToken, twilioFromNumber];
const REGION = 'europe-west1';

interface ParcelDoc {
  parcelId: string;
  senderId: string;
  receiverId: string;
  recipientPhone: string;
  recipientName: string;
  recipientIsGuest: boolean;
  driverId: string | null;
  status: 'pending' | 'accepted' | 'in_transit' | 'delivered' | 'cancelled';
  pickupLocation: { address: string; latitude: number; longitude: number; country: string };
  dropoffLocation: { address: string; latitude: number; longitude: number; country: string };
  description: string;
  sizeCategory: 'small' | 'medium' | 'large';
  pickupInstructions?: string;
  price: number;
  currency: string;
  distanceKm: number;
}

const MATCHING_RANGE_KM = 25;

/**
 * Cherche le chauffeur disponible le plus proche du point de retrait
 * et l'assigne au colis. Limité aux chauffeurs approved + isAvailable.
 */
export const onParcelCreated = onDocumentCreated(
  {
    document: 'parcels/{parcelId}',
    region: REGION,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const parcel = snap.data() as ParcelDoc;
    if (parcel.status !== 'pending' || parcel.driverId) return;

    const db = admin.firestore();

    // Récupération chauffeurs disponibles dans le pays du retrait
    const driversSnap = await db
      .collection('drivers')
      .where('status', '==', 'approved')
      .where('isAvailable', '==', true)
      .limit(50)
      .get();

    if (driversSnap.empty) {
      console.warn(`[onParcelCreated] ${parcel.parcelId} : aucun chauffeur disponible`);
      return;
    }

    const candidates: DriverCandidate[] = [];
    for (const doc of driversSnap.docs) {
      const data = doc.data();
      const loc = data.currentLocation;
      if (!loc) continue;
      const lat = typeof loc.lat === 'number' ? loc.lat : loc.latitude;
      const lng = typeof loc.lng === 'number' ? loc.lng : loc.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      candidates.push({ id: doc.id, data, loc: { lat, lng } });
    }

    if (candidates.length === 0) {
      console.warn(`[onParcelCreated] ${parcel.parcelId} : aucun chauffeur géolocalisé`);
      return;
    }

    const target = {
      lat: parcel.pickupLocation.latitude,
      lng: parcel.pickupLocation.longitude,
    };
    const matched = selectNearestDriver(candidates, target);
    if (!matched) {
      console.info(`[onParcelCreated] ${parcel.parcelId} : aucun chauffeur dans le rayon ${MATCHING_RANGE_KM}km`);
      return;
    }

    // Filter out drivers already on an active delivery (food or parcel)
    const driverDoc = await db.collection('drivers').doc(matched.id).get();
    if (driverDoc.data()?.activeDeliveryOrderId) {
      console.info(`[onParcelCreated] ${parcel.parcelId} : driver ${matched.id} déjà occupé`);
      return;
    }

    await db.runTransaction(async (tx) => {
      tx.update(snap.ref, {
        driverId: matched.id,
        status: 'accepted',
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(db.collection('drivers').doc(matched.id), {
        activeDeliveryOrderId: parcel.parcelId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // Custom claim required by RTDB rule on delivery_tracking/{parcelId}/location
    await admin.auth().setCustomUserClaims(matched.id, { activeDeliveryOrderId: parcel.parcelId });

    // FCM notification to driver
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

    console.log(`[onParcelCreated] ${parcel.parcelId} → driver ${matched.id}`);
  },
);

/**
 * Notifie le destinataire par SMS aux étapes-clés du colis.
 * Toujours envoyé (compte ou invité) — le téléphone est obligatoire à la création.
 */
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
    if (!before || !after) return;
    if (before.status === after.status) return;

    const greeting = after.recipientName ? `${after.recipientName}, ` : '';
    let body: string | null = null;

    if (after.recipientPhone) switch (after.status) {
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

    if (body) {
      const result = await sendSms({ to: after.recipientPhone, body });
      if (!result.success) {
        console.error(`[onParcelStatusChanged] SMS échec ${event.params.parcelId}:`, result.error);
      } else {
        console.log(
          `[onParcelStatusChanged] SMS envoyé ${event.params.parcelId} status=${after.status} sid=${result.sid}`,
        );
      }
    }

    // Free the driver and clean up tracking when the parcel reaches a terminal state
    if ((after.status === 'delivered' || after.status === 'cancelled') && after.driverId) {
      const db = admin.firestore();
      try {
        await db.collection('drivers').doc(after.driverId).update({
          activeDeliveryOrderId: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await admin.auth().setCustomUserClaims(after.driverId, { activeDeliveryOrderId: null });
        await admin.database().ref(`delivery_tracking/${event.params.parcelId}`).remove();
      } catch (err) {
        console.error(`[onParcelStatusChanged] cleanup driver/tracking failed ${event.params.parcelId}:`, err);
      }
    }
  },
);
