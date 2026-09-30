import { onDocumentWritten, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

export const onDriverRegistration = onDocumentWritten("drivers/{driverId}", async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();

  if (!afterData) return;

  const wasPending = beforeData?.status === 'pending';
  const isPending = afterData.status === 'pending';

  if (isPending && !wasPending) {
    const email = afterData.email;

    if (!email) {
      console.warn("Aucun email trouvé pour le chauffeur:", event.params.driverId);
      return;
    }

    console.log(`[DriverRegistration] Chauffeur ${event.params.driverId} passé à l'état 'pending'. Email: ${email}`);
  }
});

export const onDriverDocumentsUpdated = onDocumentUpdated(
  { document: 'drivers/{uid}/private/{docId}', region: 'europe-west1' },
  async (event) => {
    if (!event.data) return;
    if (event.params.docId !== 'personal') return;

    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after) return;

    const beforeDocs = before.documents as Record<string, { status: string; approvedBy?: string; url?: string | null; [key: string]: unknown }> | undefined;
    const afterDocs = after.documents as Record<string, { status: string; approvedBy?: string; url?: string | null; [key: string]: unknown }> | undefined;

    if (!beforeDocs || !afterDocs) return;

    const invalidTransitions: Array<{
      docKey: string;
      from: string;
      to: string;
      rollbackValue: { status: string; approvedBy?: string; url?: string | null; [key: string]: unknown };
      reason?: string;
    }> = [];

    const adminExistsCache = new Map<string, boolean>();
    const isRealAdmin = async (uid: string): Promise<boolean> => {
      if (adminExistsCache.has(uid)) return adminExistsCache.get(uid)!;
      const snap = await admin.firestore().collection('admins').doc(uid).get();
      const exists = snap.exists;
      adminExistsCache.set(uid, exists);
      return exists;
    };

    for (const [docKey, beforeEntry] of Object.entries(beforeDocs)) {
      const afterEntry = afterDocs[docKey];
      if (!afterEntry) continue;

      const fromStatus = beforeEntry.status;
      const toStatus = afterEntry.status;

      if (afterEntry.approvedBy && afterEntry.approvedBy !== beforeEntry.approvedBy) {
        const approvedBy = String(afterEntry.approvedBy);
        const ok = await isRealAdmin(approvedBy);
        if (!ok) {
          invalidTransitions.push({
            docKey,
            from: fromStatus,
            to: toStatus,
            rollbackValue: beforeEntry,
            reason: `approvedBy '${approvedBy}' is not a registered admin`,
          });
          continue;
        }
      }

      if (fromStatus === 'rejected' && toStatus === 'approved') {
        invalidTransitions.push({ docKey, from: fromStatus, to: toStatus, rollbackValue: beforeEntry });
      } else if (fromStatus === 'pending' && toStatus === 'approved') {
        if (!afterEntry.approvedBy) {
          invalidTransitions.push({ docKey, from: fromStatus, to: toStatus, rollbackValue: beforeEntry });
        }
      } else if (fromStatus === 'approved' && toStatus === 'pending') {
        invalidTransitions.push({ docKey, from: fromStatus, to: toStatus, rollbackValue: beforeEntry });
      }
    }

    if (invalidTransitions.length > 0) {
      const rollbackUpdates: Record<string, unknown> = {};
      for (const { docKey, rollbackValue } of invalidTransitions) {
        rollbackUpdates[`documents.${docKey}`] = rollbackValue;
      }

      await admin
        .firestore()
        .collection('drivers')
        .doc(event.params.uid)
        .collection('private')
        .doc('personal')
        .update(rollbackUpdates);

      await admin.firestore().collection('audit_logs').add({
        type: 'driver_documents_invalid_transition',
        uid: event.params.uid,
        invalidTransitions,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.warn('[onDriverDocumentsUpdated] Rollback triggered:', invalidTransitions);
    }
  }
);
