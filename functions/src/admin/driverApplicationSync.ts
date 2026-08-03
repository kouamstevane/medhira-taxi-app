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
  const snapshot = await firestore.collection('driverApplications').where('status', '==', 'pending_review').get();
  const reviewUpdate = buildDriverApplicationReviewUpdate(input);
  const matchingApplications = snapshot.docs.filter((application) => (
    normalizeDriverApplicationEmail(application.data().email) === email
  ));

  for (let offset = 0; offset < matchingApplications.length; offset += 450) {
    const batch = firestore.batch();
    const timestamps = {
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    matchingApplications.slice(offset, offset + 450).forEach((application) => {
      batch.update(application.ref, { ...reviewUpdate, ...timestamps });
    });

    await batch.commit();
  }

  return matchingApplications.length;
}
