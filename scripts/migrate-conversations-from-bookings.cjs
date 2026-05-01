#!/usr/bin/env node
/**
 * Migration : bookings/{bookingId}/messages → conversations/{convId}/messages
 *
 * - conversationId = `taxi_${bookingId}_${[clientUid, driverUid].sort().join('__')}`
 * - Crée le doc `conversations/{convId}` s'il n'existe pas
 * - Copie les messages SANS supprimer les anciens (rollback safe)
 * - Idempotent : skip les messages déjà présents (par id)
 *
 * Usage :
 *   node scripts/migrate-conversations-from-bookings.js --project medjira-service
 *   node scripts/migrate-conversations-from-bookings.js --project medjira-service --dry-run
 */

const admin = require('firebase-admin');

const args = process.argv.slice(2);
const projectIdx = args.indexOf('--project');
const projectId = projectIdx !== -1 ? args[projectIdx + 1] : process.env.GOOGLE_CLOUD_PROJECT;
const isDryRun = args.includes('--dry-run');

if (!projectId) {
  console.error('Missing --project <projectId> (or GOOGLE_CLOUD_PROJECT env var)');
  process.exit(1);
}

console.log(`[migrate] project=${projectId} dryRun=${isDryRun}`);

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}
const db = admin.firestore();

function buildConversationId(type, entityId, uidA, uidB) {
  const [a, b] = [uidA, uidB].sort();
  return `${type}_${entityId}_${a}__${b}`;
}

async function migrate() {
  let conversationsCreated = 0;
  let conversationsExisting = 0;
  let messagesCopied = 0;
  let messagesSkipped = 0;
  let bookingsSkipped = 0;
  let bookingsProcessed = 0;

  const bookingsSnap = await db.collection('bookings').get();
  console.log(`[migrate] Found ${bookingsSnap.size} bookings`);

  for (const bookingDoc of bookingsSnap.docs) {
    const booking = bookingDoc.data();
    const bookingId = bookingDoc.id;
    const clientId = booking.userId;
    const driverId = booking.driverId;

    if (!clientId || !driverId) {
      bookingsSkipped++;
      continue;
    }
    bookingsProcessed++;

    const convId = buildConversationId('taxi', bookingId, clientId, driverId);
    const convRef = db.collection('conversations').doc(convId);

    // 1. Créer le doc conversation si absent
    const convSnap = await convRef.get();
    if (!convSnap.exists) {
      const participants = {
        [clientId]: {
          uid: clientId,
          name: booking.clientName || booking.userName || 'Client',
          role: 'client',
        },
        [driverId]: {
          uid: driverId,
          name: booking.driverName || 'Chauffeur',
          role: 'chauffeur',
        },
      };
      const data = {
        type: 'taxi',
        entityId: bookingId,
        participants,
        participantUids: [clientId, driverId],
        lastMessage: booking.lastMessage || null,
        lastMessageAt: booking.lastMessageAt || null,
        unreadCount: {
          [clientId]: (booking.unreadMessages && booking.unreadMessages.client) || 0,
          [driverId]: (booking.unreadMessages && booking.unreadMessages.driver) || 0,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        migratedFromBookingAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (!isDryRun) {
        await convRef.set(data);
      }
      conversationsCreated++;
    } else {
      conversationsExisting++;
    }

    // 2. Copier les messages
    const oldMessagesSnap = await db
      .collection('bookings')
      .doc(bookingId)
      .collection('messages')
      .get();

    if (oldMessagesSnap.empty) continue;

    const targetColl = convRef.collection('messages');

    // Lire les ids déjà présents pour idempotence
    const existingTargetSnap = await targetColl.get();
    const existingIds = new Set(existingTargetSnap.docs.map((d) => d.id));

    let batch = db.batch();
    let opsInBatch = 0;
    const MAX_OPS = 400;

    for (const msgDoc of oldMessagesSnap.docs) {
      if (existingIds.has(msgDoc.id)) {
        messagesSkipped++;
        continue;
      }
      const msgData = msgDoc.data();
      const targetData = {
        ...msgData,
        conversationId: convId,
        // map senderType "driver" -> "chauffeur" pour cohérence avec les nouveaux roles
        senderType:
          msgData.senderType === 'driver' ? 'chauffeur' : msgData.senderType,
      };
      const targetRef = targetColl.doc(msgDoc.id);
      if (!isDryRun) {
        batch.set(targetRef, targetData);
        opsInBatch++;
        if (opsInBatch >= MAX_OPS) {
          await batch.commit();
          batch = db.batch();
          opsInBatch = 0;
        }
      }
      messagesCopied++;
    }

    if (!isDryRun && opsInBatch > 0) {
      await batch.commit();
    }
  }

  console.log('-----------------------------------');
  console.log(`bookings processed   : ${bookingsProcessed}`);
  console.log(`bookings skipped     : ${bookingsSkipped} (no driverId/userId)`);
  console.log(`conversations created: ${conversationsCreated}`);
  console.log(`conversations existing: ${conversationsExisting}`);
  console.log(`messages copied      : ${messagesCopied}`);
  console.log(`messages skipped     : ${messagesSkipped} (already present)`);
  console.log('-----------------------------------');
  if (isDryRun) console.log('(dry-run — no writes performed)');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate] FAILED:', err);
    process.exit(1);
  });
