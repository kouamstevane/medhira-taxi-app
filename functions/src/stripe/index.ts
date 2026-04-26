/**
 * Cloud Functions — Webhooks Stripe + Callable Functions
 *
 * stripeWebhookInstant : 25 événements v1 (payload complet)
 *   URL : https://europe-west1-medjira-service.cloudfunctions.net/stripeWebhookInstant
 *
 * stripeWebhookLight : 10 événements v2 (thin events)
 *   URL : https://europe-west1-medjira-service.cloudfunctions.net/stripeWebhookLight
 *
 * createSetupIntent : Callable — Crée un SetupIntent pour sauvegarder
 *   une carte bancaire (onboarding client).
 *
 * Secrets requis (Firebase Secret Manager) :
 *   - STRIPE_SECRET_KEY
 *   - STRIPE_WEBHOOK_SECRET_INSTANT
 *   - STRIPE_WEBHOOK_SECRET_LIGHT
 */

import { onRequest, onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { DRIVER_SHARE_RATE } from '../config/stripe.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';

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

// ── Server timestamp helper (SEC-Q06) ──────────────────────────────────────
// Utilise l'horloge serveur Firestore plutôt que celle (potentiellement
// divergente) de l'instance Cloud Function. Cast sûr pour passer le
// sentinel dans des objets typés acceptant une Date/Timestamp.
const serverTS = (): FirebaseFirestore.FieldValue =>
  admin.firestore.FieldValue.serverTimestamp();

// ── Stripe client factory ──────────────────────────────────────────────────
let _stripe: InstanceType<typeof Stripe> | null = null;
function getStripe(): InstanceType<typeof Stripe> {
  if (!_stripe) {
    const rawKey = stripeSecretKey.value();
    // Defense-in-depth : un secret uploadé via shell peut contenir un \n / espace
    // final qui casse le header Authorization (ERR_INVALID_CHAR côté Node).
    const key = rawKey.trim();
    if (key !== rawKey) {
      console.warn('[Stripe] STRIPE_SECRET_KEY contained whitespace — trimmed', {
        rawLen: rawKey.length,
        trimmedLen: key.length,
      });
    }
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is empty');
    }
    _stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia' });
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
// createSetupIntent — Callable Function (client → serveur)
// =============================================================================

interface CreateSetupIntentResult {
  clientSecret: string;
  setupIntentId: string;
}

export const createSetupIntent = onCall(
  {
    region: 'europe-west1',
    secrets: [stripeSecretKey],
  },
  async (request: CallableRequest<void>): Promise<CreateSetupIntentResult> => {
    try {
      // 1. Vérifier l'authentification
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
      }
      const userId = request.auth.uid;

      // Rate limit: SetupIntent creation triggers Stripe API calls (cost +
      // fraud surface). 10/min is comfortable for retries/UX but caps abuse.
      await enforceRateLimit({
        identifier: userId,
        bucket: 'stripe:createSetupIntent',
        limit: 10,
        windowSec: 60,
      });

      const stripeClient = getStripe();
      const db = getDb();

      // 2. Récupérer ou créer le customerId Stripe
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      let customerId: string = userData?.stripeCustomerId ?? '';

      if (!customerId) {
        const customer = await stripeClient.customers.create({
          metadata: { userId },
          name: userData
            ? `${userData.firstName ?? ''} ${userData.lastName ?? ''}`.trim() || undefined
            : undefined,
          email: userData?.email ?? undefined,
        });
        customerId = customer.id;

        // Persister le customerId
        await db.collection('users').doc(userId).set(
          { stripeCustomerId: customerId },
          { merge: true },
        );
      }

      // 3. Créer le SetupIntent avec le Customer
      const setupIntent = await stripeClient.setupIntents.create({
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        metadata: {
          userId,
          purpose: 'save_payment_method',
        },
      });

      if (!setupIntent.client_secret) {
        throw new HttpsError('internal', 'Impossible de créer le SetupIntent : client_secret manquant.');
      }

      console.log(`[createSetupIntent] SetupIntent ${setupIntent.id} créé pour user ${userId}`);

      return {
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('[createSetupIntent] Erreur:', err);
      throw new HttpsError('internal', 'Une erreur est survenue. Veuillez réessayer.');
    }
  },
);

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
      // Ne pas exposer les détails de la signature au client (surface d'attaque)
      res.status(400).json({ error: 'Invalid signature' });
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
        tx.update(walletRef, { balance: currentBalance + amount, updatedAt: serverTS() });
      } else {
        tx.set(walletRef, {
          userId:    metadata.userId,
          balance:   amount,
          currency:  currency.toUpperCase(),
          updatedAt: serverTS(),
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
        createdAt:             serverTS(),
        updatedAt:             serverTS(),
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
      createdAt:             serverTS(),
      updatedAt:             serverTS(),
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
  let chargesEnabled = false;
  let payoutsEnabled = false;
  let detailsSubmitted = false;
  let disabledReason: string | null = null;

  if (!account || ('deleted' in account && account.deleted)) {
    stripeAccountStatus = 'disabled';
  } else {
    chargesEnabled = !!account.charges_enabled;
    payoutsEnabled = !!account.payouts_enabled;
    detailsSubmitted = !!account.details_submitted;
    disabledReason = account.requirements?.disabled_reason ?? null;

    if (chargesEnabled && payoutsEnabled) {
      stripeAccountStatus = 'active';
    } else if (disabledReason) {
      stripeAccountStatus = 'restricted';
    } else {
      stripeAccountStatus = 'pending';
    }
  }

  const updateData: Record<string, unknown> = {
    stripeAccountStatus,
    stripeChargesEnabled: chargesEnabled,
    stripePayoutsEnabled: payoutsEnabled,
    stripeDetailsSubmitted: detailsSubmitted,
    stripeDisabledReason: disabledReason,
    stripeAccountSyncedAt: serverTS(),
  };

  if (account.requirements) {
    updateData.requirements = {
      currently_due:    account.requirements.currently_due ?? [],
      past_due:         account.requirements.past_due ?? [],
      eventually_due:   account.requirements.eventually_due ?? [],
      pending_verification: account.requirements.pending_verification ?? [],
      disabled_reason:  account.requirements.disabled_reason ?? null,
      current_deadline: account.requirements.current_deadline ?? null,
      lastCheckedAt:    serverTS(),
    };
  }

  console.log('[syncDriverAccountStatus] sync', {
    driverId,
    accountId,
    stripeAccountStatus,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    disabledReason,
    currentlyDueCount: account.requirements?.currently_due?.length ?? 0,
  });

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
      capabilitiesUpdatedAt:     serverTS(),
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
  // Stripe refunds list on a Charge: shape is { data: Refund[] } (ApiList).
  // We only need amount (in minor units) from the most recent refund.
  type StripeRefundLike  = { amount: number };
  type StripeRefundList  = { data: StripeRefundLike[] };
  const refundsList      = charge.refunds as StripeRefundList | undefined;
  const refundsData: StripeRefundLike[] = refundsList?.data ?? [];
  const lastRefundAmount: number = refundsData.length > 0
    ? refundsData[0].amount
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
      tx.update(bookingRef, { refundAmount, refundedAt: serverTS() });
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
        createdAt: serverTS(),
        updatedAt: serverTS(),
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
      createdAt: serverTS(),
      updatedAt: serverTS(),
    });
  });
  console.warn(`[Webhook] Litige créé: ${disputeId}`);
}

