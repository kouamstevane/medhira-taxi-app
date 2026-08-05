import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';

const NONTERMINAL_TRIP_STATUSES = [
  'scheduled',
  'driver_assigned',
  'driver_en_route',
  'driver_arrived',
  'passenger_picked_up',
  'in_progress',
] as const;

type CancellationActor =
  | { kind: 'client'; uid: string }
  | { kind: 'admin'; uid: string; reason?: string };

interface CancelPersonalDriverTripInput {
  tripId: string;
  actor: CancellationActor;
}

function cancellationNotificationId(tripId: string, recipient: 'customer' | 'driver'): string {
  return `personal_driver_trip_cancelled_${tripId}_${recipient}`;
}

export async function cancelPersonalDriverTrip(
  db: FirebaseFirestore.Firestore,
  input: CancelPersonalDriverTripInput,
): Promise<void> {
  const tripRef = db.collection('personal_driver_trips').doc(input.tripId);

  await db.runTransaction(async (transaction) => {
    const tripSnapshot = await transaction.get(tripRef);
    if (!tripSnapshot.exists) {
      throw new HttpsError('not-found', 'Trajet introuvable.');
    }

    const trip = tripSnapshot.data();
    if (input.actor.kind === 'client' && trip?.userId !== input.actor.uid) {
      throw new HttpsError('permission-denied', 'Ce trajet ne vous appartient pas.');
    }
    if (trip?.status === 'cancelled') return;
    if (trip?.status === 'completed') {
      throw new HttpsError('failed-precondition', 'Ce trajet ne peut plus être annulé.');
    }

    const assignedDriverId = typeof trip?.assignedDriverId === 'string' && trip.assignedDriverId
      ? trip.assignedDriverId
      : null;
    let hasOtherNonterminalAssignment = false;
    let driverRef: FirebaseFirestore.DocumentReference | null = null;
    let driver: FirebaseFirestore.DocumentData | undefined;

    if (assignedDriverId) {
      driverRef = db.collection('drivers').doc(assignedDriverId);
      const assignedTripsQuery = db.collection('personal_driver_trips')
        .where('assignedDriverId', '==', assignedDriverId)
        .where('status', 'in', NONTERMINAL_TRIP_STATUSES);
      const [driverSnapshot, assignedTripsSnapshot] = await Promise.all([
        transaction.get(driverRef),
        transaction.get(assignedTripsQuery),
      ]);
      driver = driverSnapshot.exists ? driverSnapshot.data() : undefined;
      hasOtherNonterminalAssignment = assignedTripsSnapshot.docs.some(
        (assignedTrip) => assignedTrip.id !== tripRef.id,
      );
    }

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(tripRef, {
      status: 'cancelled',
      assignedDriverId: null,
      assignedVehicleId: null,
      cancelledBy: input.actor.kind,
      cancelledByUid: input.actor.uid,
      ...(input.actor.kind === 'client' ? { clientCancelledLostKm: true } : {}),
      ...(input.actor.kind === 'admin' ? { cancelReason: input.actor.reason ?? null } : {}),
      cancelledAt: timestamp,
      updatedAt: timestamp,
    });

    const availabilityBelongsToTrip = driver?.availabilityStatus === 'busy_personal_driver'
      && (
        !driver.activePersonalDriverTripId
        || driver.activePersonalDriverTripId === input.tripId
      );
    if (driverRef && driver && availabilityBelongsToTrip && !hasOtherNonterminalAssignment) {
      transaction.update(driverRef, {
        isAvailable: true,
        availabilityStatus: 'available',
        activePersonalDriverTripId: null,
        updatedAt: timestamp,
      });
    }

    if (typeof trip?.userId === 'string' && trip.userId) {
      const idempotencyKey = cancellationNotificationId(input.tripId, 'customer');
      transaction.set(db.collection('notifications').doc(idempotencyKey), {
        userId: trip.userId,
        type: 'personal_driver_trip_cancelled',
        title: 'Trajet Personal Driver annulé',
        message: 'Votre trajet Personal Driver a été annulé.',
        tripId: input.tripId,
        idempotencyKey,
        read: false,
        createdAt: timestamp,
      });
    }

    if (assignedDriverId) {
      const idempotencyKey = cancellationNotificationId(input.tripId, 'driver');
      transaction.set(db.collection('notifications').doc(idempotencyKey), {
        userId: assignedDriverId,
        type: 'personal_driver_trip_cancelled_driver',
        title: 'Mission Personal Driver annulée',
        message: 'La mission Personal Driver qui vous était affectée a été annulée.',
        tripId: input.tripId,
        idempotencyKey,
        read: false,
        createdAt: timestamp,
      });
    }
  });
}
