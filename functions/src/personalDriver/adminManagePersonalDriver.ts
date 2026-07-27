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

const adminActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('validateSubscription'),
    subscriptionId: z.string().min(1),
  }),
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

    if (payload.action === 'validateSubscription') {
      const subRef = db.collection('personal_driver_subscriptions').doc(payload.subscriptionId);
      const subSnap = await subRef.get();
      if (!subSnap.exists) {
        throw new HttpsError('not-found', 'Abonnement introuvable.');
      }
      await subRef.update({
        status: 'active',
        validatedAt: admin.firestore.FieldValue.serverTimestamp(),
        validatedBy: request.auth.uid,
      });
      return { success: true };
    }

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
      const tripRef = db.collection('personal_driver_trips').doc(payload.tripId);
      const tripSnap = await tripRef.get();
      if (!tripSnap.exists) {
        throw new HttpsError('not-found', 'Trajet introuvable.');
      }
      await tripRef.update({
        assignedDriverId: payload.driverId,
        assignedVehicleId: payload.vehicleId,
        status: 'driver_assigned',
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
        assignedBy: request.auth.uid,
      });
      return { success: true };
    }

    if (payload.action === 'reassignDriverEmergency') {
      const tripRef = db.collection('personal_driver_trips').doc(payload.tripId);
      const tripSnap = await tripRef.get();
      if (!tripSnap.exists) {
        throw new HttpsError('not-found', 'Trajet introuvable.');
      }
      await tripRef.update({
        assignedDriverId: payload.newDriverId,
        assignedVehicleId: payload.newVehicleId,
        status: 'driver_assigned',
        driverAlertFlagged: false,
        emergencyReassignedAt: admin.firestore.FieldValue.serverTimestamp(),
        emergencyReassignedBy: request.auth.uid,
      });
      return { success: true };
    }

    throw new HttpsError('invalid-argument', 'Action non reconnue.');
  },
);