async function onDisputeUpdated(dispute: Record<string, unknown>): Promise<void> {
  const disputeId = dispute.id as string;
  await getDb().collection('stripe_disputes').doc(disputeId).set(
    { status: dispute.status as string, updatedAt: serverTS() },
    { merge: true },
  );
}

async function onDisputeClosed(dispute: Record<string, unknown>): Promise<void> {
  const disputeId = dispute.id as string;
  await getDb().collection('stripe_disputes').doc(disputeId).set(
    { status: dispute.status as string, closedAt: serverTS() },
    { merge: true },
  );
}

async function onDisputeFundsWithdrawn(dispute: Record<string, unknown>): Promise<void> {
  const disputeId = dispute.id as string;
  await getDb().collection('stripe_disputes').doc(disputeId).set(
    { fundsWithdrawnAt: serverTS() },
    { merge: true },
  );
  console.warn(`[Webhook] Fonds prélevés pour litige: ${disputeId}`);
}

async function onDisputeFundsReinstated(dispute: Record<string, unknown>): Promise<void> {
  const disputeId = dispute.id as string;
  await getDb().collection('stripe_disputes').doc(disputeId).set(
    { fundsReinstatedAt: serverTS() },
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
      processedAt:      serverTS(),
    });
  });
}

async function onTransferReversed(transfer: Record<string, unknown>): Promise<void> {
  const transferId = transfer.id as string;
  await getDb().collection('driver_payouts').doc(transferId).set(
    { status: 'reversed', reversedAt: serverTS() },
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
      createdAt:    serverTS(),
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
      createdAt:      serverTS(),
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
    const existingCreatedAt = snap.exists ? snap.data()?.createdAt : serverTS();

    tx.set(
      ref,
      {
        payoutId,
        amountCents: payout.amount as number,
        currency:    (payout.currency as string).toUpperCase(),
        status:      'canceled',
        canceledAt:  serverTS(),
        metadata:    (payout.metadata ?? {}) as Record<string, string>,
        createdAt:   existingCreatedAt ?? serverTS(),
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
      createdAt: serverTS(),
    });
  });
}

