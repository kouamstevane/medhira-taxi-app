/**
 * API Route — Webhook Stripe
 *
 * POST /api/webhooks/stripe
 *
 * Traite les événements Stripe de manière asynchrone et sécurisée.
 * La signature est vérifiée avec STRIPE_WEBHOOK_SECRET.
 *
 * Événements gérés :
 *   - payment_intent.succeeded                → Crédit portefeuille (recharge) + capture taxi
 *   - payment_intent.payment_failed           → Notification d'échec
 *   - payment_intent.canceled                 → Annulation confirmée
 *   - payment_intent.amount_capturable_updated → Autorisation confirmée (taxi)
 *   - payment_intent.requires_action          → Action requise (3D Secure)
 *   - account.updated                         → Sync statut compte Connect + requirements KYC
 *   - transfer.created                        → Confirmation virement chauffeur
 *   - charge.refunded                         → Remboursement + ajustement solde chauffeur
 *   - payout.paid                             → Virement plateforme réussi
 *   - payout.failed                           → Virement plateforme échoué
 *
 * Configuration Dashboard Stripe :
 *   URL : https://<domaine>/api/webhooks/stripe
 *   Événements : payment_intent.*, account.updated, transfer.*, charge.*, payout.*
 *
 * @module app/api/webhooks/stripe
 */

