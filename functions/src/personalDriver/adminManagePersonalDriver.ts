import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';

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

async function assertAssignableDriver(driverId: string): Promise<void> {
  const driverSnap = await getDb().collection('drivers').doc(driverId).get();
  if (!driverSnap.exists) {
    throw new HttpsError('not-found', 'Chauffeur introuvable.');
  }

  const driver = driverSnap.data();
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
      await assertAssignableDriver(payload.driverId);
      const tripRef = db.collection('personal_driver_trips').doc(payload.tripId);
      const tripSnap = await tripRef.get();
      if (!tripSnap.exists) {
        throw new HttpsError('not-found', 'Trajet introuvable.');
      }
      const trip = tripSnap.data();
      if (trip?.status && !['scheduled', 'driver_assigned'].includes(trip.status)) {
        throw new HttpsError('failed-precondition', 'Ce trajet ne peut pas être affecté dans son statut actuel.');
      }
      const batch = db.batch();
      batch.update(tripRef, {
        assignedDriverId: payload.driverId,
        assignedVehicleId: payload.vehicleId,
        status: 'driver_assigned',
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
        assignedBy: request.auth.uid,
      });
      if (trip?.userId) {
        batch.set(db.collection('notifications').doc(), {
          userId: trip.userId,
          type: 'personal_driver_trip_assigned',
          title: 'Chauffeur affecté',
          message: 'Un chauffeur et un véhicule ont été affectés à votre trajet Personal Driver.',
          tripId: payload.tripId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      batch.set(db.collection('notifications').doc(), {
        userId: payload.driverId,
        type: 'personal_driver_trip_assigned_driver',
        title: 'Nouvelle mission Personal Driver',
        message: 'Une mission Personal Driver vous a été affectée.',
        tripId: payload.tripId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await batch.commit();
      return { success: true };
    }

    if (payload.action === 'reassignDriverEmergency') {
      await assertAssignableDriver(payload.newDriverId);
      const tripRef = db.collection('personal_driver_trips').doc(payload.tripId);
      const tripSnap = await tripRef.get();
      if (!tripSnap.exists) {
        throw new HttpsError('not-found', 'Trajet introuvable.');
      }
      const trip = tripSnap.data();
      const batch = db.batch();
      batch.update(tripRef, {
        assignedDriverId: payload.newDriverId,
        assignedVehicleId: payload.newVehicleId,
        status: 'driver_assigned',
        driverAlertFlagged: false,
        emergencyReassignedAt: admin.firestore.FieldValue.serverTimestamp(),
        emergencyReassignedBy: request.auth.uid,
      });
      if (trip?.userId) {
        batch.set(db.collection('notifications').doc(), {
          userId: trip.userId,
          type: 'personal_driver_emergency_reassignment',
          title: 'Chauffeur remplacé',
          message: 'Un chauffeur de remplacement a été affecté à votre trajet Personal Driver.',
          tripId: payload.tripId,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      batch.set(db.collection('notifications').doc(), {
        userId: payload.newDriverId,
        type: 'personal_driver_emergency_reassignment_driver',
        title: 'Mission de remplacement',
        message: 'Une mission Personal Driver de remplacement vous a été affectée.',
        tripId: payload.tripId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await batch.commit();
      return { success: true };
    }

    throw new HttpsError('invalid-argument', 'Action non reconnue.');
  },
);
