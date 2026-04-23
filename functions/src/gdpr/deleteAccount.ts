/**
 * Cloud Functions GDPR — Droit à l'oubli (RGPD Article 17)
 * ========================================================
 *
 * Ce module implémente le flow complet de suppression/anonymisation
 * des données personnelles d'un utilisateur (client ou chauffeur) à
 * travers Firestore, Realtime Database, Firebase Storage et Firebase Auth.
 *
 * Règles :
 *  - SUPPRESSION : données PII dont aucune obligation légale ne nécessite
 *    la conservation (doc user/driver + sous-collections privées,
 *    messages privés, notifications, tokens FCM, codes email,
 *    présence RTDB, locations RTDB, photos de profil, documents KYC).
 *  - ANONYMISATION : bookings/food_orders/parcels/transactions complétés
 *    (obligation comptable/fiscale 10 ans — art. L123-22 Code de commerce FR
 *    et équivalents). Les IDs, montants et dates sont conservés, mais
 *    nom/email/téléphone/adresse sont remplacés par des valeurs anonymes.
 *  - Les bookings/commandes *en cours* sont annulés avant suppression,
 *    sinon on refuse la suppression (selon policy choisie).
 *  - Audit : chaque suppression est loggée dans `gdprDeletions` avec
 *    un hash SHA-256 de l'uid (non réversible) pour preuve de conformité.
 *
 * TODO: tests unitaires (émulateur Firestore/Auth + fake Storage bucket).
 *
 * @module gdpr/deleteAccount
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import Stripe from 'stripe';
import { enforceRateLimit } from '../utils/rateLimiter.js';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

let _stripe: InstanceType<typeof Stripe> | null = null;
function getStripeClient(): InstanceType<typeof Stripe> {
  if (!_stripe) {
    _stripe = new Stripe(stripeSecretKey.value(), { apiVersion: '2026-03-25.dahlia' });
  }
  return _stripe;
}

if (!admin.apps.length) {
  admin.initializeApp();
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const BATCH_CHUNK_SIZE = 500; // Limite Firestore par batch
const STORAGE_DELETE_CONCURRENCY = 100;

/** Statuts de booking/commande considérés comme "actifs" (non terminés). */
const ACTIVE_BOOKING_STATUSES = [
  'pending',
  'accepted',
  'in_progress',
  'confirmed',
  'preparing',
  'ready',
  'driver_heading_to_restaurant',
  'driver_arrived_restaurant',
  'picked_up',
  'out_for_delivery',
  'delivering',
  'arriving',
  'heading_to_restaurant',
  'arrived_restaurant',
  'waiting',
  'heading_to_client',
  'arrived_client',
];

/** Statuts considérés comme "terminés" (à anonymiser). */
const COMPLETED_BOOKING_STATUSES = [
  'completed',
  'delivered',
  'cancelled',
  'cancelled_by_restaurant',
  'failed',
];

/** Valeurs anonymes utilisées pour remplacer les PII. */
const ANON = {
  uid: 'ANONYMIZED_USER',
  name: 'Utilisateur supprimé',
  firstName: 'Utilisateur',
  lastName: 'Supprimé',
  email: 'anonymized@deleted.local',
  phone: '+00000000000',
  address: 'Adresse anonymisée',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function isAdminUser(uid: string): Promise<boolean> {
  try {
    const snap = await admin.firestore().collection('admins').doc(uid).get();
    return snap.exists;
  } catch {
    return false;
  }
}

/**
 * Itère sur une requête page par page (500 docs) et applique un visiteur
 * qui ajoute des opérations à un batch. Retourne le nombre total traité.
 */
async function processQueryInChunks(
  query: admin.firestore.Query,
  visit: (doc: admin.firestore.QueryDocumentSnapshot, batch: admin.firestore.WriteBatch) => void,
  db: admin.firestore.Firestore,
): Promise<number> {
  let total = 0;
  // Pagination via startAfter pour éviter de recharger toujours le même set
  let last: admin.firestore.QueryDocumentSnapshot | null = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = query.limit(BATCH_CHUNK_SIZE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((doc) => visit(doc, batch));
    await batch.commit();
    total += snap.docs.length;
    last = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < BATCH_CHUNK_SIZE) break;
  }
  return total;
}

