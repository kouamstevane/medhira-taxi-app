import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { assertDriverNearPickup, getPersonalDriverArrivalGpsConfig } from './geolocation.js';
import { isSubscriptionEntitled, markExpiredSubscriptionInTransaction } from './entitlement.js';
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

    const result = await db.runTransaction(async (transaction) => {
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
      if (!subscriptionSnap.exists) {
        throw new HttpsError('failed-precondition', 'Le forfait doit être payé et actif pour poursuivre ce trajet.');
      }
      const now = new Date();
      const subscription = subscriptionSnap.data();
      if (markExpiredSubscriptionInTransaction(transaction, entitlementRef, subscription, now)) {
        return { kind: 'expired' as const };
      }
      if (!isSubscriptionEntitled(subscription, now)) {
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

      let gpsReviewRequired = false;
      if (newStatus === 'driver_arrived') {
        const pickupLocation = tripData?.pickupLocation;
        if (lat === undefined || lng === undefined || accuracy === undefined) {
          const pickupEvidence = pickupLocation
            && typeof pickupLocation.latitude === 'number'
            && typeof pickupLocation.longitude === 'number'
            ? { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude }
            : null;
          transaction.update(tripRef, {
            operationalReviewRequired: true,
            operationalReviewReason: 'driver_arrival_gps_missing',
            operationalReviewAt: admin.firestore.FieldValue.serverTimestamp(),
            operationalReviewBy: request.auth!.uid,
            operationalReviewEvidence: {
              driverLocation: { latitude: lat ?? null, longitude: lng ?? null },
              pickupLocation: pickupEvidence,
              accuracyMeters: accuracy ?? null,
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          return {
            kind: 'gps_review_required' as const,
            errorCode: 'invalid-argument' as const,
            errorMessage: 'La position GPS et sa précision sont obligatoires à l’arrivée.',
          };
        }
        if (
          !pickupLocation
          || typeof pickupLocation.latitude !== 'number'
          || typeof pickupLocation.longitude !== 'number'
        ) {
          throw new HttpsError('failed-precondition', 'Le point de prise en charge du trajet est introuvable.');
        }
        let gpsConfig;
        try {
          gpsConfig = getPersonalDriverArrivalGpsConfig();
        } catch {
          throw new HttpsError('failed-precondition', 'La configuration GPS d’arrivée est indisponible.');
        }
        try {
          assertDriverNearPickup(
            { latitude: lat, longitude: lng },
            { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude },
            accuracy,
            gpsConfig,
          );
        } catch {
          transaction.update(tripRef, {
            operationalReviewRequired: true,
            operationalReviewReason: 'driver_arrival_gps_mismatch',
            operationalReviewAt: admin.firestore.FieldValue.serverTimestamp(),
            operationalReviewBy: request.auth!.uid,
            operationalReviewEvidence: {
              driverLocation: { latitude: lat, longitude: lng },
              pickupLocation: { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude },
              accuracyMeters: accuracy,
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          gpsReviewRequired = true;
        }
      }

      if (gpsReviewRequired) {
        return {
          kind: 'gps_review_required' as const,
          errorCode: 'failed-precondition' as const,
          errorMessage: 'La position GPS ne confirme pas l’arrivée au lieu de prise en charge.',
        };
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
      return { kind: 'updated' as const };
    });

    if (result.kind === 'expired') {
      throw new HttpsError('failed-precondition', 'Le forfait a expiré.');
    }
    if (result.kind === 'gps_review_required') {
      throw new HttpsError(result.errorCode, result.errorMessage);
    }

    return { success: true, status: newStatus };
  },
);
