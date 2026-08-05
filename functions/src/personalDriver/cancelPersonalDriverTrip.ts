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

    const subscriptionId = typeof trip?.subscriptionId === 'string' && trip.subscriptionId
      ? trip.subscriptionId
      : null;
    const isSpecialTrip = trip?.isSpecialTrip === true;
    const isClientCancel = input.actor.kind === 'client';
    const isScheduledStatus = trip?.status === 'scheduled';

    const shouldRefundSpecialTrip = isSpecialTrip && (
      !isClientCancel || isScheduledStatus
    );

    let subscriptionRef: FirebaseFirestore.DocumentReference | null = null;
    let subscriptionSnap: FirebaseFirestore.DocumentSnapshot | null = null;

    if (subscriptionId && shouldRefundSpecialTrip) {
      subscriptionRef = db.collection('personal_driver_subscriptions').doc(subscriptionId);
    }

    if (assignedDriverId) {
      driverRef = db.collection('drivers').doc(assignedDriverId);
      const assignedTripsQuery = db.collection('personal_driver_trips')
        .where('assignedDriverId', '==', assignedDriverId)
        .where('status', 'in', NONTERMINAL_TRIP_STATUSES);
      const [driverSnapshot, assignedTripsSnapshot, subSnap] = await Promise.all([
        transaction.get(driverRef),
        transaction.get(assignedTripsQuery),
        subscriptionRef ? transaction.get(subscriptionRef) : Promise.resolve(null),
      ]);
      driver = driverSnapshot.exists ? driverSnapshot.data() : undefined;
      hasOtherNonterminalAssignment = assignedTripsSnapshot.docs.some(
        (assignedTrip) => assignedTrip.id !== tripRef.id,
      );
      subscriptionSnap = subSnap;
    } else if (subscriptionRef) {
      subscriptionSnap = await transaction.get(subscriptionRef);
    }

    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    if (subscriptionRef && subscriptionSnap && subscriptionSnap.exists) {
      const subscription = subscriptionSnap.data();
      const tripDistance = typeof trip?.distanceKm === 'number' && trip.distanceKm > 0
        ? trip.distanceKm
        : 0;
      const currentUsed = typeof subscription?.specialTripsUsed === 'number'
        ? subscription.specialTripsUsed
        : 0;
      const currentDistUsed = typeof subscription?.specialTripsDistanceUsedKm === 'number'
        ? subscription.specialTripsDistanceUsedKm
        : 0;
      const currentRemaining = typeof subscription?.monthlyDistanceKmRemaining === 'number'
        ? subscription.monthlyDistanceKmRemaining
        : 0;
      const maxDistance = typeof subscription?.monthlyDistanceKm === 'number'
        ? subscription.monthlyDistanceKm
        : currentRemaining + tripDistance;

      const nextSpecialTripsUsed = Math.max(0, currentUsed - 1);
      const nextSpecialTripsDist = Math.max(0, currentDistUsed - tripDistance);
      const nextRemaining = Math.min(
        maxDistance,
        Math.round((currentRemaining + tripDistance) * 10) / 10,
      );

      transaction.update(subscriptionRef, {
        specialTripsUsed: nextSpecialTripsUsed,
        specialTripsDistanceUsedKm: nextSpecialTripsDist,
        monthlyDistanceKmRemaining: nextRemaining,
        updatedAt: timestamp,
      });
    }

    transaction.update(tripRef, {
      status: 'cancelled',
      assignedDriverId: null,
      assignedVehicleId: null,
      cancelledBy: input.actor.kind,
      cancelledByUid: input.actor.uid,
      ...(isClientCancel && !shouldRefundSpecialTrip ? { clientCancelledLostKm: true } : {}),
      ...(shouldRefundSpecialTrip ? { specialTripRefunded: true } : {}),
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
