/**
 * Service Stripe Connect — Comptes chauffeurs & virements
 *
 * Architecture :
 *   - La plateforme collecte 100% du paiement passager via un PaymentIntent standard
 *   - À la fin de chaque semaine, la plateforme effectue un Transfer vers le
 *     compte Connect du chauffeur pour sa part (70%)
 *   - La commission (30%) reste sur le compte principal de la plateforme
 *
 * Type de compte Connect utilisé :
 *   controller.stripe_dashboard.type: 'none'       → plateforme gère tout
 *   controller.fees.payer: 'application'            → plateforme paie les frais Stripe
 *   controller.losses.payments: 'application'       → plateforme assume les risques
 *   controller.requirement_collection: 'application'→ plateforme collecte le KYC
 *
 * ⚠️  Ce module est SERVEUR uniquement.
 *
 * @module services/stripe-connect.service
 */

import stripe from '@/lib/stripe';
import { adminDb as _adminDb } from '@/config/firebase-admin';

function getAdminDb() {
  if (!_adminDb) throw new Error('Firebase Admin SDK non initialisé');
  return _adminDb;
}
import { toStripeAmount, fromStripeAmount } from './stripe-payment.service';
import type {
  DriverStripeData,
  TransferResult,
  WeeklyPayoutSummary,
} from '@/types/stripe';
import { DRIVER_SHARE_RATE, PLATFORM_COMMISSION_RATE } from '@/types/stripe';

// ============================================================================
// GESTION DES COMPTES CHAUFFEURS
// ============================================================================

/**
 * Crée un compte Stripe Connect pour un chauffeur.
 * Appelé lors de l'inscription ou lors du premier accès aux paramètres de paiement.
 *
 * @param driverId  ID Firebase du chauffeur
 * @param email     Email du chauffeur (pré-remplit le formulaire d'onboarding)
 * @param country   Code pays ISO (ex: 'CA', 'FR') — doit correspondre au marché actif
 */
export async function createDriverConnectAccount(
  driverId: string,
  email: string,
  country: string
): Promise<string> {
  const account = await stripe.accounts.create({
    type: 'custom',
    country: country.toUpperCase(),
    email,
    controller: {
      stripe_dashboard: { type: 'none' },
      fees: { payer: 'application' },
      losses: { payments: 'application' },
      requirement_collection: 'application',
    },
    capabilities: {
      transfers: { requested: true },
    },
    metadata: {
      driverId,
      platform: 'medhira_taxi',
    },
  });

  // Persister l'ID du compte dans Firestore
  await getAdminDb().collection('drivers').doc(driverId).update({
    stripeAccountId: account.id,
    stripeAccountStatus: 'pending',
    weeklyPayoutEnabled: false,
    lastPayoutAt: null,
    pendingBalanceCents: 0,
  });

  return account.id;
}

/**
 * Génère un lien d'onboarding Stripe pour la vérification KYC du chauffeur.
 * Ce lien redirige vers un formulaire Stripe sécurisé pour collecter les
 * informations bancaires et d'identité.
 *
 * @param accountId  ID du compte Stripe Connect du chauffeur
 * @param returnUrl  URL de retour après l'onboarding (succès ou abandon)
 * @param refreshUrl URL appelée si le lien expire
 */
export async function createOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: 'account_onboarding',
  });

  return accountLink.url;
}

/**
 * Récupère et met à jour le statut du compte Connect d'un chauffeur dans Firestore.
 * Persiste également les exigences KYC (currently_due, current_deadline).
 */
export async function syncDriverAccountStatus(
  driverId: string,
  accountId: string
): Promise<DriverStripeData['stripeAccountStatus']> {
  const account = await stripe.accounts.retrieve(accountId);

  let status: DriverStripeData['stripeAccountStatus'];

  if (!account || ('deleted' in account && account.deleted)) {
    status = 'disabled';
  } else if (account.charges_enabled && account.payouts_enabled) {
    status = 'active';
  } else if (account.requirements?.disabled_reason) {
    status = 'restricted';
  } else {
    status = 'pending';
  }

  const updateData: {
    stripeAccountStatus: DriverStripeData['stripeAccountStatus'];
    requirements?: DriverStripeData['requirements'];
  } = {
    stripeAccountStatus: status,
  };

  if (account.requirements) {
    const requirements: DriverStripeData['requirements'] = {
      currently_due: account.requirements.currently_due ?? [],
      current_deadline: account.requirements.current_deadline ?? null,
      lastCheckedAt: new Date(),
    };
    updateData.requirements = requirements;
  }

  await getAdminDb().collection('drivers').doc(driverId).update(updateData);

  return status;
}

// ============================================================================
// ACCUMULATION DES GAINS
// ============================================================================

