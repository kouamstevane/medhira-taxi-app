import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { z } from 'zod';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { createStripeClient, isStripeError } from './stripe-client.js';
import { getActiveMarketCountryCode } from '../config/market.js';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const DEFAULT_APP_BASE_URL = 'https://medjira-service.web.app';

const Schema = z.object({
  restaurantId: z.string().min(1),
  mode: z.enum(['onboarding', 'update']).optional().default('onboarding'),
});

function getAppBaseUrl(): string {
  const configuredUrl = process.env.APP_BASE_URL?.trim() || process.env.APP_URL?.trim() || DEFAULT_APP_BASE_URL;

  try {
    const parsedUrl = new URL(configuredUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) {
      throw new Error('unsupported protocol');
    }
    return parsedUrl.toString().replace(/\/$/, '');
  } catch {
    throw new HttpsError('failed-precondition', 'Configuration de l’application invalide.');
  }
}

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

  const stripeSecretKey = STRIPE_SECRET_KEY.value().trim();
  if (!stripeSecretKey) {
    throw new HttpsError('failed-precondition', 'Le service Stripe est momentanément indisponible.');
  }
  const stripe = createStripeClient(stripeSecretKey);
  const baseUrl = getAppBaseUrl();

  let accountId: string | undefined = r.stripeAccountId;

  if (mode === 'update') {
    if (!accountId) throw new HttpsError('failed-precondition', 'Aucun compte Stripe existant à réparer.');
  } else {
    if (accountId && r.stripeConnectStatus === 'active') throw new HttpsError('already-exists', 'Compte Stripe déjà actif.');
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: getActiveMarketCountryCode(),
        email: r.ownerEmail,
        metadata: { accountType: 'restaurant', ownerUid: uid, restaurantId },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      });
      accountId = account.id;
      await restRef.update({ stripeAccountId: accountId, stripeConnectStatus: 'in_progress', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  }

  let link;
  try {
    link = await stripe.accountLinks.create({
      account: accountId!,
      refresh_url: `${baseUrl}/stripe-return/?role=restaurant&status=refresh`,
      return_url: `${baseUrl}/stripe-return/?role=restaurant&status=success`,
      type: 'account_onboarding',
    });
  } catch (error) {
    if (isStripeError(error)) {
      logger.error('[createStripeConnectAccount] Stripe rejected account link', {
        code: error.code,
        requestId: error.requestId,
        message: error.message,
        restaurantId,
        accountId,
      });
      throw new HttpsError('failed-precondition', 'Stripe ne peut pas générer le lien de configuration. Vérifiez le compte puis réessayez.');
    }
    throw error;
  }

  logger.info('[createStripeConnectAccount] link issued', { uid, restaurantId, mode, accountId });
  return { onboardingUrl: link.url, mode };
}

export const createStripeConnectAccount = onCall(
  { region: 'europe-west1', secrets: [STRIPE_SECRET_KEY] },
  handleCreateStripeConnectAccount,
);
