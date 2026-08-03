import * as admin from 'firebase-admin';

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

export function isSubscriptionEntitled(
  data: FirebaseFirestore.DocumentData | undefined,
  nowUtc: Date,
): boolean {
  if (!data || !Number.isFinite(nowUtc.getTime())) return false;
  if (data.status !== 'active' || data.paymentStatus !== 'succeeded') return false;
  const periodStartAtUtc = toDate(data.periodStartAtUtc);
  const periodEndAtUtc = toDate(data.periodEndAtUtc);
  if (!periodStartAtUtc || !periodEndAtUtc || periodEndAtUtc <= periodStartAtUtc) return false;
  return nowUtc >= periodStartAtUtc && nowUtc < periodEndAtUtc;
}

export async function expireSubscriptionIfNeeded(
  db: FirebaseFirestore.Firestore,
  subscriptionRef: FirebaseFirestore.DocumentReference,
  nowUtc: Date,
): Promise<boolean> {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(subscriptionRef);
    if (!snapshot.exists) return false;
    const data = snapshot.data();
    const periodEndAtUtc = toDate(data?.periodEndAtUtc);
    if (data?.status === 'active' && periodEndAtUtc && nowUtc >= periodEndAtUtc) {
      transaction.update(subscriptionRef, {
        status: 'expired',
        expiredAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return false;
    }
    return isSubscriptionEntitled(data, nowUtc);
  });
}