/**
 * Ajoute les gains d'une course au solde en attente du chauffeur.
 * Appelé lorsqu'une course est complétée et le paiement capturé.
 *
 * @param driverId      ID Firebase du chauffeur
 * @param rideAmount    Montant total de la course (en unité locale, ex: 15.00 CAD)
 * @param currency      Devise ISO (ex: 'cad')
 */
export async function accumulateDriverEarnings(
  driverId: string,
  rideAmount: number,
  currency: string
): Promise<void> {
  const driverShareCents = Math.round(
    toStripeAmount(rideAmount, currency) * DRIVER_SHARE_RATE
  );

  const driverRef = getAdminDb().collection('drivers').doc(driverId);

  await getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(driverRef);
    const current = snap.data()?.pendingBalanceCents ?? 0;
    tx.update(driverRef, {
      pendingBalanceCents: current + driverShareCents,
      currency: currency.toLowerCase(),
    });
  });
}

// ============================================================================
// VIREMENTS HEBDOMADAIRES
// ============================================================================

/**
 * Effectue les virements hebdomadaires vers tous les chauffeurs ayant :
 *   1. Un compte Stripe Connect actif
 *   2. Le virement automatique hebdomadaire activé (weeklyPayoutEnabled = true)
 *   3. Un solde en attente > 0
 *
 * Cette fonction est conçue pour être appelée par un job CRON (ex: Cloud Function)
 * tous les lundis à 8h00.
 *
 * Protection contre la concurrence : utilise payoutLockUntil pour éviter les
 * traitements simultanés du même chauffeur.
 *
 * @param currency  Devise du virement (doit correspondre à la devise des gains)
 */
