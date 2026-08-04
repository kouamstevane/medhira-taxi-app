import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { assertDriverNearPickup } from './geolocation.js';
import { isSubscriptionEntitled } from './entitlement.js';
export type PersonalDriverTripStatus =
  | 'scheduled'
  | 'driver_assigned'
  | 'driver_en_route'
  | 'driver_arrived'
  | 'passenger_picked_up'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

const ALLOWED_TRANSITIONS: Record<string, PersonalDriverTripStatus[]> = {
  driver_assigned: ['driver_en_route'],
  driver_en_route: ['driver_arrived'],
  driver_arrived: ['passenger_picked_up'],
  passenger_picked_up: ['in_progress'],
  in_progress: ['completed'],
};

const inputSchema = z.object({
  tripId: z.string().min(1),
  status: z.enum([
    'driver_en_route',
    'driver_arrived',
    'passenger_picked_up',
    'in_progress',
    'completed',
  ]),
  lat: z.number().optional(),
  lng: z.number().optional(),
  accuracy: z.number().finite().nonnegative().optional(),
});

export const driverUpdatePersonalDriverTrip = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    const parsed = inputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    }

    const { tripId, status: newStatus, lat, lng, accuracy } = parsed.data;
    const db = getDb();
    const tripRef = db.collection('personal_driver_trips').doc(tripId);
    const driverRef = db.collection('drivers').doc(request.auth.uid);

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(tripRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Trajet introuvable.');
      }

      const tripData = snap.data();
      if (tripData?.assignedDriverId !== request.auth!.uid) {
        throw new HttpsError('permission-denied', 'Ce trajet ne vous est pas attribué.');
      }

      if (typeof tripData.subscriptionId !== 'string' || !tripData.subscriptionId) {
        throw new HttpsError('failed-precondition', 'Le forfait du trajet est introuvable.');
      }
      const entitlementRef = db.collection('personal_driver_subscriptions').doc(tripData.subscriptionId);
      const subscriptionSnap = await transaction.get(entitlementRef);
      if (!subscriptionSnap.exists || !isSubscriptionEntitled(subscriptionSnap.data(), new Date())) {
        throw new HttpsError('failed-precondition', 'Le forfait doit être payé et actif pour poursuivre ce trajet.');
      }

      const currentStatus: PersonalDriverTripStatus = tripData?.status || 'scheduled';
      const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(newStatus as PersonalDriverTripStatus)) {
        throw new HttpsError(
          'failed-precondition',
          `Transition de statut non autorisée depuis ${currentStatus} vers ${newStatus}.`,
        );
      }

      if (newStatus === 'driver_arrived') {
        if (lat === undefined || lng === undefined || accuracy === undefined) {
          throw new HttpsError('invalid-argument', 'La position GPS et sa précision sont obligatoires à l’arrivée.');
        }
        const pickupLocation = tripData?.pickupLocation;
        if (
          !pickupLocation
          || typeof pickupLocation.latitude !== 'number'
          || typeof pickupLocation.longitude !== 'number'
        ) {
          throw new HttpsError('failed-precondition', 'Le point de prise en charge du trajet est introuvable.');
        }
        try {
          assertDriverNearPickup(
            { latitude: lat, longitude: lng },
            { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude },
            accuracy,
          );
        } catch {
          throw new HttpsError('failed-precondition', 'La position GPS ne confirme pas l’arrivée au lieu de prise en charge.');
        }
      }

      if (newStatus === 'passenger_picked_up' && !tripData?.waitStartedAt) {
        throw new HttpsError('failed-precondition', 'Le début serveur de l’attente est introuvable.');
      }

      const statusHistory = tripData?.statusHistory || [];
      statusHistory.push({
        status: newStatus,
        changedAt: new Date().toISOString(),
        changedBy: request.auth!.uid,
        location: lat !== undefined && lng !== undefined
          ? { lat, lng, accuracy: accuracy ?? null }
          : null,
      });

      transaction.update(tripRef, {
        status: newStatus,
        statusHistory,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(newStatus === 'driver_arrived'
          ? {
              waitStartedAt: admin.firestore.FieldValue.serverTimestamp(),
              waitEndedAt: admin.firestore.FieldValue.delete(),
              overageChargeStatus: admin.firestore.FieldValue.delete(),
              overageChargeClaimedAt: admin.firestore.FieldValue.delete(),
              overageChargeIdempotencyKey: admin.firestore.FieldValue.delete(),
              overagePaymentIntentId: admin.firestore.FieldValue.delete(),
              overageWaitBilled: admin.firestore.FieldValue.delete(),
            }
          : newStatus === 'passenger_picked_up'
            ? { waitEndedAt: admin.firestore.FieldValue.serverTimestamp() }
            : {}),
      });

      const driverAvailabilityUpdate =
        newStatus === 'completed'
          ? {
              isAvailable: true,
              availabilityStatus: 'available',
              activePersonalDriverTripId: null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }
          : {
              isAvailable: false,
              availabilityStatus: 'busy_personal_driver',
              activePersonalDriverTripId: tripId,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

      transaction.update(driverRef, {
        ...driverAvailabilityUpdate,
        ...(lat !== undefined && lng !== undefined
          ? { currentLocation: { lat, lng, accuracy: accuracy ?? null } }
          : {}),
      });
    });

    return { success: true, status: newStatus };
  },
);