/**
 * Supprime récursivement une sous-collection (par chunks).
 */
async function deleteSubcollection(
  parent: admin.firestore.DocumentReference,
  subcolName: string,
  db: admin.firestore.Firestore,
): Promise<number> {
  return processQueryInChunks(parent.collection(subcolName), (doc, batch) => {
    batch.delete(doc.ref);
  }, db);
}

/**
 * Supprime tous les fichiers Storage sous une série de préfixes.
 */
async function deleteStoragePrefixes(prefixes: string[]): Promise<number> {
  let deleted = 0;
  const bucket = admin.storage().bucket();
  // Vérifier l'accessibilité du bucket avant de continuer
  await bucket.getMetadata();

  for (const prefix of prefixes) {
    try {
      const [files] = await bucket.getFiles({ prefix });
      for (let i = 0; i < files.length; i += STORAGE_DELETE_CONCURRENCY) {
        const chunk = files.slice(i, i + STORAGE_DELETE_CONCURRENCY);
        await Promise.all(chunk.map((f) => f.delete().catch(() => undefined)));
        deleted += chunk.length;
      }
    } catch (err) {
      console.warn(`[gdpr] deleteStoragePrefixes ${prefix}:`, err);
    }
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// Anonymisation Stripe
// ---------------------------------------------------------------------------

/**
 * Anonymise les objets Stripe liés à un uid.
 * - Customer : scrub email/name/phone/address/shipping, marque metadata GDPR.
 *   Stripe conserve l'objet pour l'historique des charges (obligation comptable
 *   de Stripe + besoin de remboursements rétroactifs).
 * - Connect account (chauffeur) : pose uniquement metadata GDPR. Les données
 *   KYC sont retenues par Stripe au titre de ses obligations AML
 *   (base légale RGPD Art. 17(3)(b) — respect d'une obligation légale).
 */
async function anonymizeStripeObjects(
  stripeCustomerId: string | null,
  stripeAccountId: string | null,
  uidHash: string,
): Promise<{ customer: number; account: number }> {
  const result = { customer: 0, account: 0 };
  const anonymizedAt = new Date().toISOString();
  const gdprMetadata = {
    gdpr_anonymized: 'true',
    gdpr_anonymized_at: anonymizedAt,
    uid_hash: uidHash,
  };

  const stripe = getStripeClient();

  if (stripeCustomerId) {
    try {
      await stripe.customers.update(stripeCustomerId, {
        email: '',
        name: ANON.name,
        phone: '',
        description: 'Anonymisé (RGPD)',
        address: '',
        shipping: '',
        metadata: gdprMetadata,
      });
      result.customer = 1;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'resource_missing') {
        // Customer déjà supprimé côté Stripe — considérer comme succès (idempotence)
        result.customer = 1;
      } else {
        throw err;
      }
    }
  }

  if (stripeAccountId) {
    try {
      await stripe.accounts.update(stripeAccountId, { metadata: gdprMetadata });
      result.account = 1;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'resource_missing' || code === 'account_invalid') {
        result.account = 1;
      } else {
        throw err;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Détection de bookings actifs
// ---------------------------------------------------------------------------

async function hasActiveBookings(uid: string, db: admin.firestore.Firestore): Promise<boolean> {
  // Vérifier côté client et côté driver pour chaque collection pertinente
  const queries: admin.firestore.Query[] = [
    db.collection('bookings').where('userId', '==', uid).where('status', 'in', ACTIVE_BOOKING_STATUSES.slice(0, 10)),
    db.collection('bookings').where('driverId', '==', uid).where('status', 'in', ACTIVE_BOOKING_STATUSES.slice(0, 10)),
    db.collection('food_orders').where('userId', '==', uid).where('status', 'in', ACTIVE_BOOKING_STATUSES.slice(0, 10)),
    db.collection('food_orders').where('driverId', '==', uid).where('status', 'in', ACTIVE_BOOKING_STATUSES.slice(0, 10)),
    db.collection('parcels').where('senderId', '==', uid).where('status', 'in', ['pending', 'accepted', 'in_transit']),
    db.collection('parcels').where('driverId', '==', uid).where('status', 'in', ['pending', 'accepted', 'in_transit']),
    db.collection('active_bookings').where('userId', '==', uid),
    db.collection('active_bookings').where('driverId', '==', uid),
  ];

  for (const q of queries) {
    try {
      const s = await q.limit(1).get();
      if (!s.empty) return true;
    } catch (err) {
      // Certaines queries peuvent échouer si l'index n'existe pas — ignorer
      console.warn('[gdpr] hasActiveBookings query failed:', err);
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Anonymisation d'un booking/commande (préserve les IDs/montants/dates)
// ---------------------------------------------------------------------------

function buildAnonymizationUpdate(uid: string, data: admin.firestore.DocumentData): admin.firestore.UpdateData<admin.firestore.DocumentData> {
  const update: Record<string, unknown> = {};
  // Remplacer les FK PII seulement si c'est l'uid ciblé, sinon ne pas casser
  if (data.userId === uid) update.userId = ANON.uid;
  if (data.driverId === uid) update.driverId = ANON.uid;
  if (data.senderId === uid) update.senderId = ANON.uid;
  if (data.receiverId === uid) update.receiverId = ANON.uid;
  if (data.clientId === uid) update.clientId = ANON.uid;

  // Champs PII embarqués — toujours anonymisés sur le doc (ils appartenaient
  // à l'utilisateur supprimé quoi qu'il arrive)
  if (data.customerName !== undefined) update.customerName = ANON.name;
  if (data.customerEmail !== undefined) update.customerEmail = ANON.email;
  if (data.customerPhone !== undefined) update.customerPhone = ANON.phone;
  if (data.clientPhone !== undefined) update.clientPhone = ANON.phone;
  if (data.driverPhone !== undefined) update.driverPhone = ANON.phone;
  if (data.deliveryAddress !== undefined) update.deliveryAddress = ANON.address;

  // Addresses pickup/dropoff — garder coordonnées agrégées serait idéal mais
  // on anonymise le texte d'adresse qui contient potentiellement l'adresse du domicile.
  if (data.pickup && typeof data.pickup === 'object' && 'address' in data.pickup) {
    update['pickup.address'] = ANON.address;
  }
  if (data.dropoff && typeof data.dropoff === 'object' && 'address' in data.dropoff) {
    update['dropoff.address'] = ANON.address;
  }
  if (data.clientAddress && typeof data.clientAddress === 'object' && 'address' in data.clientAddress) {
    update['clientAddress.address'] = ANON.address;
    if ('instructions' in data.clientAddress) {
      update['clientAddress.instructions'] = admin.firestore.FieldValue.delete();
    }
  }

  update.gdprAnonymized = true;
  update.gdprAnonymizedAt = admin.firestore.FieldValue.serverTimestamp();
  return update as admin.firestore.UpdateData<admin.firestore.DocumentData>;
}

async function anonymizeCollectionForUser(
  collectionName: string,
  field: 'userId' | 'driverId' | 'senderId' | 'receiverId' | 'clientId',
  uid: string,
  db: admin.firestore.Firestore,
  onlyCompleted = true,
): Promise<number> {
  let total = 0;
  let last: admin.firestore.QueryDocumentSnapshot | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q: admin.firestore.Query = db.collection(collectionName).where(field, '==', uid);
    if (onlyCompleted) {
      // where in limité à 10 valeurs — notre liste en contient < 10 pour les statuts terminés
      q = q.where('status', 'in', COMPLETED_BOOKING_STATUSES);
    }
    q = q.limit(BATCH_CHUNK_SIZE);
    if (last) q = q.startAfter(last);

    let snap: admin.firestore.QuerySnapshot;
    try {
      snap = await q.get();
    } catch (err) {
      console.warn(`[gdpr] anonymize ${collectionName}.${field} failed:`, err);
      break;
    }
    if (snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) {
      const update = buildAnonymizationUpdate(uid, doc.data());
      batch.update(doc.ref, update);
    }
    await batch.commit();
    total += snap.docs.length;
    last = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < BATCH_CHUNK_SIZE) break;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Cœur du processus : processAccountDeletion
// ---------------------------------------------------------------------------

export interface AccountDeletionReport {
  uid: string;
  uidHash: string;
  startedAt: number;
  finishedAt: number;
  success: boolean;
  deletedCollections: Record<string, number>;
  anonymizedCollections: Record<string, number>;
  stripeAnonymized: { customer: number; account: number };
  storageFilesDeleted: number;
  authDeleted: boolean;
  rtdbPathsDeleted: string[];
  errors: string[];
}

/**
 * Processus principal de suppression/anonymisation d'un compte.
 * Idempotent : peut être relancé après échec partiel.
 *
 * TODO: tests unitaires
 */
export async function processAccountDeletion(uid: string): Promise<AccountDeletionReport> {
  const db = admin.firestore();
  const rtdb = admin.database();
  const startedAt = Date.now();
  const uidHash = sha256Hex(uid);

  const report: AccountDeletionReport = {
    uid,
    uidHash,
    startedAt,
    finishedAt: 0,
    success: false,
    deletedCollections: {},
    anonymizedCollections: {},
    stripeAnonymized: { customer: 0, account: 0 },
    storageFilesDeleted: 0,
    authDeleted: false,
    rtdbPathsDeleted: [],
    errors: [],
  };

  const bump = (bucket: 'deletedCollections' | 'anonymizedCollections', key: string, n: number) => {
    if (n <= 0) return;
    report[bucket][key] = (report[bucket][key] ?? 0) + n;
  };

  // Helper safe : log et continue
  const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push(`${label}: ${msg}`);
      console.error(`[gdpr] ${label}:`, err);
      return undefined;
    }
  };

  // Écrire un flag de processing (idempotence : on peut relancer)
  await safe('mark processing', async () => {
    await db.collection('gdprDeletions').doc(uidHash).set({
      uidHash,
      status: 'processing',
      startedAt: admin.firestore.Timestamp.fromMillis(startedAt),
    }, { merge: true });
  });

  // 0) CAPTURE des IDs Stripe AVANT suppression des docs users/drivers
  let stripeCustomerId: string | null = null;
  let stripeAccountId: string | null = null;
  await safe('read stripe ids', async () => {
    const [userSnap, driverSnap] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('drivers').doc(uid).get(),
    ]);
    const userData = userSnap.data() as { stripeCustomerId?: unknown } | undefined;
    const driverData = driverSnap.data() as { stripeAccountId?: unknown } | undefined;
    if (typeof userData?.stripeCustomerId === 'string' && userData.stripeCustomerId) {
      stripeCustomerId = userData.stripeCustomerId;
    }
    if (typeof driverData?.stripeAccountId === 'string' && driverData.stripeAccountId) {
      stripeAccountId = driverData.stripeAccountId;
    }
  });

  // 1) ANONYMISATION — bookings / food_orders / parcels terminés
  for (const [coll, field] of [
    ['bookings', 'userId'],
    ['bookings', 'driverId'],
    ['food_orders', 'userId'],
    ['food_orders', 'driverId'],
    ['food_delivery_orders', 'driverId'],
    ['food_delivery_orders', 'clientId'],
    ['parcels', 'senderId'],
    ['parcels', 'receiverId'],
    ['parcels', 'driverId'],
  ] as const) {
    const n = await safe(`anonymize ${coll}.${field}`, () =>
      anonymizeCollectionForUser(coll, field, uid, db, true),
    );
    bump('anonymizedCollections', coll, n ?? 0);
  }

  // transactions : anonymiser (obligation comptable)
  for (const field of ['userId', 'driverId'] as const) {
    const n = await safe(`anonymize transactions.${field}`, () =>
      anonymizeCollectionForUser('transactions', field, uid, db, false),
    );
    bump('anonymizedCollections', 'transactions', n ?? 0);
  }

  // 1.5) ANONYMISATION Stripe — scrub PII sur Customer, flag metadata sur Connect account
  if (stripeCustomerId || stripeAccountId) {
    const res = await safe('anonymize stripe objects', () =>
      anonymizeStripeObjects(stripeCustomerId, stripeAccountId, uidHash),
    );
    if (res) report.stripeAnonymized = res;
  }

  // 2) SUPPRESSION — documents principaux
  // Docs racine indexés par uid
  const rootDocs = ['users', 'drivers', 'wallets', 'admins', 'driver_requests'];
  for (const coll of rootDocs) {
    await safe(`delete ${coll}/${uid}`, async () => {
      const ref = db.collection(coll).doc(uid);
      const doc = await ref.get();
      if (doc.exists) {
        await ref.delete();
        bump('deletedCollections', coll, 1);
      }
    });
  }

  // 3) SUPPRESSION — sous-collections PII
  // drivers/{uid}/private/* (données sensibles, documents KYC)
  await safe('delete drivers/{uid}/private/*', async () => {
    const n = await deleteSubcollection(db.collection('drivers').doc(uid), 'private', db);
    bump('deletedCollections', 'drivers/private', n);
  });
  // driver_requests/{uid}/requests/*
  await safe('delete driver_requests/{uid}/requests/*', async () => {
    const n = await deleteSubcollection(db.collection('driver_requests').doc(uid), 'requests', db);
    bump('deletedCollections', 'driver_requests/requests', n);
  });

  // 4) SUPPRESSION — collections par champ uid
  // Véhicules (liés au chauffeur)
  await safe('delete vehicles.ownerId', async () => {
    const n = await processQueryInChunks(
      db.collection('vehicles').where('ownerId', '==', uid),
      (d, b) => b.delete(d.ref),
      db,
    );
    bump('deletedCollections', 'vehicles', n);
  });

  // Notifications destinées à l'utilisateur
  await safe('delete notifications.userId', async () => {
    const n = await processQueryInChunks(
      db.collection('notifications').where('userId', '==', uid),
      (d, b) => b.delete(d.ref),
      db,
    );
    bump('deletedCollections', 'notifications', n);
  });

  // Ratings donnés par l'utilisateur / reçus par le chauffeur — supprimés
  // (pas d'obligation légale de conserver les avis nominatifs)
  for (const field of ['clientId', 'driverId'] as const) {
    await safe(`delete driver_ratings.${field}`, async () => {
      const n = await processQueryInChunks(
        db.collection('driver_ratings').where(field, '==', uid),
        (d, b) => b.delete(d.ref),
        db,
      );
      bump('deletedCollections', 'driver_ratings', n);
    });
  }
  await safe('delete restaurant_reviews.userId', async () => {
    const n = await processQueryInChunks(
      db.collection('restaurant_reviews').where('userId', '==', uid),
      (d, b) => b.delete(d.ref),
      db,
    );
    bump('deletedCollections', 'restaurant_reviews', n);
  });
  for (const field of ['userId', 'driverId'] as const) {
    await safe(`delete delivery_reviews.${field}`, async () => {
      const n = await processQueryInChunks(
        db.collection('delivery_reviews').where(field, '==', uid),
        (d, b) => b.delete(d.ref),
        db,
      );
      bump('deletedCollections', 'delivery_reviews', n);
    });
  }

  // Appels VoIP
  for (const field of ['callerId', 'calleeId'] as const) {
    await safe(`delete calls.${field}`, async () => {
      const n = await processQueryInChunks(
        db.collection('calls').where(field, '==', uid),
        (d, b) => b.delete(d.ref),
        db,
      );
      bump('deletedCollections', 'calls', n);
    });
  }

  // Codes de vérification email
  await safe('delete emailVerificationCodes/{uid}', async () => {
    const ref = db.collection('emailVerificationCodes').doc(uid);
    const doc = await ref.get();
    if (doc.exists) {
      await ref.delete();
      bump('deletedCollections', 'emailVerificationCodes', 1);
    }
  });

  // Messages privés dans bookings/{bookingId}/messages où senderId == uid
  // (collectionGroup query)
  await safe('delete messages.senderId (collectionGroup)', async () => {
    const n = await processQueryInChunks(
      db.collectionGroup('messages').where('senderId', '==', uid),
      (d, b) => b.delete(d.ref),
      db,
    );
    bump('deletedCollections', 'messages', n);
  });

  // Candidates (collectionGroup) où candidateId == uid
  await safe('delete candidates.candidateId (collectionGroup)', async () => {
    const n = await processQueryInChunks(
      db.collectionGroup('candidates').where('candidateId', '==', uid),
      (d, b) => b.delete(d.ref),
      db,
    );
    bump('deletedCollections', 'candidates', n);
  });

  // RGPD SEC-G04 : audit_logs contient l'uid en clair (champ userId).
  // On supprime les entrées antérieures pour ne conserver que l'audit
  // GDPR par hash (écrit plus bas). Les logs applicatifs nominatifs ne
  // sont pas couverts par l'obligation comptable.
  await safe('delete audit_logs.userId', async () => {
    const n = await processQueryInChunks(
      db.collection('audit_logs').where('userId', '==', uid),
      (d, b) => b.delete(d.ref),
      db,
    );
    bump('deletedCollections', 'audit_logs', n);
  });
  await safe('delete audit_logs.details.targetDriverId', async () => {
    const n = await processQueryInChunks(
      db.collection('audit_logs').where('details.targetDriverId', '==', uid),
      (d, b) => b.delete(d.ref),
      db,
    );
    bump('deletedCollections', 'audit_logs', n);
  });

  // Collection dédiée de tokens FCM (si utilisée ailleurs que sur users/drivers)
  await safe('delete fcmTokens.userId', async () => {
    const n = await processQueryInChunks(
      db.collection('fcmTokens').where('userId', '==', uid),
      (d, b) => b.delete(d.ref),
      db,
    );
    bump('deletedCollections', 'fcmTokens', n);
  });

  // 5) RTDB — présence, localisation live, VoIP signaling
  for (const path of [
    `driver_locations/${uid}`,
    `driver_status/${uid}`,
    `user_presence/${uid}`,
    `presence/${uid}`,
    `typing_status/${uid}`,
  ]) {
    await safe(`rtdb remove ${path}`, async () => {
      await rtdb.ref(path).remove();
      report.rtdbPathsDeleted.push(path);
    });
  }

  // 6) STORAGE — profil, documents KYC, reçus
  await safe('delete storage prefixes', async () => {
    const n = await deleteStoragePrefixes([
      `users/${uid}/`,
      `drivers/${uid}/`,
      `driver_documents/${uid}/`,
      `profile_images/${uid}`,
      `receipts/${uid}/`,
    ]);
    report.storageFilesDeleted += n;
  });

  // 7) FIREBASE AUTH — supprimer le compte lui-même
  await safe('auth deleteUser', async () => {
    try {
      await admin.auth().deleteUser(uid);
      report.authDeleted = true;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/user-not-found') {
        report.authDeleted = true; // déjà supprimé (idempotence)
      } else {
        throw err;
      }
    }
  });

  report.success = report.errors.length === 0;
  report.finishedAt = Date.now();

  // 8) AUDIT — gdprDeletions (hash uid, pas l'uid en clair)
  await safe('write audit', async () => {
    await db.collection('gdprDeletions').doc(uidHash).set({
      uidHash,
      status: report.success ? 'completed' : 'completed_with_errors',
      startedAt: admin.firestore.Timestamp.fromMillis(report.startedAt),
      finishedAt: admin.firestore.Timestamp.fromMillis(report.finishedAt),
      deletedCollections: report.deletedCollections,
      anonymizedCollections: report.anonymizedCollections,
      stripeAnonymized: report.stripeAnonymized,
      storageFilesDeleted: report.storageFilesDeleted,
      authDeleted: report.authDeleted,
      rtdbPathsDeleted: report.rtdbPathsDeleted,
      errors: report.errors,
    }, { merge: true });
  });

  // Audit trail complémentaire (conforme à la politique existante)
  await safe('write audit_logs', async () => {
    await db.collection('audit_logs').add({
      action: 'GDPR_ACCOUNT_DELETION',
      uidHash,
      success: report.success,
      errors: report.errors,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return report;
}

// ---------------------------------------------------------------------------
// Callable : requestAccountDeletion
// ---------------------------------------------------------------------------

/**
 * Cloud Function callable : un utilisateur authentifié demande la suppression
 * de son compte. Un admin peut également supprimer le compte d'un autre
 * utilisateur en passant `targetUid`.
 *
 * Body :
 *  - targetUid? : string — uid à supprimer (admin only). Par défaut = auth.uid.
 *  - confirm : string — doit valoir 'DELETE_MY_ACCOUNT' pour éviter les
 *    appels accidentels.
 *
 * Retour :
 *  - AccountDeletionReport (voir type)
 *
 * TODO: tests unitaires
 */
export const requestAccountDeletion = onCall(
  { region: 'europe-west1', timeoutSeconds: 540, memory: '512MiB', secrets: [stripeSecretKey] },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise.');
    }
    const callerUid = request.auth.uid;

    // Rate limit: account deletion is irreversible and expensive (long
    // timeoutSeconds, traverses many collections). 3/hour per caller is
    // enough for a retry after a transient failure but blocks abuse.
    await enforceRateLimit({
      identifier: callerUid,
      bucket: 'gdpr:requestAccountDeletion',
      limit: 3,
      windowSec: 60 * 60,
    });

    const data = (request.data ?? {}) as { targetUid?: unknown; confirm?: unknown };
    const confirm = typeof data.confirm === 'string' ? data.confirm : '';
    if (confirm !== 'DELETE_MY_ACCOUNT') {
      throw new HttpsError(
        'failed-precondition',
        'Confirmation manquante. Envoyez { confirm: "DELETE_MY_ACCOUNT" }.',
      );
    }

    const rawTarget = typeof data.targetUid === 'string' ? data.targetUid.trim() : '';
    const targetUid = rawTarget || callerUid;

    if (targetUid !== callerUid) {
      const isAdmin = await isAdminUser(callerUid);
      if (!isAdmin) {
        throw new HttpsError(
          'permission-denied',
          'Seul un administrateur peut supprimer un autre compte.',
        );
      }
    }

    const db = admin.firestore();

    // Poser le flag de demande sur le doc user/driver (non bloquant si absent)
    const stamp = admin.firestore.FieldValue.serverTimestamp();
    for (const coll of ['users', 'drivers'] as const) {
      try {
        const ref = db.collection(coll).doc(targetUid);
        const doc = await ref.get();
        if (doc.exists) {
          await ref.update({
            deletionRequestedAt: stamp,
            deletionRequestedBy: callerUid,
          });
        }
      } catch (err) {
        console.warn(`[gdpr] mark deletionRequestedAt on ${coll}:`, err);
      }
    }

    // Refuser si des bookings actifs existent (policy conservative)
    const active = await hasActiveBookings(targetUid, db);
    if (active) {
      throw new HttpsError(
        'failed-precondition',
        'Des courses/commandes en cours existent. Annulez-les ou terminez-les avant suppression.',
      );
    }

    const report = await processAccountDeletion(targetUid);
    return report;
  },
);

// ---------------------------------------------------------------------------
// Exposer aussi processAccountDeletion en tant que callable admin
// (ex: reprise manuelle d'un échec partiel, idempotent)
// ---------------------------------------------------------------------------

/**
 * Callable admin pour forcer/relancer la suppression d'un uid donné
 * (idempotent). Réservé aux admins.
 *
 * TODO: tests unitaires
 */
export const adminForceAccountDeletion = onCall(
  { region: 'europe-west1', timeoutSeconds: 540, memory: '512MiB', secrets: [stripeSecretKey] },
  async (request: CallableRequest) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise.');
    }
    const isAdmin = await isAdminUser(request.auth.uid);
    if (!isAdmin) {
      throw new HttpsError('permission-denied', 'Admin requis.');
    }

    // Rate limit: even admin retries shouldn't spam this heavy function.
    // 10/hour per admin allows batch cleanup while limiting accidental loops.
    await enforceRateLimit({
      identifier: request.auth.uid,
      bucket: 'gdpr:adminForceAccountDeletion',
      limit: 10,
      windowSec: 60 * 60,
    });

    const data = (request.data ?? {}) as { uid?: unknown };
    const uid = typeof data.uid === 'string' ? data.uid.trim() : '';
    if (!uid) {
      throw new HttpsError('invalid-argument', 'uid manquant.');
    }
    const report = await processAccountDeletion(uid);
    return report;
  },
);