import { NextRequest, NextResponse } from 'next/server';
import stripe from '@/lib/stripe';
import { getAdminDb } from '@/lib/admin-guard';
import { syncDriverAccountStatus } from '@/services/stripe-connect.service';
import type { HandledStripeEvent } from '@/types/stripe';
import { PAYMENT_STATUS } from '@/types/stripe';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Signature manquante' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET non configuré');
    return NextResponse.json({ error: 'Configuration webhook manquante' }, { status: 500 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Webhook Stripe] Signature invalide:', msg);
    return NextResponse.json({ error: `Signature invalide: ${msg}` }, { status: 400 });
  }

  console.log(`[Webhook Stripe] ${event.type} — ${event.id}`);

  try {
    // Cast sécurisé via unknown
    const obj = event.data.object as unknown as Record<string, unknown>;
    await handleEvent(event.type as HandledStripeEvent, obj);
    return NextResponse.json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Webhook Stripe] Erreur ${event.type}:`, msg);
    // 200 pour éviter les retentatives Stripe — erreur loggée
    return NextResponse.json({ received: true, warning: msg });
  }
}

// ============================================================================
// Dispatcher
// ============================================================================

async function handleEvent(
  type: HandledStripeEvent,
  object: Record<string, unknown>
): Promise<void> {
  switch (type) {
    case 'payment_intent.amount_capturable_updated':
      await onPaymentIntentAuthorized(object);
      break;
    case 'payment_intent.succeeded':
      await onPaymentIntentSucceeded(object);
      break;
    case 'payment_intent.payment_failed':
      await onPaymentIntentFailed(object);
      break;
    case 'payment_intent.canceled':
      await onPaymentIntentCanceled(object);
      break;
    case 'payment_intent.requires_action':
      await onPaymentIntentRequiresAction(object);
      break;
    case 'account.updated':
      await onAccountUpdated(object);
      break;
    case 'transfer.created':
      await onTransferCreated(object);
      break;
    case 'charge.refunded':
      await onChargeRefunded(object);
      break;
    case 'payout.paid':
      await onPayoutPaid(object);
      break;
    case 'payout.failed':
      await onPayoutFailed(object);
      break;
    default:
      console.log(`[Webhook Stripe] Événement ignoré: ${type}`);
  }
}

// ============================================================================
// Handlers
// ============================================================================

async function onPaymentIntentAuthorized(pi: Record<string, unknown>) {
  const piId = pi.id as string;
  const metadata = (pi.metadata ?? {}) as Record<string, string>;

  if (metadata.purpose === 'taxi_ride' && metadata.bookingId) {
    await getAdminDb().collection('bookings').doc(metadata.bookingId).update({
      paymentStatus: PAYMENT_STATUS.AUTHORIZED,
      stripePaymentIntentId: piId,
    });
  }
}

async function onPaymentIntentSucceeded(pi: Record<string, unknown>) {
  const piId = pi.id as string;
  const metadata = (pi.metadata ?? {}) as Record<string, string>;
  const amountReceived = (pi.amount_received as number) ?? 0;
  const currency = (pi.currency as string) ?? 'cad';

  // Fix #1 — wallet_recharge : idempotence via document ID = piId (atomique)
  if (metadata.purpose === 'wallet_recharge' && metadata.userId) {
    const db = getAdminDb();
    const walletRef = db.collection('wallets').doc(metadata.userId);
    // Le document de transaction utilise piId comme ID — tx.create() échoue si déjà présent
    const txRef = db.collection('transactions').doc(piId);

    await db.runTransaction(async (tx) => {
      const [txSnap, walletSnap] = await Promise.all([
        tx.get(txRef),
        tx.get(walletRef),
      ]);

      if (txSnap.exists) {
        console.warn(`[Webhook Stripe] payment_intent.succeeded déjà traité: ${piId}`);
        return; // Idempotence atomique — doc déjà présent
      }

      const currentBalance = walletSnap.exists ? (walletSnap.data()?.balance ?? 0) : 0;
      const zeroDecimal = ['xaf', 'xof'].includes(currency);
      const amount = zeroDecimal ? amountReceived : amountReceived / 100;

      if (walletSnap.exists) {
        tx.update(walletRef, { balance: currentBalance + amount, updatedAt: new Date() });
      } else {
        tx.set(walletRef, {
          userId: metadata.userId,
          balance: amount,
          currency: currency.toUpperCase(),
          updatedAt: new Date(),
        });
      }

      // tx.create() garantit l'unicité — erreur si une autre instance a déjà committé
      tx.create(txRef, {
        userId: metadata.userId,
        type: 'deposit',
        method: 'card',
        amount,
        netAmount: amount,
        fees: 0,
        currency: currency.toUpperCase(),
        status: 'completed',
        stripePaymentIntentId: piId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
  }

  // Fix #5 — taxi_ride : idempotence, ne pas écraser si déjà 'captured'
  if (metadata.purpose === 'taxi_ride' && metadata.bookingId) {
    const bookingRef = getAdminDb().collection('bookings').doc(metadata.bookingId);
    await getAdminDb().runTransaction(async (tx) => {
      const snap = await tx.get(bookingRef);
      if (!snap.exists) return;
      if (snap.data()?.paymentStatus === PAYMENT_STATUS.CAPTURED) {
        console.warn(`[Webhook Stripe] taxi_ride déjà capturé: ${metadata.bookingId}`);
        return; // Déjà traité par la route API — ne pas écraser
      }
      tx.update(bookingRef, { paymentStatus: PAYMENT_STATUS.CAPTURED });
    });
  }
}

async function onPaymentIntentFailed(pi: Record<string, unknown>) {
  const metadata = (pi.metadata ?? {}) as Record<string, string>;
  const lastError = pi.last_payment_error as Record<string, string> | null;
  const errorMsg = lastError?.message ?? 'Paiement refusé';

  if (metadata.purpose === 'taxi_ride' && metadata.bookingId) {
    await getAdminDb().collection('bookings').doc(metadata.bookingId).update({
      paymentStatus: PAYMENT_STATUS.FAILED,
      paymentError: errorMsg,
    });
  }

  if (metadata.purpose === 'wallet_recharge' && metadata.userId) {
    await getAdminDb().collection('transactions').add({
      userId: metadata.userId,
      type: 'deposit',
      method: 'card',
      status: 'failed',
      error: errorMsg,
      stripePaymentIntentId: pi.id as string,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

async function onPaymentIntentCanceled(pi: Record<string, unknown>) {
  const metadata = (pi.metadata ?? {}) as Record<string, string>;
  if (metadata.purpose === 'taxi_ride' && metadata.bookingId) {
    await getAdminDb().collection('bookings').doc(metadata.bookingId).update({
      paymentStatus: PAYMENT_STATUS.CANCELLED,
    });
  }
}

async function onPaymentIntentRequiresAction(pi: Record<string, unknown>) {
  const metadata = (pi.metadata ?? {}) as Record<string, string>;
  const nextAction = pi.next_action as Record<string, unknown> | null;

  if (metadata.purpose === 'taxi_ride' && metadata.bookingId) {
    const actionType = nextAction?.type as string | null;
    await getAdminDb().collection('bookings').doc(metadata.bookingId).update({
      paymentStatus: PAYMENT_STATUS.AUTHORIZED,
      paymentActionRequired: actionType ?? 'unknown',
      paymentActionClientSecret: (nextAction?.redirect_to_url as string) ?? null,
    });
  }
}

async function onTransferCreated(transfer: Record<string, unknown>) {
  const metadata = (transfer.metadata ?? {}) as Record<string, string>;
  const transferId = transfer.id as string;
  if (metadata.driverId && transferId) {
    await getAdminDb().collection('driver_payouts').add({
      driverId: metadata.driverId,
      stripeTransferId: transferId,
      amountCents: transfer.amount as number,
      currency: transfer.currency as string,
      status: 'succeeded',
      type: metadata.type ?? 'weekly',
      processedAt: new Date(),
    });
  }
}

async function onChargeRefunded(charge: Record<string, unknown>) {
  const metadata = (charge.metadata ?? {}) as Record<string, string>;
  const amountRefunded = (charge.amount_refunded as number) ?? 0;
  const currency = (charge.currency as string) ?? 'cad';
  const zeroDecimal = ['xaf', 'xof'].includes(currency);
  const refundAmountUnit = zeroDecimal ? amountRefunded : amountRefunded / 100;

  const db = getAdminDb();

  if (metadata.bookingId) {
    await db.collection('bookings').doc(metadata.bookingId).update({
      refundAmount: refundAmountUnit,
      refundedAt: new Date(),
    });
  }

  if (metadata.userId) {
    await db.collection('transactions').add({
      userId: metadata.userId,
      type: 'refund',
      method: 'card',
      amount: refundAmountUnit,
      currency: currency.toUpperCase(),
      status: 'completed',
      bookingId: metadata.bookingId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Fix #3 — Réduire pendingBalanceCents du chauffeur (sa part du remboursement)
  if (metadata.driverId) {
    const driverRef = db.collection('drivers').doc(metadata.driverId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(driverRef);
      if (!snap.exists) return;
      const current = snap.data()?.pendingBalanceCents ?? 0;
      // Le chauffeur perd sa part (70%) du montant remboursé
      const driverShareCents = Math.round(amountRefunded * 0.7);
      const newBalance = Math.max(0, current - driverShareCents);
      tx.update(driverRef, { pendingBalanceCents: newBalance });
    });
  }
}

async function onPayoutPaid(payout: Record<string, unknown>) {
  const payoutId = payout.id as string;
  const amount = (payout.amount as number) ?? 0;
  const currency = (payout.currency as string) ?? 'cad';
  const arrivalDate = (payout.arrival_date as number) ?? null;
  const metadata = (payout.metadata ?? {}) as Record<string, string>;

  console.log(`[Webhook Stripe] Virement payé: ${payoutId} — ${amount} ${currency}`);

  await getAdminDb().collection('platform_payouts').add({
    payoutId,
    amountCents: amount,
    currency: currency.toUpperCase(),
    status: 'paid',
    arrivalDate: arrivalDate ? new Date(arrivalDate * 1000) : null,
    metadata,
    createdAt: new Date(),
  });
}

async function onPayoutFailed(payout: Record<string, unknown>) {
  const payoutId = payout.id as string;
  const amount = (payout.amount as number) ?? 0;
  const currency = (payout.currency as string) ?? 'cad';
  const failureMessage = (payout.failure_message as string) ?? 'Raison inconnue';
  const failureCode = (payout.failure_code as string) ?? null;
  const metadata = (payout.metadata ?? {}) as Record<string, string>;

  console.error(`[Webhook Stripe] Virement échoué: ${payoutId} — ${failureMessage}`);

  await getAdminDb().collection('platform_payouts').add({
    payoutId,
    amountCents: amount,
    currency: currency.toUpperCase(),
    status: 'failed',
    failureMessage,
    failureCode,
    metadata,
    createdAt: new Date(),
  });
}

async function onAccountUpdated(account: Record<string, unknown>) {
  const accountId = account.id as string;
  const metadata = (account.metadata ?? {}) as Record<string, string>;

  if (metadata.driverId && accountId) {
    await syncDriverAccountStatus(metadata.driverId, accountId);
    return;
  }

  if (accountId) {
    const db = getAdminDb();
    const driverSnap = await db
      .collection('drivers')
      .where('stripeAccountId', '==', accountId)
      .limit(1)
      .get();

    if (!driverSnap.empty) {
      const driverId = driverSnap.docs[0].id;
      await syncDriverAccountStatus(driverId, accountId);
    }
  }
}
