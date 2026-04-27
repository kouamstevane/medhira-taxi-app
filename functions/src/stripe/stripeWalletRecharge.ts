import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { z } from 'zod';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { DEFAULT_CURRENCY, MIN_WALLET_RECHARGE, MAX_WALLET_RECHARGE } from '../config/stripe.js';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

let _stripe: InstanceType<typeof Stripe> | null = null;
function getStripe(): InstanceType<typeof Stripe> {
  if (!_stripe) {
    const keyValue = stripeSecretKey.value();
    if (!keyValue) {
      console.error('[stripeWalletRecharge] STRIPE_SECRET_KEY is empty or not loaded');
      throw new HttpsError('internal', 'Configuration error: Stripe key missing');
    }
    const trimmedKey = keyValue.trim();
    if (!trimmedKey.startsWith('sk_')) {
      console.error('[stripeWalletRecharge] STRIPE_SECRET_KEY has invalid format');
      throw new HttpsError('internal', 'Configuration error: Stripe key invalid');
    }
    console.log('[stripeWalletRecharge] Initializing Stripe client with key starting with:', trimmedKey.substring(0, 10));
    _stripe = new Stripe(trimmedKey, { apiVersion: '2026-03-25.dahlia' });
  }
  return _stripe;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

const ZERO_DECIMAL = ['bif', 'clp', 'gnf', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'];
function toStripeAmount(amount: number, cur: string): number {
  return ZERO_DECIMAL.includes(cur.toLowerCase()) ? Math.round(amount) : Math.round(amount * 100);
}

const InputSchema = z.object({
  amount: z.number().finite('Le montant doit être un nombre fini').positive('Le montant doit être positif'),
});

export const stripeWalletRecharge = onCall(
  { region: 'europe-west1', secrets: [stripeSecretKey] },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    const uid = request.auth.uid;

    await enforceRateLimit({
      identifier: uid,
      bucket: 'stripe:stripeWalletRecharge',
      limit: 10,
      windowSec: 60,
    });

    const parsed = InputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    }
    const { amount } = parsed.data;

    if (amount < MIN_WALLET_RECHARGE) {
      throw new HttpsError('invalid-argument', `Montant minimum : ${MIN_WALLET_RECHARGE}`);
    }
    if (amount > MAX_WALLET_RECHARGE) {
      throw new HttpsError('invalid-argument', `Montant maximum : ${MAX_WALLET_RECHARGE}`);
    }

    try {
      const db = getDb();
      const userSnap = await db.collection('users').doc(uid).get();
      const userData = userSnap.exists ? userSnap.data() : {};
      const stripeCustomerId = userData?.stripeCustomerId ?? undefined;

      const stripeClient = getStripe();
      let paymentIntent: Awaited<ReturnType<typeof stripeClient.paymentIntents.create>>;

      if (stripeCustomerId) {
        paymentIntent = await stripeClient.paymentIntents.create(
          {
            amount: toStripeAmount(amount, DEFAULT_CURRENCY),
            currency: DEFAULT_CURRENCY.toLowerCase(),
            capture_method: 'automatic',
            metadata: { purpose: 'wallet_recharge', userId: uid },
            description: `Recharge portefeuille — utilisateur ${uid}`,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
            setup_future_usage: 'off_session',
            customer: stripeCustomerId,
          },
          { idempotencyKey: `wallet_${uid}_${toStripeAmount(amount, DEFAULT_CURRENCY)}` },
        );
      } else {
        paymentIntent = await stripeClient.paymentIntents.create(
          {
            amount: toStripeAmount(amount, DEFAULT_CURRENCY),
            currency: DEFAULT_CURRENCY.toLowerCase(),
            capture_method: 'automatic',
            metadata: { purpose: 'wallet_recharge', userId: uid },
            description: `Recharge portefeuille — utilisateur ${uid}`,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
            setup_future_usage: 'off_session',
          },
          { idempotencyKey: `wallet_${uid}_${toStripeAmount(amount, DEFAULT_CURRENCY)}` },
        );
      }

      if (!paymentIntent.client_secret) {
        throw new HttpsError('internal', 'Impossible de créer le PaymentIntent : client_secret manquant.');
      }

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount,
        currency: DEFAULT_CURRENCY,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('[stripeWalletRecharge]', err instanceof Error ? err.message : err);
      throw new HttpsError('internal', 'Une erreur est survenue. Veuillez réessayer.');
    }
  },
);
