import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { createSubscriptionPeriodLockId } from './subscriptionPeriodLock.js';

const EXPIRY_PAGE_SIZE = 500;
export const PENDING_PAYMENT_ABANDONED_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 heures

export async function expireSingleSubscriptionAndCleanupTrips(
  db: FirebaseFirestore.Firestore,
  subscriptionDoc: FirebaseFirestore.DocumentSnapshot,
): Promise<void> {
  const subscriptionId = subscriptionDoc.id;

  const tripsSnap = await db.collection('personal_driver_trips')
    .where('subscriptionId', '==', subscriptionId)
    .where('status', 'in', ['scheduled', 'driver_assigned'])
    .get();

  const affectedDriverIds = new Set<string>();

  const batch = db.batch();
  batch.update(subscriptionDoc.ref, {
    status: 'expired',
    expiredAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  tripsSnap.docs.forEach((tripDoc) => {
    const trip = tripDoc.data();
    if (typeof trip.assignedDriverId === 'string' && trip.assignedDriverId) {
      affectedDriverIds.add(trip.assignedDriverId);
    }
    batch.update(tripDoc.ref, {
      status: 'cancelled',
      cancelReason: 'subscription_expired',
      cancelledBy: 'system',
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      assignedDriverId: null,
      assignedVehicleId: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();

  for (const driverId of affectedDriverIds) {
    const remainingTrips = await db.collection('personal_driver_trips')
      .where('assignedDriverId', '==', driverId)
      .where('status', 'in', [
        'scheduled',
        'driver_assigned',
        'driver_en_route',
        'driver_arrived',
        'passenger_picked_up',
        'in_progress',
      ])
      .get();

    if (remainingTrips.docs.length === 0) {
      await db.collection('drivers').doc(driverId).update({
        isAvailable: true,
        availabilityStatus: 'available',
        activePersonalDriverTripId: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
}

export async function expirePersonalDriverSubscriptionsUntilExhausted(
  db: FirebaseFirestore.Firestore,
  nowUtc: Date,
): Promise<void> {
  const baseQuery = db.collection('personal_driver_subscriptions')
    .where('status', '==', 'active')
    .where('periodEndAtUtc', '<=', admin.firestore.Timestamp.fromDate(nowUtc))
    .orderBy('periodEndAtUtc', 'asc')
    .limit(EXPIRY_PAGE_SIZE);
  let pageQuery: FirebaseFirestore.Query = baseQuery;

  while (true) {
    const expiredCandidates = await pageQuery.get();
    if (expiredCandidates.docs.length === 0) return;

    for (const subscriptionDoc of expiredCandidates.docs) {
      if (subscriptionDoc.data()?.status !== 'active') continue;
      await expireSingleSubscriptionAndCleanupTrips(db, subscriptionDoc);
    }

    if (expiredCandidates.docs.length < EXPIRY_PAGE_SIZE) return;
    pageQuery = baseQuery.startAfter(expiredCandidates.docs[expiredCandidates.docs.length - 1]);
  }
}

export async function cleanupAbandonedPendingPayments(
  db: FirebaseFirestore.Firestore,
  nowUtc: Date,
): Promise<number> {
  const cutoffTime = new Date(nowUtc.getTime() - PENDING_PAYMENT_ABANDONED_TIMEOUT_MS);

  const pendingSnap = await db
    .collection('personal_driver_subscriptions')
    .where('status', '==', 'pending_payment')
    .limit(EXPIRY_PAGE_SIZE)
    .get();

  if (pendingSnap.empty) return 0;

  let cleanedUpCount = 0;

  for (const docSnap of pendingSnap.docs) {
    const data = docSnap.data();
    if (data.status !== 'pending_payment') continue;

    const createdDate =
      data.createdAt?.toDate?.() ||
      data.paymentCreationClaimedAt?.toDate?.() ||
      data.updatedAt?.toDate?.();

    if (createdDate && createdDate > cutoffTime) {
      continue;
    }

    const subscriptionId = docSnap.id;
    const userId = data.userId;
    const periodStartDate = data.periodStartDate;

    await db.runTransaction(async (tx) => {
      const currentSnap = await tx.get(docSnap.ref);
      if (!currentSnap.exists || currentSnap.data()?.status !== 'pending_payment') return;

      tx.update(docSnap.ref, {
        status: 'payment_failed',
        paymentStatus: 'failed',
        paymentCreationError: 'abandoned_session_timeout',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (userId && periodStartDate) {
        const lockId = createSubscriptionPeriodLockId(userId, periodStartDate);
        const lockRef = db.collection('personal_driver_subscription_locks').doc(lockId);
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists && lockSnap.data()?.subscriptionId === subscriptionId) {
          tx.delete(lockRef);
        }
      }
    });

    cleanedUpCount += 1;
  }

  return cleanedUpCount;
}

export const expirePersonalDriverSubscriptions = onSchedule(
  { schedule: 'every 5 minutes', region: 'europe-west1' },
  async () => {
    if (!admin.apps.length) admin.initializeApp();
    const now = new Date();
    await expirePersonalDriverSubscriptionsUntilExhausted(admin.firestore(), now);
    await cleanupAbandonedPendingPayments(admin.firestore(), now);
  },
);
