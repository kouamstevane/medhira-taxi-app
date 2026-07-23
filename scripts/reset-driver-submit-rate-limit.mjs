import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import admin from 'firebase-admin';

const uid = process.argv[2];

if (!uid) {
  console.error('Usage: node scripts/reset-driver-submit-rate-limit.mjs <firebase-auth-uid> [projectId]');
  process.exit(1);
}

const sanitizeRateLimitDocId = (value) => value.replace(/[^a-zA-Z0-9_:@.-]/g, '_');
const projectFromArgs = process.argv[3];
const firebasercPath = resolve(process.cwd(), '.firebaserc');
const projectFromConfig = (() => {
  try {
    const config = JSON.parse(readFileSync(firebasercPath, 'utf8'));
    return config.projects?.default;
  } catch {
    return undefined;
  }
})();

const projectId = projectFromArgs || projectFromConfig;

if (!projectId) {
  console.error('Project ID introuvable. Passez-le en 2e argument.');
  process.exit(1);
}

const docId = sanitizeRateLimitDocId(`driver:submit__${uid}`);
const path = `rateLimits/${docId}`;

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

await admin.firestore().doc(path).delete();

console.log(`Rate limit reset: ${path} (${projectId})`);
