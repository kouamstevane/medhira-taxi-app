/**
 * Service de Suppression Complète des Chauffeurs (port côté Cloud Functions).
 *
 * Réplique la logique de `src/utils/driver-deletion.service.ts`, sans la dépendance
 * `auditLoggingService` (le logging est consigné dans la collection `audit_logs`
 * directement via Firestore Admin).
 *
 * Conformité RGPD : Droit à l'oubli + obligation comptable (~10 ans).
 */

import * as admin from 'firebase-admin';
import { Bucket, File } from '@google-cloud/storage';

const COMPLETED_STATUSES = [
  'completed',
  'delivered',
  'cancelled',
  'cancelled_by_restaurant',
  'failed',
];

const ANON_SENTINEL = {
  uid: 'ANONYMIZED_USER',
  name: 'Utilisateur supprimé',
  phone: '+00000000000',
  address: 'Adresse anonymisée',
  email: 'anonymized@deleted.local',
};

export interface DriverDeletionResult {
  success: boolean;
  deletedCollections: string[];
  deletedFiles: number;
  errors: string[];
  duration: number;
}

interface DeletionStats {
  collectionsDeleted: Map<string, number>;
  filesDeleted: number;
  errors: string[];
  startTime: number;
}

const MAX_BATCH_SIZE = 500;

function db() {
  return admin.firestore();
}

function incrementCollectionStat(name: string, stats: DeletionStats, count = 1) {
  stats.collectionsDeleted.set(name, (stats.collectionsDeleted.get(name) || 0) + count);
}

async function deleteDocument(collection: string, id: string, stats: DeletionStats) {
  try {
    const ref = db().collection(collection).doc(id);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      incrementCollectionStat(collection, stats);
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Erreur inconnue';
    stats.errors.push(`${collection}/${id}: ${m}`);
  }
}