async function onRefundFailed(refund: Record<string, unknown>): Promise<void> {
  const refundId = refund.id as string;
  await getDb().collection('stripe_refunds').doc(refundId).set(
    { status: 'failed', failureReason: refund.failure_reason as string | null, failedAt: serverTS() },
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
      identityVerifiedAt: serverTS(),
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
      updatedAt:              serverTS(),
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
      updatedAt:        serverTS(),
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
      stripeAccountClosedAt:  serverTS(),
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
      'requirements.lastCheckedAt':    serverTS(),
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
        lastCheckedAt:    serverTS(),
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

// =============================================================================
// createConnectAccount — Callable (mobile + web)
// Crée le compte Stripe Connect du chauffeur. Remplace POST /api/stripe/connect/account
// pour le build Capacitor (output:'export' n'expose pas les routes Next).
// =============================================================================

interface CreateConnectAccountInput {
  country: string;
  individual?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    // Format ISO YYYY-MM-DD
    dob?: string;
  };
}

interface CreateConnectAccountResult {
  accountId: string;
  status: 'pending' | 'existing';
}

// Conversion "YYYY-MM-DD" → { day, month, year } pour Stripe.
// Retourne null si la date est invalide ou hors d'une plage raisonnable.
function parseStripeDob(iso: string | undefined): { day: number; month: number; year: number } | null {
  if (!iso || typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > new Date().getFullYear()) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { day, month, year };
}

// Sanitize une string courte avant envoi à Stripe : trim + cap longueur.
function safeStr(v: unknown, maxLen = 100): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 && t.length <= maxLen ? t : undefined;
}

// Indicatif téléphonique par pays ISO-2 (marchés supportés par l'app).
const COUNTRY_DIAL_CODE: Record<string, string> = {
  CA: '1',
  US: '1',
  FR: '33',
  BE: '32',
  CM: '237',
};

/**
 * Normalise un numéro de téléphone au format E.164 (`+<dial><digits>`).
 * Retourne `undefined` si normalisation impossible — Stripe rejette les numéros
 * non-E.164 et ferait planter toute la création de compte.
 */
function toE164(raw: string | undefined, country: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Déjà au format international
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
    return undefined;
  }

  // Sinon on retire tout sauf chiffres et on préfixe avec l'indicatif pays.
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return undefined;

  const dial = COUNTRY_DIAL_CODE[country.toUpperCase()];
  if (!dial) return undefined;

  // Évite le double indicatif si l'utilisateur a tapé le code sans `+`
  // (ex: "1418..." au Canada — déjà préfixé avec 1).
  const normalized = digits.startsWith(dial) ? digits : dial + digits;
  if (normalized.length < 8 || normalized.length > 15) return undefined;
  return `+${normalized}`;
}

