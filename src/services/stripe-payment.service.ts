/**
 * Service Stripe — PaymentIntents
 *
 * Gère le cycle de vie complet des paiements passager :
 *   1. Autorisation (capture_method: manual)  → lors de la demande de course
 *   2. Capture                                 → à la fin de la course
 *   3. Annulation / Remboursement              → si la course est annulée
 *
 * Également utilisé pour la recharge du portefeuille via carte bancaire.
 *
 * ⚠️  Ce module est SERVEUR uniquement. Ne jamais l'importer côté client.
 *
 * @module services/stripe-payment.service
 */

import Stripe from 'stripe';
import stripe from '@/lib/stripe';
import type {
  CreatePaymentIntentResponse,
  PaymentIntentMetadata,
} from '@/types/stripe';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convertit un montant en unité de base (float) vers les centimes Stripe (integer).
 * Exemple : 12.50 CAD → 1250 | 500 XAF → non supporté (retourne 0)
 *
 * Les devises "zero-decimal" (JPY, etc.) ne nécessitent pas de conversion,
 * mais toutes nos devises cibles (CAD, EUR) sont à 2 décimales.
 */
export function toStripeAmount(amount: number, currency: string): number {
  const zeroDecimalCurrencies = ['bif', 'clp', 'gnf', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'];
  if (zeroDecimalCurrencies.includes(currency.toLowerCase())) {
    return Math.round(amount);
  }
  return Math.round(amount * 100);
}

/**
 * Convertit les centimes Stripe vers le montant affiché (float).
 */
export function fromStripeAmount(amountCents: number, currency: string): number {
  const zeroDecimalCurrencies = ['bif', 'clp', 'gnf', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'];
  if (zeroDecimalCurrencies.includes(currency.toLowerCase())) {
    return amountCents;
  }
  return amountCents / 100;
}

// ============================================================================
// PAIEMENT COURSE TAXI
// ============================================================================

/**
 * Crée un PaymentIntent en mode autorisation (sans capture immédiate).
 *
 * Le montant est réservé sur la carte du passager mais non débité.
 * La capture intervient à la fin de la course via `captureRidePayment()`.
 *
 * @param amount     Montant de la course (dans la devise du marché actif)
 * @param currency   Code ISO de la devise (ex: 'cad', 'eur')
 * @param userId     ID Firebase de l'utilisateur
 * @param bookingId  ID de la course Firestore
 */
export async function createRidePaymentIntent(
  amount: number,
  currency: string,
  userId: string,
  bookingId: string,
  customerId?: string,
  paymentMethodId?: string
): Promise<CreatePaymentIntentResponse> {
  const metadata: PaymentIntentMetadata = {
    purpose: 'taxi_ride',
    userId,
    bookingId,
  };

  const baseParams: Stripe.PaymentIntentCreateParams = {
    amount: toStripeAmount(amount, currency),
    currency: currency.toLowerCase(),
    capture_method: 'manual',
    metadata: metadata as unknown as Record<string, string>,
    description: `Course taxi #${bookingId}`,
    automatic_payment_methods: {
      enabled: true,
    },
    setup_future_usage: 'off_session',
  };

  if (customerId && paymentMethodId) {
    baseParams.customer = customerId;
    baseParams.payment_method = paymentMethodId;
    baseParams.confirm = true;
    baseParams.off_session = true;
    baseParams.return_url = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BASE_URL
      ? `${process.env.NEXT_PUBLIC_BASE_URL}/taxi/confirmation`
      : 'https://medjira.app/taxi/confirmation';
  }

  const paymentIntent = await stripe.paymentIntents.create(
    baseParams,
    { idempotencyKey: `pi_${bookingId}_${toStripeAmount(amount, currency)}_taxi_ride` }
  );

  if (!paymentIntent.client_secret) {
    throw new Error('Impossible de créer le PaymentIntent : client_secret manquant');
  }

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount,
    currency,
  };
}

/**
 * Capture un PaymentIntent autorisé (débite réellement le passager).
 * Appelé lorsque la course est marquée "completed".
 *
 * @param paymentIntentId  ID du PaymentIntent à capturer
 * @param captureAmount    Montant final à capturer (optionnel — montant total par défaut)
 * @param currency         Devise (nécessaire pour la conversion en centimes)
 */
export async function captureRidePayment(
  paymentIntentId: string,
  captureAmount?: number,
  currency?: string
): Promise<void> {
  const params = captureAmount && currency
    ? { amount_to_capture: toStripeAmount(captureAmount, currency) }
    : undefined;

  await stripe.paymentIntents.capture(paymentIntentId, params, {
    idempotencyKey: `capture_${paymentIntentId}`,
  });
}

/**
 * Annule un PaymentIntent (libère l'autorisation sans débit).
 * Appelé lorsque la course est annulée avant la capture.
 */
export async function cancelRidePayment(paymentIntentId: string): Promise<void> {
  await stripe.paymentIntents.cancel(paymentIntentId, undefined, {
    idempotencyKey: `cancel_${paymentIntentId}`,
  });
}

/**
 * Émet un remboursement total ou partiel sur un PaymentIntent déjà capturé.
 *
 * @param paymentIntentId  ID du PaymentIntent à rembourser
 * @param amount           Montant à rembourser (total par défaut)
 * @param currency         Devise (nécessaire pour la conversion)
 * @param reason           Motif du remboursement
 */
export async function refundRidePayment(
  paymentIntentId: string,
  amount?: number,
  currency?: string,
  reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' = 'requested_by_customer'
): Promise<void> {
  await stripe.refunds.create({
    payment_intent: paymentIntentId,
    reason,
    ...(amount && currency ? { amount: toStripeAmount(amount, currency) } : {}),
  }, {
    idempotencyKey: amount && currency
      ? `refund_${paymentIntentId}_${toStripeAmount(amount, currency)}`
      : `refund_${paymentIntentId}`,
  });
}

// ============================================================================
// RECHARGE PORTEFEUILLE
// ============================================================================

/**
 * Crée un PaymentIntent pour la recharge du portefeuille in-app.
 * Contrairement aux courses, la capture est IMMÉDIATE (capture_method: automatic).
 *
 * @param amount   Montant à recharger
 * @param currency Code ISO de la devise (ex: 'cad', 'eur')
 * @param userId   ID Firebase de l'utilisateur
 */
export async function createWalletRechargePaymentIntent(
  amount: number,
  currency: string,
  userId: string,
  customerId?: string
): Promise<CreatePaymentIntentResponse> {
  const metadata: PaymentIntentMetadata = {
    purpose: 'wallet_recharge',
    userId,
  };

  const createParams: Stripe.PaymentIntentCreateParams = {
    amount: toStripeAmount(amount, currency),
    currency: currency.toLowerCase(),
    capture_method: 'automatic',
    metadata: metadata as unknown as Record<string, string>,
    description: `Recharge portefeuille — utilisateur ${userId}`,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never',
    },
    setup_future_usage: 'off_session',
  };

  if (customerId) {
    createParams.customer = customerId;
  }

  const paymentIntent = await stripe.paymentIntents.create(
    createParams,
    { idempotencyKey: `wallet_${userId}_${toStripeAmount(amount, currency)}` }
  );

  if (!paymentIntent.client_secret) {
    throw new Error('Impossible de créer le PaymentIntent : client_secret manquant');
  }

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount,
    currency,
  };
}

// ============================================================================
// LECTURE
// ============================================================================

/**
 * Récupère un PaymentIntent par son ID.
 */
export async function getPaymentIntent(paymentIntentId: string) {
  return stripe.paymentIntents.retrieve(paymentIntentId);
}
