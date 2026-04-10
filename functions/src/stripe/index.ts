/**
 * Cloud Functions — Webhooks Stripe
 *
 * stripeWebhookInstant : 25 événements v1 (payload complet)
 *   URL : https://europe-west1-medjira-service.cloudfunctions.net/stripeWebhookInstant
 *
 * stripeWebhookLight : 10 événements v2 (thin events)
 *   URL : https://europe-west1-medjira-service.cloudfunctions.net/stripeWebhookLight
 *
 * Secrets requis (Firebase Secret Manager) :
 *   - STRIPE_SECRET_KEY
 *   - STRIPE_WEBHOOK_SECRET_INSTANT
 *   - STRIPE_WEBHOOK_SECRET_LIGHT
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { DRIVER_SHARE_RATE } from '../config/stripe.js';

// Type alias pour les événements Stripe (compatible Stripe v22 / NodeNext)
type StripeEvent = ReturnType<InstanceType<typeof Stripe>['webhooks']['constructEvent']>;

// Type étendu pour les thin events v2 (non inclus dans l'union StripeEvent)
type StripeEventLike = {
  id: string;
  type: string;
  data: { object: unknown };
};

// ── Secrets ────────────────────────────────────────────────────────────────
const stripeSecretKey      = defineSecret('STRIPE_SECRET_KEY');
const webhookSecretInstant = defineSecret('STRIPE_WEBHOOK_SECRET_INSTANT');
const webhookSecretLight   = defineSecret('STRIPE_WEBHOOK_SECRET_LIGHT');

// ── Firebase Admin guard ───────────────────────────────────────────────────
function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

// ── Stripe client factory ──────────────────────────────────────────────────
let _stripe: InstanceType<typeof Stripe> | null = null;
function getStripe(): InstanceType<typeof Stripe> {
  if (!_stripe) {
    _stripe = new Stripe(stripeSecretKey.value(), { apiVersion: '2026-03-25.dahlia' });
  }
  return _stripe;
}

// ── Statuts de paiement ────────────────────────────────────────────────────
const PAYMENT_STATUS = {
  AUTHORIZED:      'authorized',
  CAPTURED:        'captured',
  FAILED:          'failed',
  CANCELLED:       'cancelled',
  REQUIRES_ACTION: 'requires_action',
} as const;

// =============================================================================
// stripeWebhookInstant — événements v1 (payload complet)
// =============================================================================

export const stripeWebhookInstant = onRequest(
  {
    region: 'europe-west1',
    secrets: [stripeSecretKey, webhookSecretInstant],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const sig = req.headers['stripe-signature'] as string | undefined;
    if (!sig) {
      res.status(400).json({ error: 'Signature manquante' });
      return;
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).json({ error: 'Corps brut manquant' });
      return;
    }

    let event: StripeEvent;
    try {
      event = getStripe().webhooks.constructEvent(
        rawBody,
        sig,
        webhookSecretInstant.value(),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[stripeWebhookInstant] Signature invalide:', msg);
      res.status(400).json({ error: `Signature invalide: ${msg}` });
      return;
    }

    console.log(`[stripeWebhookInstant] ${event.type} — ${event.id}`);

    try {
      await handleInstantEvent(event);
      res.json({ received: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[stripeWebhookInstant] Erreur ${event.type}:`, msg);
      res.json({ received: true, warning: msg });
    }
  },
);

// =============================================================================
// Dispatcher INSTANT
// =============================================================================

async function handleInstantEvent(event: StripeEvent): Promise<void> {
  const obj = event.data.object as unknown as Record<string, unknown>;

  switch (event.type) {
    case 'payment_intent.amount_capturable_updated':
      await onPaymentIntentAuthorized(obj); break;
    case 'payment_intent.succeeded':
      await onPaymentIntentSucceeded(obj); break;
    case 'payment_intent.payment_failed':
      await onPaymentIntentFailed(obj); break;
    case 'payment_intent.canceled':
      await onPaymentIntentCanceled(obj); break;
    case 'payment_intent.requires_action':
      await onPaymentIntentRequiresAction(obj); break;
    case 'account.updated':
      await onAccountUpdated(obj); break;
    case 'capability.updated':
      await onCapabilityUpdated(obj); break;
    case 'charge.refunded':
      await onChargeRefunded(obj); break;
    case 'charge.dispute.created':
      await onDisputeCreated(obj); break;
    case 'charge.dispute.updated':
      await onDisputeUpdated(obj); break;
    case 'charge.dispute.closed':
      await onDisputeClosed(obj); break;
    case 'charge.dispute.funds_withdrawn':
      await onDisputeFundsWithdrawn(obj); break;
    case 'charge.dispute.funds_reinstated':
      await onDisputeFundsReinstated(obj); break;
    case 'transfer.created':
      await onTransferCreated(obj); break;
    case 'transfer.reversed':
      await onTransferReversed(obj); break;
    case 'payout.paid':
      await onPayoutPaid(obj); break;
    case 'payout.failed':
      await onPayoutFailed(obj); break;
    case 'payout.canceled':
      await onPayoutCanceled(obj); break;
    case 'refund.created':
      await onRefundCreated(obj); break;
    case 'refund.failed':
      await onRefundFailed(obj); break;
    case 'identity.verification_session.verified':
      await onIdentityVerified(obj); break;
    case 'identity.verification_session.requires_input':
      await onIdentityRequiresInput(obj); break;
    case 'identity.verification_session.canceled':
      await onIdentityCanceled(obj); break;
    case 'setup_intent.succeeded':
      await onSetupIntentSucceeded(obj); break;
    case 'setup_intent.setup_failed':
      await onSetupIntentFailed(obj); break;
    default:
      console.log(`[stripeWebhookInstant] Événement ignoré: ${event.type}`);
  }
}

// =============================================================================
// Handlers INSTANT
// =============================================================================

async function onPaymentIntentAuthorized(pi: Record<string, unknown>): Promise<void> {
  const piId     = pi.id as string;
  const metadata = (pi.metadata ?? {}) as Record<string, string>;

  if (metadata.purpose === 'taxi_ride' && metadata.bookingId) {
    await getDb().collection('bookings').doc(metadata.bookingId).update({
      paymentStatus:         PAYMENT_STATUS.AUTHORIZED,
      stripePaymentIntentId: piId,
    });
  }
}

async function onPaymentIntentSucceeded(pi: Record<string, unknown>): Promise<void> {
  const piId           = pi.id as string;
  const metadata       = (pi.metadata ?? {}) as Record<string, string>;
  const amountReceived = (pi.amount_received as number) ?? 0;
  const currency       = (pi.currency as string) ?? 'cad';

  if (metadata.purpose === 'wallet_recharge' && metadata.userId) {
    const db        = getDb();
    const walletRef = db.collection('wallets').doc(metadata.userId);
    const txRef     = db.collection('transactions').doc(piId);

    await db.runTransaction(async (tx) => {
      const [txSnap, walletSnap] = await Promise.all([
        tx.get(txRef),
        tx.get(walletRef),
      ]);

      if (txSnap.exists) {
        console.warn(`[Webhook] payment_intent.succeeded déjà traité: ${piId}`);
        return;
      }

      const zeroDecimal    = ['xaf', 'xof'].includes(currency);
      const amount         = zeroDecimal ? amountReceived : amountReceived / 100;
      const currentBalance = walletSnap.exists ? (walletSnap.data()?.balance ?? 0) : 0;

      if (walletSnap.exists) {
        tx.update(walletRef, { balance: currentBalance + amount, updatedAt: new Date() });
      } else {
        tx.set(walletRef, {
          userId:    metadata.userId,
          balance:   amount,
          currency:  currency.toUpperCase(),
          updatedAt: new Date(),
        });
      }

      tx.create(txRef, {
        userId:                metadata.userId,
        type:                  'deposit',
        method:                'card',
        amount,
        netAmount:             amount,
        fees:                  null,
        currency:              currency.toUpperCase(),
        status:                'completed',
        stripePaymentIntentId: piId,
        createdAt:             new Date(),
        updatedAt:             new Date(),
      });
    });
  }

  if (metadata.purpose === 'taxi_ride' && metadata.bookingId) {
    const db         = getDb();
    const bookingRef = db.collection('bookings').doc(metadata.bookingId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(bookingRef);
      if (!snap.exists) return;
      if (snap.data()?.paymentStatus === PAYMENT_STATUS.CAPTURED) {
        console.warn(`[Webhook] taxi_ride déjà capturé: ${metadata.bookingId}`);
        return;
      }
      tx.update(bookingRef, { paymentStatus: PAYMENT_STATUS.CAPTURED });
    });
  }
}

async function onPaymentIntentFailed(pi: Record<string, unknown>): Promise<void> {
  const piId      = pi.id as string;
  const metadata  = (pi.metadata ?? {}) as Record<string, string>;
  const lastError = pi.last_payment_error as Record<string, string> | null;
  const errorMsg  = lastError?.message ?? 'Paiement refusé';
  const db        = getDb();

  if (metadata.purpose === 'taxi_ride' && metadata.bookingId) {
    const bookingRef = db.collection('bookings').doc(metadata.bookingId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(bookingRef);
      if (!snap.exists) return;
      if (snap.data()?.paymentStatus === PAYMENT_STATUS.FAILED) return; // déjà traité
      tx.update(bookingRef, { paymentStatus: PAYMENT_STATUS.FAILED, paymentError: errorMsg });
    });
  }

  if (metadata.purpose === 'wallet_recharge' && metadata.userId) {
    await db.collection('transactions').doc(`${piId}_failed`).set({
      userId:                metadata.userId,
      type:                  'deposit',
      method:                'card',
      status:                'failed',
      error:                 errorMsg,
      stripePaymentIntentId: piId,
      createdAt:             new Date(),
      updatedAt:             new Date(),
    });
  }
}

async function onPaymentIntentCanceled(pi: Record<string, unknown>): Promise<void> {
  const metadata = (pi.metadata ?? {}) as Record<string, string>;
  if (metadata.purpose === 'taxi_ride' && metadata.bookingId) {
    const db         = getDb();
    const bookingRef = db.collection('bookings').doc(metadata.bookingId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(bookingRef);
      if (!snap.exists) return;

      const currentStatus = snap.data()?.paymentStatus;

      // Ne pas rétrograder un statut terminal positif (captured) vers cancelled
      if (currentStatus === PAYMENT_STATUS.CAPTURED) {
        console.warn(
          `[Webhook] onPaymentIntentCanceled: ignoré — booking ${metadata.bookingId} déjà capturé`
        );
        return;
      }

      // Idempotence : déjà annulé, ne rien faire
      if (currentStatus === PAYMENT_STATUS.CANCELLED) {
        console.warn(
          `[Webhook] onPaymentIntentCanceled: déjà annulé — ${metadata.bookingId}`
        );
        return;
      }

      tx.update(bookingRef, { paymentStatus: PAYMENT_STATUS.CANCELLED });
    });
  }
}

async function onPaymentIntentRequiresAction(pi: Record<string, unknown>): Promise<void> {
  const metadata    = (pi.metadata ?? {}) as Record<string, string>;
  const nextAction  = pi.next_action as Record<string, unknown> | null;
  const actionType  = nextAction?.type as string | null;
  const redirectObj = nextAction?.redirect_to_url as { url?: string } | null;

  if (metadata.purpose === 'taxi_ride' && metadata.bookingId) {
    await getDb().collection('bookings').doc(metadata.bookingId).update({
      paymentStatus:             PAYMENT_STATUS.REQUIRES_ACTION,
      paymentActionRequired:     actionType ?? 'unknown',
      paymentActionRedirectUrl: redirectObj?.url ?? null,
    });
  }
}

async function syncDriverAccountStatus(driverId: string, accountId: string): Promise<void> {
  const account = await getStripe().accounts.retrieve(accountId);

  let stripeAccountStatus: 'active' | 'pending' | 'restricted' | 'disabled';

  if (!account || ('deleted' in account && account.deleted)) {
    stripeAccountStatus = 'disabled';
  } else if (account.charges_enabled && account.payouts_enabled) {
    stripeAccountStatus = 'active';
  } else if (account.requirements?.disabled_reason) {
    stripeAccountStatus = 'restricted';
  } else {
    stripeAccountStatus = 'pending';
  }

  const updateData: Record<string, unknown> = { stripeAccountStatus };

  if (account.requirements) {
    updateData.requirements = {
      currently_due:    account.requirements.currently_due ?? [],
      current_deadline: account.requirements.current_deadline ?? null,
      lastCheckedAt:    new Date(),
    };
  }

  await getDb().collection('drivers').doc(driverId).update(updateData);
}

async function onAccountUpdated(account: Record<string, unknown>): Promise<void> {
  const accountId = account.id as string;
  const metadata  = (account.metadata ?? {}) as Record<string, string>;

  if (metadata.driverId && accountId) {
    await syncDriverAccountStatus(metadata.driverId, accountId);
    return;
  }

  if (accountId) {
    const snap = await getDb()
      .collection('drivers')
      .where('stripeAccountId', '==', accountId)
      .limit(1)
      .get();
    if (!snap.empty) {
      await syncDriverAccountStatus(snap.docs[0].id, accountId);
    }
  }
}

async function onCapabilityUpdated(capability: Record<string, unknown>): Promise<void> {
  const accountId = capability.account as string;
  const capId     = capability.id as string;
  const status    = capability.status as string;

  if (!accountId) return;

  const snap = await getDb()
    .collection('drivers')
    .where('stripeAccountId', '==', accountId)
    .limit(1)
    .get();

  if (!snap.empty) {
    await getDb().collection('drivers').doc(snap.docs[0].id).update({
      [`capabilities.${capId}`]: status,
      capabilitiesUpdatedAt:     new Date(),
    });
  }
}

async function onChargeRefunded(charge: Record<string, unknown>): Promise<void> {
  const chargeId    = charge.id as string;
  const metadata    = (charge.metadata ?? {}) as Record<string, string>;
  const currency    = (charge.currency as string) ?? 'cad';
  const zeroDecimal = ['xaf', 'xof'].includes(currency);
  const db          = getDb();

  // Utiliser le montant du dernier remboursement (delta), pas le cumulatif charge.amount_refunded
  // charge.refunds.data est trié du plus récent au plus ancien
  const refundsData      = (charge.refunds as any)?.data ?? [];
  const lastRefundAmount: number = refundsData.length > 0
    ? (refundsData[0].amount as number)
    : ((charge.amount_refunded as number) ?? 0);
  const refundAmount    = zeroDecimal ? lastRefundAmount : lastRefundAmount / 100;
  const driverShareCents = Math.round(lastRefundAmount * DRIVER_SHARE_RATE);

  const txRef     = db.collection('transactions').doc(`refund_${chargeId}`);
  const driverRef = metadata.driverId
    ? db.collection('drivers').doc(metadata.driverId)
    : null;

  await db.runTransaction(async (tx) => {
    const txSnap = await tx.get(txRef);
    if (txSnap.exists) {
      console.warn(`[Webhook] charge.refunded déjà traité: ${chargeId}`);
      return;
    }

    const driverSnap = driverRef ? await tx.get(driverRef) : null;

    if (metadata.bookingId) {
      const bookingRef = db.collection('bookings').doc(metadata.bookingId);
      tx.update(bookingRef, { refundAmount, refundedAt: new Date() });
    }

    if (metadata.userId) {
      tx.create(txRef, {
        userId:    metadata.userId,
        type:      'refund',
        method:    'card',
        amount:    refundAmount,
        currency:  currency.toUpperCase(),
        status:    'completed',
        bookingId: metadata.bookingId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    if (driverRef && driverSnap?.exists) {
      const current    = driverSnap.data()?.pendingBalanceCents ?? 0;
      const newBalance = Math.max(0, current - driverShareCents);
      tx.update(driverRef, { pendingBalanceCents: newBalance });
    }
  });
}

async function onDisputeCreated(dispute: Record<string, unknown>): Promise<void> {
  const disputeId = dispute.id as string;
  const db = getDb();
  const ref = db.collection('stripe_disputes').doc(disputeId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return;
    tx.set(ref, {
      disputeId,
      chargeId:  dispute.charge as string,
      amount:    dispute.amount as number,
      currency:  dispute.currency as string,
      reason:    dispute.reason as string,
      status:    dispute.status as string,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
  console.warn(`[Webhook] Litige créé: ${disputeId}`);
}

async function onDisputeUpdated(dispute: Record<string, unknown>): Promise<void> {
  const disputeId = dispute.id as string;
  await getDb().collection('stripe_disputes').doc(disputeId).set(
    { status: dispute.status as string, updatedAt: new Date() },
    { merge: true },
  );
}

async function onDisputeClosed(dispute: Record<string, unknown>): Promise<void> {
  const disputeId = dispute.id as string;
  await getDb().collection('stripe_disputes').doc(disputeId).set(
    { status: dispute.status as string, closedAt: new Date() },
    { merge: true },
  );
}

async function onDisputeFundsWithdrawn(dispute: Record<string, unknown>): Promise<void> {
  const disputeId = dispute.id as string;
  await getDb().collection('stripe_disputes').doc(disputeId).set(
    { fundsWithdrawnAt: new Date() },
    { merge: true },
  );
  console.warn(`[Webhook] Fonds prélevés pour litige: ${disputeId}`);
}

async function onDisputeFundsReinstated(dispute: Record<string, unknown>): Promise<void> {
  const disputeId = dispute.id as string;
  await getDb().collection('stripe_disputes').doc(disputeId).set(
    { fundsReinstatedAt: new Date() },
    { merge: true },
  );
}

async function onTransferCreated(transfer: Record<string, unknown>): Promise<void> {
  const transferId = transfer.id as string;
  const metadata   = (transfer.metadata ?? {}) as Record<string, string>;

  if (!metadata.driverId || !transferId) return;

  const db  = getDb();
  const ref = db.collection('driver_payouts').doc(transferId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      console.warn(`[Webhook] transfer.created déjà traité: ${transferId}`);
      return;
    }
    tx.set(ref, {
      driverId:         metadata.driverId,
      stripeTransferId: transferId,
      amountCents:      transfer.amount as number,
      currency:         transfer.currency as string,
      status:           'succeeded',
      type:             metadata.type ?? 'weekly',
      processedAt:      new Date(),
    });
  });
}

async function onTransferReversed(transfer: Record<string, unknown>): Promise<void> {
  const transferId = transfer.id as string;
  await getDb().collection('driver_payouts').doc(transferId).set(
    { status: 'reversed', reversedAt: new Date() },
    { merge: true },
  );
  console.warn(`[Webhook] Virement inversé: ${transferId}`);
}

async function onPayoutPaid(payout: Record<string, unknown>): Promise<void> {
  const payoutId    = payout.id as string;
  const arrivalDate = (payout.arrival_date as number) ?? null;
  const ref = getDb().collection('platform_payouts').doc(payoutId);
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return; // idempotent — ignorer replay
    tx.set(ref, {
      payoutId,
      amountCents:  payout.amount as number,
      currency:     (payout.currency as string).toUpperCase(),
      status:       'paid',
      arrivalDate:  arrivalDate ? new Date(arrivalDate * 1000) : null,
      metadata:     (payout.metadata ?? {}) as Record<string, string>,
      createdAt:    new Date(),
    });
  });
}

async function onPayoutFailed(payout: Record<string, unknown>): Promise<void> {
  const payoutId = payout.id as string;
  const ref = getDb().collection('platform_payouts').doc(payoutId);
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return; // idempotent — ignorer replay
    tx.set(ref, {
      payoutId,
      amountCents:    payout.amount as number,
      currency:       (payout.currency as string).toUpperCase(),
      status:         'failed',
      failureMessage: (payout.failure_message as string) ?? 'Raison inconnue',
      failureCode:    (payout.failure_code as string) ?? null,
      metadata:       (payout.metadata ?? {}) as Record<string, string>,
      createdAt:      new Date(),
    });
  });
}

async function onPayoutCanceled(payout: Record<string, unknown>): Promise<void> {
  const payoutId = payout.id as string;
  const db       = getDb();
  const ref      = db.collection('platform_payouts').doc(payoutId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    // Idempotence : déjà annulé, ne rien faire
    if (snap.exists && snap.data()?.status === 'canceled') {
      console.warn(`[Webhook] onPayoutCanceled: déjà traité — ${payoutId}`);
      return;
    }

    // Conserver createdAt si le document existait déjà
    const existingCreatedAt = snap.exists ? snap.data()?.createdAt : new Date();

    tx.set(
      ref,
      {
        payoutId,
        amountCents: payout.amount as number,
        currency:    (payout.currency as string).toUpperCase(),
        status:      'canceled',
        canceledAt:  new Date(),
        metadata:    (payout.metadata ?? {}) as Record<string, string>,
        createdAt:   existingCreatedAt ?? new Date(),
      },
      { merge: true },
    );
  });
}

async function onRefundCreated(refund: Record<string, unknown>): Promise<void> {
  const refundId = refund.id as string;
  const db = getDb();
  const ref = db.collection('stripe_refunds').doc(refundId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return;
    tx.set(ref, {
      refundId,
      chargeId:  refund.charge as string,
      amount:    refund.amount as number,
      currency:  refund.currency as string,
      status:    refund.status as string,
      reason:    refund.reason as string | null,
      createdAt: new Date(),
    });
  });
}

async function onRefundFailed(refund: Record<string, unknown>): Promise<void> {
  const refundId = refund.id as string;
  await getDb().collection('stripe_refunds').doc(refundId).set(
    { status: 'failed', failureReason: refund.failure_reason as string | null, failedAt: new Date() },
    { merge: true },
  );
  console.error(`[Webhook] Remboursement échoué: ${refundId}`);
}

async function onIdentityVerified(session: Record<string, unknown>): Promise<void> {
  const sessionId = session.id as string;
  const metadata  = (session.metadata ?? {}) as Record<string, string>;

  if (metadata.driverId) {
    await getDb().collection('drivers').doc(metadata.driverId).update({
      identityVerified:   true,
      identityVerifiedAt: new Date(),
      identitySessionId:  sessionId,
    });
  }
}

async function onIdentityRequiresInput(session: Record<string, unknown>): Promise<void> {
  const metadata  = (session.metadata ?? {}) as Record<string, string>;
  const lastError = (session.last_error ?? {}) as Record<string, string>;

  if (metadata.driverId) {
    await getDb().collection('drivers').doc(metadata.driverId).update({
      identityVerified:      false,
      identityRequiresInput: true,
      identityErrorCode:     lastError.code ?? null,
      identityErrorReason:   lastError.reason ?? null,
    });
  }
}

async function onIdentityCanceled(session: Record<string, unknown>): Promise<void> {
  const metadata = (session.metadata ?? {}) as Record<string, string>;

  if (metadata.driverId) {
    await getDb().collection('drivers').doc(metadata.driverId).update({
      identityVerified:  false,
      identitySessionId: null,
    });
  }
}

async function onSetupIntentSucceeded(si: Record<string, unknown>): Promise<void> {
  const siId     = si.id as string;
  const metadata = (si.metadata ?? {}) as Record<string, string>;
  const pmId     = si.payment_method as string | null;

  if (metadata.userId && pmId) {
    await getDb().collection('users').doc(metadata.userId).update({
      defaultPaymentMethodId: pmId,
      setupIntentId:          siId,
      updatedAt:              new Date(),
    });
  }
}

async function onSetupIntentFailed(si: Record<string, unknown>): Promise<void> {
  const siId      = si.id as string;
  const metadata  = (si.metadata ?? {}) as Record<string, string>;
  const lastError = si.last_setup_error as Record<string, string> | null;

  if (metadata.userId) {
    await getDb().collection('users').doc(metadata.userId).update({
      setupIntentError: lastError?.message ?? 'Échec de configuration',
      setupIntentId:    siId,
      updatedAt:        new Date(),
    });
  }
}

// =============================================================================
// stripeWebhookLight — événements v2 (thin events Connect)
// =============================================================================

export const stripeWebhookLight = onRequest(
  {
    region: 'europe-west1',
    secrets: [stripeSecretKey, webhookSecretLight],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const sig = req.headers['stripe-signature'] as string | undefined;
    if (!sig) {
      res.status(400).json({ error: 'Signature manquante' });
      return;
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).json({ error: 'Corps brut manquant' });
      return;
    }

    let thinEvent: StripeEventLike;
    try {
      thinEvent = getStripe().webhooks.constructEvent(
        rawBody,
        sig,
        webhookSecretLight.value(),
      ) as unknown as StripeEventLike;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[stripeWebhookLight] Signature invalide:', msg);
      res.status(400).json({ error: `Signature invalide: ${msg}` });
      return;
    }

    console.log(`[stripeWebhookLight] ${thinEvent.type} — ${thinEvent.id}`);

    try {
      await handleLightEvent(thinEvent);
      res.json({ received: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[stripeWebhookLight] Erreur ${thinEvent.type}:`, msg);
      res.json({ received: true, warning: msg });
    }
  },
);

// =============================================================================
// Dispatcher LIGHT
// =============================================================================

async function handleLightEvent(event: StripeEventLike): Promise<void> {
  const obj = event.data.object as unknown as Record<string, unknown>;

  switch (event.type) {
    case 'v2.core.account.created':
      await onV2AccountCreated(obj); break;
    case 'v2.core.account.updated':
      await onV2AccountUpdated(obj); break;
    case 'v2.core.account.closed':
      await onV2AccountClosed(obj); break;
    case 'v2.core.account[identity].updated':
      await onV2AccountIdentityUpdated(obj); break;
    case 'v2.core.account[requirements].updated':
      await onV2AccountRequirementsUpdated(obj); break;
    case 'v2.core.account[future_requirements].updated':
      await onV2AccountFutureRequirementsUpdated(obj); break;
    case 'v2.core.account[configuration.merchant].capability_status_updated':
      await onV2CapabilityStatusUpdated(obj, 'merchant'); break;
    case 'v2.core.account[configuration.recipient].capability_status_updated':
      await onV2CapabilityStatusUpdated(obj, 'recipient'); break;
    case 'v2.core.account_link.returned':
      await onV2AccountLinkReturned(obj); break;
    case 'v2.core.health.event_generation_failure.resolved':
      console.log('[stripeWebhookLight] Santé OK — génération d\'événements rétablie');
      break;
    default:
      console.log(`[stripeWebhookLight] Événement v2 ignoré: ${event.type}`);
  }
}

// =============================================================================
// Handlers LIGHT (v2 événements Stripe Connect)
// =============================================================================

async function onV2AccountCreated(account: Record<string, unknown>): Promise<void> {
  const accountId = account.id as string;
  console.log(`[Webhook v2] Nouveau compte Connect: ${accountId}`);
}

async function onV2AccountUpdated(account: Record<string, unknown>): Promise<void> {
  const accountId = account.id as string;
  if (!accountId) return;

  const snap = await getDb()
    .collection('drivers')
    .where('stripeAccountId', '==', accountId)
    .limit(1)
    .get();

  if (!snap.empty) {
    await syncDriverAccountStatus(snap.docs[0].id, accountId);
  }
}

async function onV2AccountClosed(account: Record<string, unknown>): Promise<void> {
  const accountId = account.id as string;
  if (!accountId) return;

  const snap = await getDb()
    .collection('drivers')
    .where('stripeAccountId', '==', accountId)
    .limit(1)
    .get();

  if (!snap.empty) {
    await getDb().collection('drivers').doc(snap.docs[0].id).update({
      stripeAccountStatus:    'disabled',
      stripeAccountClosedAt:  new Date(),
      isActive:               false,
    });
    console.warn(`[Webhook v2] Compte Connect fermé: ${accountId} — chauffeur désactivé`);
  }
}

async function onV2AccountIdentityUpdated(account: Record<string, unknown>): Promise<void> {
  const accountId = account.id as string;
  if (!accountId) return;

  const snap = await getDb()
    .collection('drivers')
    .where('stripeAccountId', '==', accountId)
    .limit(1)
    .get();

  if (!snap.empty) {
    await syncDriverAccountStatus(snap.docs[0].id, accountId);
  }
}

async function onV2AccountRequirementsUpdated(account: Record<string, unknown>): Promise<void> {
  const accountId    = account.id as string;
  const requirements = account.requirements as Record<string, unknown> | null;
  if (!accountId) return;

  const snap = await getDb()
    .collection('drivers')
    .where('stripeAccountId', '==', accountId)
    .limit(1)
    .get();

  if (!snap.empty) {
    await getDb().collection('drivers').doc(snap.docs[0].id).update({
      'requirements.currently_due':    (requirements?.currently_due as string[]) ?? [],
      'requirements.current_deadline': (requirements?.current_deadline as number | null) ?? null,
      'requirements.lastCheckedAt':    new Date(),
    });
  }
}

async function onV2AccountFutureRequirementsUpdated(account: Record<string, unknown>): Promise<void> {
  const accountId          = account.id as string;
  const futureRequirements = account.future_requirements as Record<string, unknown> | null;
  if (!accountId) return;

  const snap = await getDb()
    .collection('drivers')
    .where('stripeAccountId', '==', accountId)
    .limit(1)
    .get();

  if (!snap.empty) {
    await getDb().collection('drivers').doc(snap.docs[0].id).update({
      futureRequirements: {
        currently_due:    (futureRequirements?.currently_due as string[]) ?? [],
        current_deadline: (futureRequirements?.current_deadline as number | null) ?? null,
        lastCheckedAt:    new Date(),
      },
    });
  }
}

async function onV2CapabilityStatusUpdated(
  account: Record<string, unknown>,
  configType: 'merchant' | 'recipient',
): Promise<void> {
  const accountId = account.id as string;
  if (!accountId) return;

  const snap = await getDb()
    .collection('drivers')
    .where('stripeAccountId', '==', accountId)
    .limit(1)
    .get();

  if (!snap.empty) {
    await syncDriverAccountStatus(snap.docs[0].id, accountId);
    console.log(`[Webhook v2] Capability ${configType} mise à jour: ${accountId}`);
  }
}

async function onV2AccountLinkReturned(accountLink: Record<string, unknown>): Promise<void> {
  const accountId = accountLink.account as string;
  if (!accountId) return;

  const snap = await getDb()
    .collection('drivers')
    .where('stripeAccountId', '==', accountId)
    .limit(1)
    .get();

  if (!snap.empty) {
    await syncDriverAccountStatus(snap.docs[0].id, accountId);
    console.log(`[Webhook v2] Onboarding terminé pour compte: ${accountId}`);
  }
}
