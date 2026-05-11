const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'medjira-service',
  credential: admin.credential.applicationDefault(),
});

const uid = process.argv[2];
const bucket = process.argv[3] || 'driver:submit';

if (!uid) {
  console.error('Usage: node scripts/reset-ratelimit.cjs <uid> [bucket]');
  process.exit(1);
}

(async () => {
  const docId = `${bucket}__${uid}`.replace(/[^a-zA-Z0-9_:@.-]/g, '_');
  const ref = admin.firestore().collection('rateLimits').doc(docId);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`[reset] No rate limit doc for ${docId} — nothing to clear.`);
    return;
  }
  await ref.delete();
  console.log(`[reset] ✅ Cleared rateLimits/${docId}`);
})()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[reset] ERROR', err);
    process.exit(1);
  });
