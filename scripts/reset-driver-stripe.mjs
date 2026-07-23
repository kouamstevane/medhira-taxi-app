import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import admin from 'firebase-admin';
import Stripe from 'stripe';

const uid = process.argv[2];
const shouldDeleteStripeAccount = !process.argv.includes('--keep-stripe-account');

if (!uid) {
  console.error('Usage: node scripts/reset-driver-stripe.mjs <firebase-auth-uid> [projectId] [--keep-stripe-account]');
  process.exit(1);
}

const projectFromArgs = process.argv.find((arg, index) =>
  index > 2 && !arg.startsWith('--')
);
const projectFromConfig = (() => {
  try {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), '.firebaserc'), 'utf8'));
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

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();
const driverRef = db.collection('drivers').doc(uid);
const snap = await driverRef.get();

if (!snap.exists) {
  console.error(`Driver introuvable: drivers/${uid}`);
  process.exit(1);
}

const data = snap.data() || {};
const stripeAccountId = typeof data.stripeAccountId === 'string' ? data.stripeAccountId : null;

if (stripeAccountId && shouldDeleteStripeAccount) {
  const stripeKey = process.encov.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.warn('STRIPE_SECRET_KEY absent: suppression du compte Stripe ignorée.');
  } else {
    const stripe = new Stripe(stripeKey, { apiVersion: '2025-12-15.clover' });
    try {
      await stripe.accounts.del(stripeAccountId);
      console.log(`Compte Stripe supprimé: ${stripeAccountId}`);
    } catch (error) {
      console.warn(`Suppression Stripe échouée pour ${stripeAccountId}: ${error.message}`);
    }
  }
}

await driverRef.update({
  stripeAccountId: admin.firestore.FieldValue.delete(),
  stripeAccountStatus: admin.firestore.FieldValue.delete(),
  stripeAccountSyncedAt: admin.firestore.FieldValue.delete(),
  stripeChargesEnabled: admin.firestore.FieldValue.delete(),
  stripePayoutsEnabled: admin.firestore.FieldValue.delete(),
  stripeDetailsSubmitted: admin.firestore.FieldValue.delete(),
  stripeDisabledReason: admin.firestore.FieldValue.delete(),
  requirements: admin.firestore.FieldValue.delete(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});

execFileSync(
  process.execPath,
  ['scripts/reset-driver-submit-rate-limit.mjs', uid, projectId],
  { stdio: 'inherit' }
);

console.log(`Stripe reset terminé pour drivers/${uid} (${projectId})`);
