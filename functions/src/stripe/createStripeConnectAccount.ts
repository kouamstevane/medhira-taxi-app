import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { z } from 'zod';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { createStripeClient } from './stripe-client.js';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const APP_BASE_URL = defineSecret('APP_BASE_URL');

const Schema = z.object({
  restaurantId: z.string().min(1),
  mode: z.enum(['onboarding', 'update']).optional().default('onboarding'),
});

export async function handleCreateStripeConnectAccount(request: CallableRequest<unknown>) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
  const uid = request.auth.uid;

  const parsed = Schema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Données invalides.', parsed.error.format());

  await enforceRateLimit({ identifier: uid, bucket: 'stripe:connect:create', limit: 5, windowSec: 600 });

  const { restaurantId, mode } = parsed.data;
  const restRef = admin.firestore().doc(`restaurants/${restaurantId}`);
  const snap = await restRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Restaurant introuvable.');
  const r = snap.data()!;
  if (r.ownerId !== uid) throw new HttpsError('permission-denied', 'Action non autorisée.');
  if (r.status !== 'approved') throw new HttpsError('failed-precondition', 'Le restaurant doit être approuvé.');

  const stripe = createStripeClient(STRIPE_SECRET_KEY.value());
  const baseUrl = APP_BASE_URL.value();

  let accountId: string | undefined = r.stripeAccountId;
  let linkType: 'account_onboarding' | 'account_update';

  if (mode === 'update') {
    if (!accountId) throw new HttpsError('failed-precondition', 'Aucun compte Stripe existant à réparer.');
    linkType = 'account_update';
  } else {
    if (accountId && r.stripeConnectStatus === 'active') throw new HttpsError('already-exists', 'Compte Stripe déjà actif.');
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'FR',
        email: r.ownerEmail,
        metadata: { accountType: 'restaurant', ownerUid: uid, restaurantId },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      });
      accountId = account.id;
      await restRef.update({ stripeAccountId: accountId, stripeConnectStatus: 'in_progress', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    linkType = 'account_onboarding';
  }

  const link = await stripe.accountLinks.create({
    account: accountId!,
    refresh_url: `${baseUrl}/stripe-return/?role=restaurant&status=refresh`,
    return_url: `${baseUrl}/stripe-return/?role=restaurant&status=success`,
    type: linkType,
  });

  logger.info('[createStripeConnectAccount] link issued', { uid, restaurantId, mode, accountId });
  return { onboardingUrl: link.url, mode };
}

export const createStripeConnectAccount = onCall(
  { region: 'europe-west1', secrets: [STRIPE_SECRET_KEY, APP_BASE_URL] },
  handleCreateStripeConnectAccount,
);
