import * as admin from 'firebase-admin';

export type DriverApplicationReviewStatus = 'approved' | 'rejected';

export function normalizeDriverApplicationEmail(value?: string): string {
  return value?.trim().toLowerCase() ?? '';
}

export function buildDriverApplicationReviewUpdate(input: {
  status: DriverApplicationReviewStatus;
  driverId: string;
  adminUid: string;
  reason?: string;
}): Record<string, unknown> {
  return {
    status: input.status,
    driverId: input.driverId,
    reviewedBy: input.adminUid,
    rejectionReason: input.status === 'rejected' ? input.reason?.trim() || null : null,
  };
}

export async function syncDriverApplicationStatus(input: {
  driverEmail?: string;
  driverId: string;
  adminUid: string;
  status: DriverApplicationReviewStatus;
  reason?: string;
}): Promise<number> {
  const email = normalizeDriverApplicationEmail(input.driverEmail);
  if (!email) return 0;

  const firestore = admin.firestore();
  const snapshot = await firestore.collection('driverApplications').where('email', '==', email).get();
  const batch = firestore.batch();
  const reviewUpdate = buildDriverApplicationReviewUpdate(input);
  const timestamps = {
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  let updatedCount = 0;

  snapshot.docs.forEach((application) => {
    if (application.data().status !== 'pending_review') return;
    batch.update(application.ref, { ...reviewUpdate, ...timestamps });
    updatedCount += 1;
  });

  if (updatedCount > 0) {
    await batch.commit();
  }

  return updatedCount;
}