export async function processWeeklyPayouts(
  currency: string
): Promise<WeeklyPayoutSummary> {
  const results: TransferResult[] = [];
  const processedAt = new Date();
  const lockExpiration = Date.now() + 300000;

  const snapshot = await getAdminDb()
    .collection('drivers')
    .where('weeklyPayoutEnabled', '==', true)
    .where('stripeAccountStatus', '==', 'active')
    .where('pendingBalanceCents', '>', 0)
    .limit(50)
    .get();

  for (const doc of snapshot.docs) {
    const driverId = doc.id;
    const data = doc.data();
    const { stripeAccountId, pendingBalanceCents, payoutLockUntil } = data;

    if (!stripeAccountId || pendingBalanceCents <= 0) continue;

    if (payoutLockUntil && payoutLockUntil > Date.now()) {
      console.log(`processWeeklyPayouts: chauffeur ${driverId} déjà verrouillé, skip`);
      continue;
    }

    try {
      const db = getAdminDb();
      const driverRef = db.collection('drivers').doc(driverId);

      // Étape 1 : acquérir le verrou atomiquement, lire le solde
      let lockedBalance = 0;
      const locked = await db.runTransaction(async (tx) => {
        const snap = await tx.get(driverRef);
        if (!snap.exists) throw new Error('Chauffeur introuvable');

        const d = snap.data()!;
        if (d.payoutLockUntil && d.payoutLockUntil > Date.now()) {
          console.log(`processWeeklyPayouts: chauffeur ${driverId} verrouillé, skip`);
          return false;
        }
        if ((d.pendingBalanceCents ?? 0) <= 0) {
          console.log(`processWeeklyPayouts: solde à 0 pour ${driverId}, skip`);
          return false;
        }

        lockedBalance = d.pendingBalanceCents;
        tx.update(driverRef, { payoutLockUntil: lockExpiration });
        return true;
      });

      if (!locked) continue;

      // Étape 2 : appel Stripe hors transaction (pas de retry Firestore possible ici)
      const transfer = await stripe.transfers.create({
        amount: lockedBalance,
        currency: currency.toLowerCase(),
        destination: stripeAccountId,
        description: `Paiement hebdomadaire chauffeur ${driverId} — ${processedAt.toISOString().split('T')[0]}`,
        metadata: {
          driverId,
          week: getISOWeek(processedAt),
          platform: 'medhira_taxi',
        },
      });

      // Étape 3 : libérer le verrou + zéroter le solde + persister
      await db.runTransaction(async (tx) => {
        const payoutRef = db.collection('driver_payouts').doc();
        tx.update(driverRef, {
          pendingBalanceCents: 0,
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
      // Extraire l'ID du transfer Stripe si disponible (pour réconciliation manuelle)
      const stripeTransferId = (err as Record<string, unknown>)?.transferId as string | undefined;
      if (stripeTransferId) {
        console.error(
          `processWeeklyPayouts: transfer Stripe ${stripeTransferId} créé mais transaction Firestore échouée pour ${driverId} — réconciliation manuelle requise`,
          errorMsg
        );
      } else {
        console.error(`processWeeklyPayouts: erreur pour chauffeur ${driverId}:`, errorMsg);
      }

      // Libérer le lock pour ne pas bloquer ce chauffeur pendant 5 min inutilement
      try {
        await getAdminDb().collection('drivers').doc(driverId).update({ payoutLockUntil: null });
      } catch (unlockErr) {
        console.error(`processWeeklyPayouts: impossible de libérer le lock pour ${driverId}:`, unlockErr);
      }

      await getAdminDb().collection('driver_payouts').add({
        driverId,
        amountCents: pendingBalanceCents,
        amount: fromStripeAmount(pendingBalanceCents, currency),
        currency: currency.toLowerCase(),
        status: 'failed',
        error: errorMsg,
        stripeTransferId: stripeTransferId ?? null,
        processedAt,
        week: getISOWeek(processedAt),
      });

      results.push({
        transferId: stripeTransferId ?? '',
        driverId,
        amount: fromStripeAmount(pendingBalanceCents, currency),
        currency,
        status: 'failed',
        error: errorMsg,
      });
    }
  }

  const succeeded = results.filter(r => r.status === 'succeeded');
  const totalAmountTransferred = succeeded.reduce((sum, r) => sum + r.amount, 0);

  return {
    processedAt,
    totalDrivers: snapshot.size,
    successCount: succeeded.length,
    failedCount: results.length - succeeded.length,
    totalAmountTransferred,
    currency,
    transfers: results,
  };
}

/**
 * Active ou désactive les virements hebdomadaires automatiques pour un chauffeur.
 * Reproduit exactement le comportement Uber : le chauffeur choisit lui-même.
 *
 * @param driverId  ID Firebase du chauffeur
 * @param enabled   true = virements automatiques hebdomadaires actifs
 */
export async function setDriverWeeklyPayoutPreference(
  driverId: string,
  enabled: boolean
): Promise<void> {
  await getAdminDb().collection('drivers').doc(driverId).update({
    weeklyPayoutEnabled: enabled,
  });
}

/**
 * Déclenche un virement manuel immédiat pour un chauffeur spécifique.
 * Disponible que `weeklyPayoutEnabled` soit true ou false.
 *
 * @param driverId  ID Firebase du chauffeur
 * @param currency  Devise du virement
 */
export async function triggerManualPayout(
  driverId: string,
  currency: string
): Promise<TransferResult> {
  const db = getAdminDb();
  const driverRef = db.collection('drivers').doc(driverId);
  const lockExpiration = Date.now() + 120000; // 2 min

  // Étape 1 : valider + acquérir le verrou atomiquement
  let lockedBalance = 0;
  let stripeAccountId = '';

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(driverRef);
    const data = snap.data();

    if (!data) throw new Error('Chauffeur non trouvé');
    if (!data.stripeAccountId) throw new Error('Aucun compte Stripe Connect associé');
    if (data.stripeAccountStatus !== 'active') {
      throw new Error("Le compte Stripe du chauffeur n'est pas encore actif");
    }
    if (!data.pendingBalanceCents || data.pendingBalanceCents <= 0) {
      throw new Error('Aucun solde en attente de virement');
    }
    if (data.payoutLockUntil && data.payoutLockUntil > Date.now()) {
      throw new Error('Un virement est déjà en cours pour ce chauffeur');
    }

    lockedBalance = data.pendingBalanceCents;
    stripeAccountId = data.stripeAccountId;
    tx.update(driverRef, { payoutLockUntil: lockExpiration });
  });

  // Étape 2 : appel Stripe hors transaction
  const processedAt = new Date();
  let transfer: Awaited<ReturnType<typeof stripe.transfers.create>> | undefined;

  try {
    transfer = await stripe.transfers.create({
      amount: lockedBalance,
      currency: currency.toLowerCase(),
      destination: stripeAccountId,
      description: `Virement manuel chauffeur ${driverId} — ${processedAt.toISOString().split('T')[0]}`,
      metadata: {
        driverId,
        type: 'manual',
        platform: 'medhira_taxi',
      },
    });

    // Étape 3 : libérer le verrou + zéroter le solde + persister
    await db.runTransaction(async (tx) => {
      const payoutRef = db.collection('driver_payouts').doc();
      tx.update(driverRef, {
        pendingBalanceCents: 0,
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
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (transfer) {
      console.error(
        `triggerManualPayout: transfer Stripe ${transfer.id} créé mais transaction Firestore échouée pour ${driverId} — réconciliation manuelle requise`,
        errorMsg
      );
    } else {
      console.error(`triggerManualPayout: erreur Stripe pour chauffeur ${driverId}:`, errorMsg);
    }
    // Libérer le lock pour ne pas bloquer ce chauffeur
    try {
      await driverRef.update({ payoutLockUntil: null });
    } catch (unlockErr) {
      console.error(`triggerManualPayout: impossible de libérer le lock pour ${driverId}:`, unlockErr);
    }
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

// ============================================================================
// HELPERS PRIVÉS
// ============================================================================

/** Retourne la semaine ISO (format YYYY-WXX) pour une date donnée */
function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export { DRIVER_SHARE_RATE, PLATFORM_COMMISSION_RATE };
