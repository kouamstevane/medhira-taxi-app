import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { isSubscriptionEntitled } from './entitlement.js';

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

async function assertAdminUser(uid: string): Promise<void> {
  const db = getDb();
  const adminDoc = await db.collection('admins').doc(uid).get();
  if (!adminDoc.exists) {
    throw new HttpsError('permission-denied', 'Réservé aux administrateurs.');
  }
}

function assertAssignableDriver(driverId: string, driver: FirebaseFirestore.DocumentData | undefined): void {
  if (!driver) {
    throw new HttpsError('not-found', 'Chauffeur introuvable.');
  }

  const approved =
    driver?.status === 'approved' ||
    driver?.driverStatus === 'approved' ||
    driver?.kycStatus === 'approved';
  if (!approved) {
    throw new HttpsError('failed-precondition', 'Le chauffeur doit être approuvé avant affectation.');
  }

  if (driver?.isAvailable === false || driver?.availabilityStatus === 'busy_personal_driver') {
    throw new HttpsError('failed-precondition', 'Le chauffeur sélectionné n’est pas disponible.');
  }
}

function assertTripSubscriptionEntitled(
  trip: FirebaseFirestore.DocumentData | undefined,
  subscription: FirebaseFirestore.DocumentData | undefined,
): void {
  const subscriptionId = trip?.subscriptionId;
  if (typeof subscriptionId !== 'string' || !subscriptionId) {
    throw new HttpsError('failed-precondition', 'Le forfait du trajet est introuvable.');
  }
  if (!isSubscriptionEntitled(subscription, new Date())) {
    throw new HttpsError('failed-precondition', 'Le forfait doit être payé et actif avant affectation.');
  }
}

const adminActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('cancelSubscription'),
    subscriptionId: z.string().min(1),
    reason: z.string().optional(),
  }),
  z.object({
    action: z.literal('assignTrip'),
    tripId: z.string().min(1),
    driverId: z.string().min(1),
    vehicleId: z.string().min(1),
  }),
  z.object({
    action: z.literal('reassignDriverEmergency'),
    tripId: z.string().min(1),
    newDriverId: z.string().min(1),
    newVehicleId: z.string().min(1),
  }),
]);

export const adminManagePersonalDriver = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    await assertAdminUser(request.auth.uid);
    const adminUid = request.auth.uid;

    const parsed = adminActionSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    }

    const db = getDb();
    const payload = parsed.data;

    if (payload.action === 'cancelSubscription') {
      const subRef = db.collection('personal_driver_subscriptions').doc(payload.subscriptionId);
      await subRef.update({
        status: 'cancelled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelledBy: request.auth.uid,
        cancelReason: payload.reason || null,
      });
      return { success: true };
    }

    if (payload.action === 'assignTrip') {
      const driverRef = db.collection('drivers').doc(payload.driverId);
      const tripRef = db.collection('personal_driver_trips').doc(payload.tripId);
      await db.runTransaction(async (transaction) => {
        const tripSnap = await transaction.get(tripRef);
        if (!tripSnap.exists) throw new HttpsError('not-found', 'Trajet introuvable.');
        const trip = tripSnap.data();
        if (trip?.status && !['scheduled', 'driver_assigned'].includes(trip.status)) {
          throw new HttpsError('failed-precondition', 'Ce trajet ne peut pas être affecté dans son statut actuel.');
        }
        if (typeof trip?.subscriptionId !== 'string' || !trip.subscriptionId) {
          throw new HttpsError('failed-precondition', 'Le forfait du trajet est introuvable.');
        }
        const subscriptionSnap = await transaction.get(
          db.collection('personal_driver_subscriptions').doc(trip.subscriptionId),
        );
        const driverSnap = await transaction.get(driverRef);
        if (!subscriptionSnap.exists) throw new HttpsError('not-found', 'Abonnement introuvable.');
        if (!driverSnap.exists) throw new HttpsError('not-found', 'Chauffeur introuvable.');
        assertTripSubscriptionEntitled(trip, subscriptionSnap.data());
        assertAssignableDriver(payload.driverId, driverSnap.data());

        transaction.update(tripRef, {
          assignedDriverId: payload.driverId,
          assignedVehicleId: payload.vehicleId,
          status: 'driver_assigned',
          assignedAt: admin.firestore.FieldValue.serverTimestamp(),
          assignedBy: adminUid,
        });
        if (trip?.userId) {
          transaction.set(db.collection('notifications').doc(), {
            userId: trip.userId,
            type: 'personal_driver_trip_assigned',
            title: 'Chauffeur affecté',
            message: 'Un chauffeur et un véhicule ont été affectés à votre trajet Personal Driver.',
            tripId: payload.tripId,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        transaction.set(db.collection('notifications').doc(), {
          userId: payload.driverId,
          type: 'personal_driver_trip_assigned_driver',
          title: 'Nouvelle mission Personal Driver',
          message: 'Une mission Personal Driver vous a été affectée.',
          tripId: payload.tripId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      return { success: true };
    }

    if (payload.action === 'reassignDriverEmergency') {
      const driverRef = db.collection('drivers').doc(payload.newDriverId);
      const tripRef = db.collection('personal_driver_trips').doc(payload.tripId);
      await db.runTransaction(async (transaction) => {
        const tripSnap = await transaction.get(tripRef);
        if (!tripSnap.exists) throw new HttpsError('not-found', 'Trajet introuvable.');
        const trip = tripSnap.data();
        if (typeof trip?.subscriptionId !== 'string' || !trip.subscriptionId) {
          throw new HttpsError('failed-precondition', 'Le forfait du trajet est introuvable.');
        }
        const subscriptionSnap = await transaction.get(
          db.collection('personal_driver_subscriptions').doc(trip.subscriptionId),
        );
        const driverSnap = await transaction.get(driverRef);
        if (!subscriptionSnap.exists) throw new HttpsError('not-found', 'Abonnement introuvable.');
        if (!driverSnap.exists) throw new HttpsError('not-found', 'Chauffeur introuvable.');
        assertTripSubscriptionEntitled(trip, subscriptionSnap.data());
        assertAssignableDriver(payload.newDriverId, driverSnap.data());

        transaction.update(tripRef, {
          assignedDriverId: payload.newDriverId,
          assignedVehicleId: payload.newVehicleId,
          status: 'driver_assigned',
          driverAlertFlagged: false,
          emergencyReassignedAt: admin.firestore.FieldValue.serverTimestamp(),
          emergencyReassignedBy: adminUid,
        });
        if (trip?.userId) {
          transaction.set(db.collection('notifications').doc(), {
            userId: trip.userId,
            type: 'personal_driver_emergency_reassignment',
            title: 'Chauffeur remplacé',
            message: 'Un chauffeur de remplacement a été affecté à votre trajet Personal Driver.',
            tripId: payload.tripId,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        transaction.set(db.collection('notifications').doc(), {
          userId: payload.newDriverId,
          type: 'personal_driver_emergency_reassignment_driver',
          title: 'Mission de remplacement',
          message: 'Une mission Personal Driver de remplacement vous a été affectée.',
          tripId: payload.tripId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      return { success: true };
    }

    throw new HttpsError('invalid-argument', 'Action non reconnue.');
  },
);
