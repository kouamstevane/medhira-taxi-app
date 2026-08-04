import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

export const expirePersonalDriverSubscriptions = onSchedule(
  { schedule: 'every 15 minutes', region: 'europe-west1' },
  async () => {
    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore();
    const expiredCandidates = await db.collection('personal_driver_subscriptions')
      .where('periodEndAtUtc', '<=', admin.firestore.Timestamp.fromDate(new Date()))
      .limit(500)
      .get();
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
  },
);
