import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { z } from 'zod';
import { enforceRateLimit } from '../utils/rateLimiter.js';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

let _stripe: InstanceType<typeof Stripe> | null = null;
function getStripe(): InstanceType<typeof Stripe> {
  if (!_stripe) {
    _stripe = new Stripe(stripeSecretKey.value(), { apiVersion: '2026-03-25.dahlia' });
  }
  return _stripe;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

const CURRENCY = 'cad';

const ZERO_DECIMAL = ['bif', 'clp', 'gnf', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'];
function fromStripeAmount(cents: number, cur: string): number {
  return ZERO_DECIMAL.includes(cur.toLowerCase()) ? cents : cents / 100;
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

const InputSchema = z.object({
  action: z.enum(['manual_payout', 'weekly_all', 'toggle_weekly']),
  driverId: z.string().min(1).optional(),
  weeklyPayoutEnabled: z.boolean().optional(),
});

interface TransferResult {
  transferId: string;
  driverId: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'failed';
  error?: string;
}

async function getUserRole(uid: string): Promise<'admin' | 'driver' | 'user'> {
  const db = getDb();
  const adminSnap = await db.collection('admins').doc(uid).get();
  if (adminSnap.exists) return 'admin';
  const userSnap = await db.collection('users').doc(uid).get();
  const userType = userSnap.exists ? (userSnap.data()?.userType as string | undefined) : undefined;
  if (userType === 'admin') return 'admin';
  if (userType === 'chauffeur') return 'driver';
  const driverSnap = await db.collection('drivers').doc(uid).get();
  if (driverSnap.exists) return 'driver';
  return 'user';
}

async function triggerManualPayout(driverId: string, currency: string): Promise<TransferResult> {
  const db = getDb();
  const driverRef = db.collection('drivers').doc(driverId);
  const lockExpiration = Date.now() + 120000;

  let lockedBalance = 0;
  let stripeAccountId = '';

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(driverRef);
    const data = snap.data();
    if (!data) throw new Error('Chauffeur non trouvé');
    if (!data.stripeAccountId) throw new Error('Aucun compte Stripe Connect associé');
    if (data.stripeAccountStatus !== 'active') throw new Error("Le compte Stripe du chauffeur n'est pas encore actif");
    if (!data.pendingBalanceCents || data.pendingBalanceCents <= 0) throw new Error('Aucun solde en attente de virement');
    if (data.payoutLockUntil && data.payoutLockUntil > Date.now()) throw new Error('Un virement est déjà en cours pour ce chauffeur');
    lockedBalance = data.pendingBalanceCents;
    stripeAccountId = data.stripeAccountId;
    tx.update(driverRef, { payoutLockUntil: lockExpiration });
  });

  const processedAt = new Date();
  let transfer: Awaited<ReturnType<InstanceType<typeof Stripe>['transfers']['create']>> | undefined;

  try {
    transfer = await getStripe().transfers.create({
      amount: lockedBalance,
      currency: currency.toLowerCase(),
      destination: stripeAccountId,
      description: `Virement manuel chauffeur ${driverId} — ${processedAt.toISOString().split('T')[0]}`,
      metadata: { driverId, type: 'manual', platform: 'medjira_taxi' },
    }, { idempotencyKey: `manual_${driverId}_${lockedBalance}_${processedAt.getTime()}` });

    await db.runTransaction(async (tx) => {
      const payoutRef = db.collection('driver_payouts').doc();
      const freshSnap = await tx.get(driverRef);
      const currentPending = freshSnap.data()?.pendingBalanceCents ?? 0;
      tx.update(driverRef, {
        pendingBalanceCents: Math.max(0, currentPending - lockedBalance),
        lastPayoutAt: processedAt,
        payoutLockUntil: null,
      });
      tx.set(payoutRef, {
        driverId,
        stripeTransferId: transfer!.id,
        amountCents: lockedBalance,
        amount: fromStripeAmount(lockedBalance, currency),
        currency: currency.toLowerCase(),
        type: 'manual',
        status: 'succeeded',
        processedAt,
      });
    });
  } catch (err) {
    console.error(`[stripeConnectPayout] triggerManualPayout error for ${driverId}:`, err);
    try { await driverRef.update({ payoutLockUntil: null }); } catch {}
    throw err;
  }

  return {
    transferId: transfer.id,
    driverId,
    amount: fromStripeAmount(lockedBalance, currency),
    currency,
    status: 'succeeded',
  };
}

async function processWeeklyPayouts(currency: string): Promise<{
  processedAt: Date;
  totalDrivers: number;
  successCount: number;
  failedCount: number;
  totalAmountTransferred: number;
  currency: string;
  transfers: TransferResult[];
}> {
  const results: TransferResult[] = [];
  const processedAt = new Date();
  const lockExpiration = Date.now() + 300000;
  let totalDriversScanned = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let iterations = 0;
  const db = getDb();

  do {
    iterations++;
    if (iterations > 50) break;
    let q: FirebaseFirestore.Query = db
      .collection('drivers')
      .where('weeklyPayoutEnabled', '==', true)
      .where('stripeAccountStatus', '==', 'active')
      .where('pendingBalanceCents', '>', 0)
      .orderBy('pendingBalanceCents')
      .limit(100);

    if (lastDoc) q = q.startAfter(lastDoc);

    const snapshot = await q.get();
    if (snapshot.empty) break;
    totalDriversScanned += snapshot.size;

    for (const doc of snapshot.docs) {
      const driverId = doc.id;
      const data = doc.data();
      const { stripeAccountId, pendingBalanceCents, payoutLockUntil } = data;

      if (!stripeAccountId || pendingBalanceCents <= 0) continue;
      if (payoutLockUntil && payoutLockUntil > Date.now()) continue;

      let lockedBalance = 0;
      let transferId: string | undefined;

      try {
        const driverRef = db.collection('drivers').doc(driverId);
        const locked = await db.runTransaction(async (tx) => {
          const snap = await tx.get(driverRef);
          if (!snap.exists) throw new Error('Chauffeur introuvable');
          const d = snap.data()!;
          if (d.payoutLockUntil && d.payoutLockUntil > Date.now()) return false;
          if ((d.pendingBalanceCents ?? 0) <= 0) return false;
          lockedBalance = d.pendingBalanceCents;
          tx.update(driverRef, { payoutLockUntil: lockExpiration });
          return true;
        });

        if (!locked) continue;

        const transfer = await getStripe().transfers.create({
          amount: lockedBalance,
          currency: currency.toLowerCase(),
          destination: stripeAccountId,
          description: `Paiement hebdomadaire chauffeur ${driverId} — ${processedAt.toISOString().split('T')[0]}`,
          metadata: { driverId, week: getISOWeek(processedAt), platform: 'medjira_taxi' },
        }, { idempotencyKey: `payout_${driverId}_${getISOWeek(processedAt)}` });

        transferId = transfer.id;

        await db.runTransaction(async (tx) => {
          const payoutRef = db.collection('driver_payouts').doc();
          const freshSnap = await tx.get(driverRef);
          const currentPending = freshSnap.data()?.pendingBalanceCents ?? 0;
          tx.update(driverRef, {
            pendingBalanceCents: Math.max(0, currentPending - lockedBalance),
            lastPayoutAt: processedAt,
            payoutLockUntil: null,
          });
          tx.set(payoutRef, {
            driverId,
            stripeTransferId: transfer.id,
            amountCents: lockedBalance,
            amount: fromStripeAmount(lockedBalance, currency),
            currency: currency.toLowerCase(),
            status: 'succeeded',
            processedAt,
            week: getISOWeek(processedAt),
          });
        });

        results.push({
          transferId: transfer.id,
          driverId,
          amount: fromStripeAmount(lockedBalance, currency),
          currency,
          status: 'succeeded',
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[stripeConnectPayout] weekly payout error for ${driverId}:`, errorMsg);
        try { await db.collection('drivers').doc(driverId).update({ payoutLockUntil: null }); } catch {}

        await db.collection('driver_payouts').add({
          driverId,
          amountCents: pendingBalanceCents,
          amount: fromStripeAmount(pendingBalanceCents, currency),
          currency: currency.toLowerCase(),
          status: 'failed',
          error: errorMsg,
          stripeTransferId: transferId ?? null,
          processedAt,
          week: getISOWeek(processedAt),
        });

        results.push({
          transferId: transferId ?? '',
          driverId,
          amount: fromStripeAmount(pendingBalanceCents, currency),
          currency,
          status: 'failed',
          error: errorMsg,
        });
      }
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  } while (lastDoc !== undefined);

  const succeeded = results.filter(r => r.status === 'succeeded');
  const totalAmountTransferred = succeeded.reduce((sum, r) => sum + r.amount, 0);

  return {
    processedAt,
    totalDrivers: totalDriversScanned,
    successCount: succeeded.length,
    failedCount: results.length - succeeded.length,
    totalAmountTransferred,
    currency,
    transfers: results,
  };
}

export const stripeConnectPayout = onCall(
  { region: 'europe-west1', secrets: [stripeSecretKey] },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Vous devez être connecté.');

    const uid = request.auth.uid;

    await enforceRateLimit({
      identifier: uid,
      bucket: 'stripe:stripeConnectPayout',
      limit: 10,
      windowSec: 60,
    });

    const parsed = InputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    }
    const { action, driverId: bodyDriverId, weeklyPayoutEnabled } = parsed.data;

    try {
      const role = await getUserRole(uid);

      if (action === 'manual_payout') {
        if (role !== 'driver' && role !== 'admin') {
          throw new HttpsError('permission-denied', 'Accès réservé aux chauffeurs et administrateurs');
        }
        const targetDriverId = role === 'admin' ? (bodyDriverId ?? uid) : uid;
        if (role === 'driver' && bodyDriverId && bodyDriverId !== uid) {
          throw new HttpsError('permission-denied', "Un chauffeur ne peut pas déclencher le virement d'un autre chauffeur");
        }
        const result = await triggerManualPayout(targetDriverId, CURRENCY);
        return result;
      }

      if (action === 'weekly_all') {
        if (role !== 'admin') {
          throw new HttpsError('permission-denied', 'Accès réservé aux administrateurs');
        }
        const summary = await processWeeklyPayouts(CURRENCY);
        return summary;
      }

      if (action === 'toggle_weekly') {
        if (role !== 'driver' && role !== 'admin') {
          throw new HttpsError('permission-denied', 'Réservé aux chauffeurs et administrateurs');
        }
        if (typeof weeklyPayoutEnabled !== 'boolean') {
          throw new HttpsError('invalid-argument', 'weeklyPayoutEnabled doit être un booléen');
        }
        await getDb().collection('drivers').doc(uid).update({ weeklyPayoutEnabled });
        return {
          success: true,
          weeklyPayoutEnabled,
          message: weeklyPayoutEnabled
            ? 'Virements hebdomadaires automatiques activés. Vous recevrez votre part chaque lundi.'
            : "Virements hebdomadaires désactivés. Vos gains s'accumulent jusqu'au prochain virement manuel.",
        };
      }

      throw new HttpsError('invalid-argument', 'Action invalide');
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const message = err instanceof Error ? err.message : '';
      console.error('[stripeConnectPayout]', message);
      if (message.includes('non trouvé')) throw new HttpsError('not-found', 'Ressource non trouvée');
      throw new HttpsError('internal', 'Une erreur est survenue. Veuillez réessayer.');
    }
  },
);
