import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

const EXPIRY_PAGE_SIZE = 500;

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

    const batch = db.batch();
    let updateCount = 0;
    expiredCandidates.docs.forEach((subscriptionDoc) => {
      if (subscriptionDoc.data().status !== 'active') return;
      batch.update(subscriptionDoc.ref, {
        status: 'expired',
        expiredAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      updateCount += 1;
    });
    if (updateCount > 0) await batch.commit();
    if (expiredCandidates.docs.length < EXPIRY_PAGE_SIZE) return;
    pageQuery = baseQuery.startAfter(expiredCandidates.docs[expiredCandidates.docs.length - 1]);
  }
}

export const expirePersonalDriverSubscriptions = onSchedule(
  { schedule: 'every 15 minutes', region: 'europe-west1' },
  async () => {
    if (!admin.apps.length) admin.initializeApp();
    await expirePersonalDriverSubscriptionsUntilExhausted(admin.firestore(), new Date());
  },
);