export const createConnectAccount = onCall(
  {
    region: 'europe-west1',
    secrets: [stripeSecretKey],
  },
  async (request: CallableRequest<CreateConnectAccountInput>): Promise<CreateConnectAccountResult> => {
    const t0 = Date.now();
    if (!request.auth) {
      console.warn('[createConnectAccount] unauthenticated call');
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    const uid = request.auth.uid;
    const tokenEmail = request.auth.token.email as string | undefined;
    const emailVerified = request.auth.token.email_verified as boolean | undefined;
    console.log('[createConnectAccount] start', {
      uid,
      hasEmail: !!tokenEmail,
      emailVerified,
      country: request.data?.country,
    });

    if (!tokenEmail) {
      console.warn('[createConnectAccount] missing email on token', { uid });
      throw new HttpsError('failed-precondition', 'Email manquant sur le token.');
    }
    if (!emailVerified) {
      console.warn('[createConnectAccount] email not verified', { uid, tokenEmail });
      throw new HttpsError('failed-precondition', 'Email vérifié requis.');
    }

    const country = (request.data?.country || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
      console.warn('[createConnectAccount] invalid country', { uid, raw: request.data?.country });
      throw new HttpsError('invalid-argument', 'Code pays invalide (ISO-2 attendu).');
    }

    await enforceRateLimit({
      identifier: uid,
      bucket: 'stripe:createConnectAccount',
      limit: 5,
      windowSec: 60,
    });

    const db = getDb();
    const driverRef = db.collection('drivers').doc(uid);
    const snap = await driverRef.get();
    if (!snap.exists) {
      console.warn('[createConnectAccount] driver doc missing', { uid });
      throw new HttpsError('permission-denied', 'Réservé aux chauffeurs.');
    }
    // Pré-remplissage à partir de l'inscription chauffeur (réduit la friction
    // côté formulaire Stripe — l'utilisateur peut quand même corriger sur Stripe).
    const ind = request.data?.individual;
    const firstName = safeStr(ind?.firstName);
    const lastName = safeStr(ind?.lastName);
    const rawPhone = safeStr(ind?.phone, 30);
    const phone = toE164(rawPhone, country); // peut être undefined si non normalisable
    const dob = parseStripeDob(ind?.dob);
    const individual: Record<string, unknown> = {};
    if (firstName) individual.first_name = firstName;
    if (lastName) individual.last_name = lastName;
    if (phone) individual.phone = phone;
    if (dob) individual.dob = dob;
    individual.email = tokenEmail;
    console.log('[createConnectAccount] prefill summary', {
      uid,
      hasFirstName: !!firstName,
      hasLastName: !!lastName,
      hasRawPhone: !!rawPhone,
      hasPhoneE164: !!phone,
      phoneNormalizationDropped: !!rawPhone && !phone,
      hasDob: !!dob,
    });

    const stripeClient = getStripe();

    // Si compte déjà créé : tenter un accounts.update pour appliquer le pré-remplissage
    // (cas d'un chauffeur qui retente l'onboarding sans avoir soumis le formulaire).
    // On ne touche PAS si details_submitted=true (Stripe a déjà reçu les données du KYC).
    const existing = snap.data()?.stripeAccountId as string | undefined;
    if (existing) {
      try {
        const acct = await stripeClient.accounts.retrieve(existing);
        if (acct && !('deleted' in acct && acct.deleted) && !acct.details_submitted) {
          // On n'envoie l'update QUE si on a au moins un champ utile à pré-remplir.
          const hasSomethingToPrefill = firstName || lastName || phone || dob;
          if (hasSomethingToPrefill) {
            console.log('[createConnectAccount] updating existing account with prefill', {
              uid,
              accountId: existing,
              keys: Object.keys(individual),
            });
            // Retry-without-prefill : si Stripe rejette un champ (ex: phone invalide),
            // on l'enlève et on retente — sans bloquer le retour.
            let currentInd = { ...individual };
            for (let attempt = 1; attempt <= 4; attempt++) {
              try {
                await stripeClient.accounts.update(existing, { individual: currentInd });
                console.log('[createConnectAccount] update ok', { uid, accountId: existing, attempt });
                break;
              } catch (updErr) {
                const e = updErr as { param?: string; code?: string; message?: string; raw?: { message?: string; param?: string; code?: string } };
                const param = e.param ?? e.raw?.param;
                const m = param ? /^individual\[([^\]]+)\]/.exec(param) : null;
                if (m && m[1] in currentInd && attempt < 4) {
                  console.warn('[createConnectAccount] update: Stripe rejected field — retrying without it', {
                    uid,
                    accountId: existing,
                    removedField: m[1],
                    stripeMessage: e.raw?.message ?? e.message,
                  });
                  delete currentInd[m[1]];
                  continue;
                }
                console.warn('[createConnectAccount] update failed (non-blocking)', {
                  uid,
                  accountId: existing,
                  stripeMessage: e.raw?.message ?? e.message,
                });
                break;
              }
            }
          }
        } else {
          console.log('[createConnectAccount] existing account — skip prefill update', {
            uid,
            accountId: existing,
            detailsSubmitted: acct && 'details_submitted' in acct ? acct.details_submitted : undefined,
          });
        }
      } catch (retrErr) {
        console.warn('[createConnectAccount] existing account retrieve failed (non-blocking)', {
          uid,
          accountId: existing,
          message: (retrErr as Error).message,
        });
      }
      console.log('[createConnectAccount] returning existing account', { uid, accountId: existing, durationMs: Date.now() - t0 });
      return { accountId: existing, status: 'existing' };
    }
    const buildAccountPayload = (ind: Record<string, unknown>) => ({
      country,
      email: tokenEmail,
      controller: {
        stripe_dashboard: { type: 'none' as const },
        fees: { payer: 'application' as const },
        losses: { payments: 'application' as const },
        requirement_collection: 'application' as const,
      },
      capabilities: { transfers: { requested: true } },
      business_type: 'individual' as const,
      individual: ind,
      metadata: { driverId: uid, platform: 'medjira_taxi' },
    });

    // Helper : retire récursivement les clés `individual.<rejectedField>` puis retry.
    // Stripe renvoie `param` au format "individual[phone]" → on extrait "phone".
    const stripParamFromIndividual = (param: string | undefined, ind: Record<string, unknown>): { ind: Record<string, unknown>; removed: string | null } => {
      if (!param) return { ind, removed: null };
      const m = /^individual\[([^\]]+)\]/.exec(param);
      if (!m) return { ind, removed: null };
      const key = m[1];
      if (!(key in ind)) return { ind, removed: null };
      const next = { ...ind };
      delete next[key];
      return { ind: next, removed: key };
    };

    let account;
    try {
      let currentIndividual = individual;
      let attempt = 0;
      const MAX_FALLBACK_ATTEMPTS = 4;

      /* eslint-disable no-constant-condition */
      while (true) {
        attempt++;
        try {
          console.log('[createConnectAccount] calling Stripe accounts.create', {
            uid,
            country,
            email: tokenEmail,
            attempt,
            individualKeys: Object.keys(currentIndividual),
          });
          account = await stripeClient.accounts.create(buildAccountPayload(currentIndividual), {
            // L'idempotencyKey doit changer entre attempts car le payload diffère.
            idempotencyKey: `account_${uid}_v${attempt}`,
          });
          console.log('[createConnectAccount] Stripe account created', { uid, accountId: account.id, attempt });
          break;
        } catch (innerErr) {
          const e = innerErr as { param?: string; code?: string; message?: string; raw?: { message?: string; param?: string; code?: string } };
          const param = e.param ?? e.raw?.param;
          const code = e.code ?? e.raw?.code;
          const message = e.raw?.message ?? e.message ?? '';

          // Si Stripe pointe un champ pré-rempli (ex: individual[phone]), on l'enlève
          // et on retry — le chauffeur saisira la bonne valeur dans le formulaire Stripe.
          const { ind: stripped, removed } = stripParamFromIndividual(param, currentIndividual);
          if (removed && attempt < MAX_FALLBACK_ATTEMPTS) {
            console.warn('[createConnectAccount] Stripe rejected prefill field — retrying without it', {
              uid,
              attempt,
              removedField: removed,
              stripeCode: code,
              stripeMessage: message,
            });
            currentIndividual = stripped;
            continue;
          }
          throw innerErr;
        }
      }
      /* eslint-enable no-constant-condition */
    } catch (err) {
      const stripeErr = err as {
        type?: string;
        code?: string;
        statusCode?: number;
        requestId?: string;
        param?: string;
        message?: string;
        raw?: { message?: string; code?: string; param?: string };
      };
      const stripeMessage = stripeErr.raw?.message || stripeErr.message || 'Erreur Stripe inconnue';
      console.error('[createConnectAccount] Stripe accounts.create failed', {
        uid,
        country,
        email: tokenEmail,
        type: stripeErr.type,
        code: stripeErr.code ?? stripeErr.raw?.code,
        statusCode: stripeErr.statusCode,
        param: stripeErr.param ?? stripeErr.raw?.param,
        requestId: stripeErr.requestId,
        message: stripeMessage,
        durationMs: Date.now() - t0,
      });
      throw new HttpsError('internal', `Stripe: ${stripeMessage}`);
    }

    try {
      await driverRef.update({
        stripeAccountId: account.id,
        stripeAccountStatus: 'pending',
        weeklyPayoutEnabled: false,
        lastPayoutAt: null,
        pendingBalanceCents: 0,
      });
    } catch (firestoreErr) {
      const fe = firestoreErr as { code?: string; message?: string };
      try { await stripeClient.accounts.del(account.id); } catch (delErr) {
        console.error('[createConnectAccount] rollback delete failed', { uid, accountId: account.id, err: (delErr as Error).message });
      }
      console.error('[createConnectAccount] Firestore update failed, account rolled back', {
        uid,
        accountId: account.id,
        code: fe.code,
        message: fe.message,
      });
      throw new HttpsError('internal', 'Erreur lors de l\'enregistrement du compte.');
    }

    console.log('[createConnectAccount] success', { uid, accountId: account.id, durationMs: Date.now() - t0 });
    return { accountId: account.id, status: 'pending' };
  },
);