async function deleteCollectionByField(
  collection: string,
  field: string,
  value: string,
  stats: DeletionStats,
) {
  try {
    let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
    while (true) {
      let query: admin.firestore.Query = db()
        .collection(collection)
        .where(field, '==', value)
        .limit(MAX_BATCH_SIZE);
      if (lastDoc) query = query.startAfter(lastDoc);
      const snap = await query.get();
      if (snap.empty) break;

      const batch = db().batch();
      snap.docs.forEach((d) => {
        batch.delete(d.ref);
        lastDoc = d;
      });
      await batch.commit();
      incrementCollectionStat(collection, stats, snap.docs.length);
      if (snap.docs.length < MAX_BATCH_SIZE) break;
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Erreur inconnue';
    stats.errors.push(`${collection} (${field}=${value}): ${m}`);
  }
}

async function anonymizeCompletedByField(
  collection: string,
  field: string,
  value: string,
  stats: DeletionStats,
  onlyCompleted: boolean,
) {
  try {
    let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
    while (true) {
      let query: admin.firestore.Query = db()
        .collection(collection)
        .where(field, '==', value);
      if (onlyCompleted) {
        query = query.where('status', 'in', COMPLETED_STATUSES);
      }
      query = query.limit(MAX_BATCH_SIZE);
      if (lastDoc) query = query.startAfter(lastDoc);

      const snap = await query.get();
      if (snap.empty) break;

      const batch = db().batch();
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const update: Record<string, unknown> = {
          gdprAnonymized: true,
          gdprAnonymizedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (data.driverId === value) update.driverId = ANON_SENTINEL.uid;
        if (data.userId === value) update.userId = ANON_SENTINEL.uid;
        if (data.clientId === value) update.clientId = ANON_SENTINEL.uid;
        if (data.senderId === value) update.senderId = ANON_SENTINEL.uid;
        if (data.receiverId === value) update.receiverId = ANON_SENTINEL.uid;
        if (data.customerName !== undefined) update.customerName = ANON_SENTINEL.name;
        if (data.customerEmail !== undefined) update.customerEmail = ANON_SENTINEL.email;
        if (data.customerPhone !== undefined) update.customerPhone = ANON_SENTINEL.phone;
        if (data.clientName !== undefined) update.clientName = ANON_SENTINEL.name;
        if (data.clientPhone !== undefined) update.clientPhone = ANON_SENTINEL.phone;
        if (data.driverName !== undefined) update.driverName = ANON_SENTINEL.name;
        if (data.driverPhone !== undefined) update.driverPhone = ANON_SENTINEL.phone;
        if (data.pickupAddress !== undefined) update.pickupAddress = ANON_SENTINEL.address;
        if (data.dropoffAddress !== undefined) update.dropoffAddress = ANON_SENTINEL.address;
        if (data.deliveryAddress !== undefined) update.deliveryAddress = ANON_SENTINEL.address;
        if (data.pickup && typeof data.pickup === 'object' && 'address' in data.pickup) {
          update['pickup.address'] = ANON_SENTINEL.address;
        }
        if (data.dropoff && typeof data.dropoff === 'object' && 'address' in data.dropoff) {
          update['dropoff.address'] = ANON_SENTINEL.address;
        }
        batch.update(docSnap.ref, update);
        lastDoc = docSnap;
      }
      await batch.commit();
      incrementCollectionStat(`${collection}:anonymized`, stats, snap.docs.length);
      if (snap.docs.length < MAX_BATCH_SIZE) break;
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Erreur inconnue';
    stats.errors.push(`anonymize ${collection} (${field}=${value}): ${m}`);
  }
}

async function deleteVehicles(driverId: string, stats: DeletionStats) {
  try {
    const snap = await db()
      .collection('vehicles')
      .where('ownerId', '==', driverId)
      .limit(MAX_BATCH_SIZE)
      .get();
    if (!snap.empty) {
      const batch = db().batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      incrementCollectionStat('vehicles', stats, snap.docs.length);
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Erreur inconnue';
    stats.errors.push(`vehicles (ownerId=${driverId}): ${m}`);
  }
}

async function deleteCalls(driverId: string, stats: DeletionStats) {
  await deleteCollectionByField('calls', 'callerId', driverId, stats);
  await deleteCollectionByField('calls', 'calleeId', driverId, stats);
}

async function deleteDriverStorageFiles(driverId: string, stats: DeletionStats) {
  const paths = [
    `drivers/${driverId}/profile/`,
    `drivers/${driverId}/documents/`,
    `profile_images/${driverId}`,
  ];
  let bucket: Bucket;
  try {
    bucket = admin.storage().bucket();
    await bucket.getMetadata();
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Erreur inconnue';
    stats.errors.push(`Storage (initialisation): ${m}`);
    throw err;
  }
  for (const p of paths) {
    try {
      const [files] = await bucket.getFiles({ prefix: p });
      if (files.length > 0) {
        for (let i = 0; i < files.length; i += 100) {
          const slice = files.slice(i, i + 100);
          await Promise.all(slice.map((f: File) => f.delete()));
          stats.filesDeleted += slice.length;
        }
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Erreur inconnue';
      stats.errors.push(`Storage (${p}): ${m}`);
      if (m.includes('permission') || m.includes('authorized')) throw err;
    }
  }
}

async function logDeletionAudit(
  driverId: string,
  adminId: string,
  stats: DeletionStats,
  success: boolean,
  errorMessage?: string,
) {
  try {
    await db()
      .collection('audit_logs')
      .add({
        eventType: 'DRIVER_DELETED',
        userId: adminId,
        targetDriverId: driverId,
        success,
        errorMessage: errorMessage ?? null,
        level: success ? 'INFO' : 'ERROR',
        action: 'Suppression définitive complète du chauffeur',
        details: {
          duration: Date.now() - stats.startTime,
          collectionsDeleted: Object.fromEntries(stats.collectionsDeleted),
          filesDeleted: stats.filesDeleted,
          errors: stats.errors,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.error('Audit log failure:', err);
  }
}

export async function deleteDriverCompletely(
  driverId: string,
  adminId: string,
): Promise<DriverDeletionResult> {
  const stats: DeletionStats = {
    collectionsDeleted: new Map(),
    filesDeleted: 0,
    errors: [],
    startTime: Date.now(),
  };

  try {
    await deleteDocument('drivers', driverId, stats);
    await deleteDocument('users', driverId, stats);
    await deleteDocument('wallets', driverId, stats);
    await deleteVehicles(driverId, stats);
    await anonymizeCompletedByField('transactions', 'driverId', driverId, stats, false);
    await anonymizeCompletedByField('bookings', 'driverId', driverId, stats, true);
    await anonymizeCompletedByField('parcels', 'driverId', driverId, stats, true);
    await deleteCollectionByField('active_bookings', 'driverId', driverId, stats);
    await deleteCalls(driverId, stats);
    await deleteDocument('admins', driverId, stats);
    await deleteDriverStorageFiles(driverId, stats);

    try {
      await admin.auth().deleteUser(driverId);
    } catch (authErr: unknown) {
      const code = (authErr as { code?: string })?.code;
      if (code !== 'auth/user-not-found') throw authErr;
    }

    await logDeletionAudit(driverId, adminId, stats, true);

    return {
      success: stats.errors.length === 0,
      deletedCollections: Array.from(stats.collectionsDeleted.keys()),
      deletedFiles: stats.filesDeleted,
      errors: stats.errors,
      duration: Date.now() - stats.startTime,
    };
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Erreur inconnue';
    stats.errors.push(`Erreur critique: ${m}`);
    await logDeletionAudit(driverId, adminId, stats, false, m);
    throw err;
  }
}
