import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
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

    const { tripId, status: newStatus, lat, lng } = parsed.data;
    const db = getDb();
    const tripRef = db.collection('personal_driver_trips').doc(tripId);

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(tripRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Trajet introuvable.');
      }

      const tripData = snap.data();
      if (tripData?.assignedDriverId !== request.auth!.uid) {
        throw new HttpsError('permission-denied', 'Ce trajet ne vous est pas attribué.');
      }

      const currentStatus: PersonalDriverTripStatus = tripData?.status || 'scheduled';
      const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(newStatus as PersonalDriverTripStatus)) {
        throw new HttpsError(
          'failed-precondition',
          `Transition de statut non autorisée depuis ${currentStatus} vers ${newStatus}.`,
        );
      }

      const statusHistory = tripData?.statusHistory || [];
      statusHistory.push({
        status: newStatus,
        changedAt: new Date().toISOString(),
        changedBy: request.auth!.uid,
        location: lat !== undefined && lng !== undefined ? { lat, lng } : null,
      });

      transaction.update(tripRef, {
        status: newStatus,
        statusHistory,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, status: newStatus };
  },
);