// =============================================================================
// createConnectOnboardLink — Callable (mobile + web)
// Génère le lien d'onboarding KYC Stripe. Remplace POST /api/stripe/connect/onboard.
// =============================================================================

interface CreateConnectOnboardLinkInput {
  returnUrl: string;
  refreshUrl: string;
}

interface CreateConnectOnboardLinkResult {
  url: string;
}

export const createConnectOnboardLink = onCall(
  {
    region: 'europe-west1',
    secrets: [stripeSecretKey],
  },
  async (request: CallableRequest<CreateConnectOnboardLinkInput>): Promise<CreateConnectOnboardLinkResult> => {
    const t0 = Date.now();
    if (!request.auth) {
      console.warn('[createConnectOnboardLink] unauthenticated call');
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    const uid = request.auth.uid;

    const { returnUrl, refreshUrl } = request.data || ({} as CreateConnectOnboardLinkInput);
    console.log('[createConnectOnboardLink] start', { uid, returnUrl, refreshUrl });

    const isHttpUrl = (u: string) => {
      try {
        const parsed = new URL(u);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
      } catch { return false; }
    };
    if (!returnUrl || !isHttpUrl(returnUrl) || !refreshUrl || !isHttpUrl(refreshUrl)) {
      console.warn('[createConnectOnboardLink] invalid URLs', { uid, returnUrl, refreshUrl });
      throw new HttpsError('invalid-argument', 'returnUrl/refreshUrl invalides.');
    }

    await enforceRateLimit({
      identifier: uid,
      bucket: 'stripe:createConnectOnboardLink',
      limit: 10,
      windowSec: 60,
    });

    const snap = await getDb().collection('drivers').doc(uid).get();
    const accountId = snap.data()?.stripeAccountId as string | undefined;
    if (!accountId) {
      console.warn('[createConnectOnboardLink] missing stripeAccountId', { uid });
      throw new HttpsError('failed-precondition', 'Aucun compte Stripe Connect. Créez-en un d\'abord.');
    }

    try {
      console.log('[createConnectOnboardLink] calling Stripe accountLinks.create', { uid, accountId });
      const accountLink = await getStripe().accountLinks.create({
        account: accountId,
        return_url: returnUrl,
        refresh_url: refreshUrl,
        type: 'account_onboarding',
      });
      console.log('[createConnectOnboardLink] success', { uid, accountId, durationMs: Date.now() - t0 });
      return { url: accountLink.url };
    } catch (err) {
      const stripeErr = err as {
        type?: string;
        code?: string;
        statusCode?: number;
        requestId?: string;
        param?: string;
        message?: string;
        raw?: { message?: string; code?: string; param?: string };
      };
      const stripeMessage = stripeErr.raw?.message || stripeErr.message || 'Erreur Stripe inconnue';
      console.error('[createConnectOnboardLink] Stripe accountLinks.create failed', {
        uid,
        accountId,
        type: stripeErr.type,
        code: stripeErr.code ?? stripeErr.raw?.code,
        statusCode: stripeErr.statusCode,
        param: stripeErr.param ?? stripeErr.raw?.param,
        requestId: stripeErr.requestId,
        message: stripeMessage,
        durationMs: Date.now() - t0,
      });
      throw new HttpsError('internal', `Stripe: ${stripeMessage}`);
    }
  },
);

// =============================================================================
// getStripeAccountStatus — Callable
// Lit l'état Stripe Connect du chauffeur (live depuis Stripe + sync Firestore).
// Utilisé par /driver/payments/setup pour décider quoi afficher après que le
// chauffeur revient du formulaire d'onboarding (ou ferme le navigateur).
// =============================================================================

interface GetStripeAccountStatusResult {
  accountId: string | null;
  status: 'not_created' | 'pending' | 'active' | 'restricted' | 'disabled';
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string | null;
  requirements: {
    currently_due: string[];
    past_due: string[];
    eventually_due: string[];
    pending_verification: string[];
    current_deadline: number | null;
  };
}

export const getStripeAccountStatus = onCall(
  {
    region: 'europe-west1',
    secrets: [stripeSecretKey],
  },
  async (request: CallableRequest<unknown>): Promise<GetStripeAccountStatusResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    const uid = request.auth.uid;

    await enforceRateLimit({
      identifier: uid,
      bucket: 'stripe:getStripeAccountStatus',
      limit: 30,
      windowSec: 60,
    });

    const driverSnap = await getDb().collection('drivers').doc(uid).get();
    if (!driverSnap.exists) {
      throw new HttpsError('permission-denied', 'Réservé aux chauffeurs.');
    }
    const accountId = driverSnap.data()?.stripeAccountId as string | undefined;
    if (!accountId) {
      console.log('[getStripeAccountStatus] no account', { uid });
      return {
        accountId: null,
        status: 'not_created',
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        disabledReason: null,
        requirements: {
          currently_due: [],
          past_due: [],
          eventually_due: [],
          pending_verification: [],
          current_deadline: null,
        },
      };
    }

    try {
      // Sync DB côté serveur — source de vérité Stripe
      await syncDriverAccountStatus(uid, accountId);
      const fresh = await getDb().collection('drivers').doc(uid).get();
      const d = fresh.data() ?? {};
      const req = (d.requirements ?? {}) as Record<string, unknown>;

      console.log('[getStripeAccountStatus] returning', {
        uid,
        accountId,
        status: d.stripeAccountStatus,
        chargesEnabled: d.stripeChargesEnabled,
        payoutsEnabled: d.stripePayoutsEnabled,
      });

      return {
        accountId,
        status: (d.stripeAccountStatus as GetStripeAccountStatusResult['status']) ?? 'pending',
        chargesEnabled: !!d.stripeChargesEnabled,
        payoutsEnabled: !!d.stripePayoutsEnabled,
        detailsSubmitted: !!d.stripeDetailsSubmitted,
        disabledReason: (d.stripeDisabledReason as string | null) ?? null,
        requirements: {
          currently_due: Array.isArray(req.currently_due) ? (req.currently_due as string[]) : [],
          past_due: Array.isArray(req.past_due) ? (req.past_due as string[]) : [],
          eventually_due: Array.isArray(req.eventually_due) ? (req.eventually_due as string[]) : [],
          pending_verification: Array.isArray(req.pending_verification) ? (req.pending_verification as string[]) : [],
          current_deadline: (req.current_deadline as number | null) ?? null,
        },
      };
    } catch (err) {
      const e = err as { type?: string; code?: string; message?: string };
      console.error('[getStripeAccountStatus] sync failed', {
        uid,
        accountId,
        type: e.type,
        code: e.code,
        message: e.message,
      });
      throw new HttpsError('internal', `Stripe: ${e.message ?? 'Erreur de récupération du statut.'}`);
    }
  },
);
