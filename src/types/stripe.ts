/**
 * Types Stripe pour l'application Medhira Taxi
 *
 * Couvre :
 * - PaymentIntents (paiements passager)
 * - Stripe Connect (comptes chauffeurs + virements)
 * - Webhooks
 *
 * @module types/stripe
 */

// ============================================================================
// DEVISES SUPPORTÉES PAR STRIPE PAR MARCHÉ
// ============================================================================

/**
 * Correspondance marché → devise ISO Stripe.
 * XAF (FCFA Cameroun) n'est pas supporté par Stripe — les paiements
 * mobiles (Orange Money, MTN Money) sont gérés séparément.
 */
export const STRIPE_CURRENCY_BY_MARKET: Record<string, string | null> = {
  CM: null,   // XAF — non supporté par Stripe → utiliser mobile money
  CA: 'cad',  // Dollar canadien
  FR: 'eur',  // Euro
  BE: 'eur',  // Euro
};

// ============================================================================
// PAYMENT INTENTS
// ============================================================================

/** But d'un PaymentIntent */
export type PaymentIntentPurpose = 'taxi_ride' | 'wallet_recharge';

/** Metadata attachée à chaque PaymentIntent */
export interface PaymentIntentMetadata {
  purpose: PaymentIntentPurpose;
  userId: string;
  /** ID de la course (pour taxi_ride uniquement) */
  bookingId?: string;
  /** Montant en devise locale affiché à l'utilisateur */
  displayAmount?: string;
  /** Marché actif au moment du paiement */
  market?: string;
}

/** Réponse de l'API lors de la création d'un PaymentIntent */
export interface CreatePaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

/** Corps de la requête pour créer un PaymentIntent de course */
export interface CreateRidePaymentIntentRequest {
  bookingId: string;
  amount: number;
  currency: string;
  userId: string;
}

/** Corps de la requête pour capturer / annuler */
export interface UpdatePaymentIntentRequest {
  paymentIntentId: string;
  action: 'capture' | 'cancel';
  /** Montant à capturer (optionnel, capture totale par défaut) */
  captureAmount?: number;
}

// ============================================================================
// STRIPE CONNECT (COMPTES CHAUFFEURS)
// ============================================================================

/** Statut d'un compte Connect chauffeur */
export type ConnectAccountStatus =
  | 'not_created'    // Aucun compte Connect
  | 'pending'        // Créé, en attente de vérification KYC
  | 'active'         // Vérifié, peut recevoir des virements
  | 'restricted'     // Restrictions imposées par Stripe
  | 'disabled';      // Compte désactivé

/** Exigences KYC Stripe persistées pour le chauffeur */
export interface DriverRequirements {
  /** Liste des exigences actuellement en attente */
  currently_due: string[];
  /** Date limite pour fournir les documents (timestamp UTC) */
  current_deadline: number | null;
  /** Dernière mise à jour des exigences */
  lastCheckedAt: Date;
}

/** Exigences KYC Stripe persistées pour le chauffeur */
export interface DriverRequirements {
  /** Liste des exigences actuellement en attente */
  currently_due: string[];
  /** Date limite pour fournir les documents (timestamp UTC) */
  current_deadline: number | null;
  /** Dernière mise à jour des exigences */
  lastCheckedAt: Date;
}

/** Données persistées dans Firestore pour un chauffeur */
export interface DriverStripeData {
  stripeAccountId: string | null;
  stripeAccountStatus: ConnectAccountStatus;
  /** Chauffeur a activé les virements hebdomadaires automatiques */
  weeklyPayoutEnabled: boolean;
  /** Date du dernier virement reçu */
  lastPayoutAt: Date | null;
  /** Solde cumulé en attente de virement (en centimes) */
  pendingBalanceCents: number;
  currency: string;
  /** Exigences KYC Stripe */
  requirements?: DriverRequirements;
  /** Timestamp du dernier verrou de traitement (pour éviter doubles traitements) */
  payoutLockUntil?: number | null;
}

/** Réponse de l'API lors de la création d'un compte Connect */
export interface CreateConnectAccountResponse {
  accountId: string;
  onboardingUrl: string;
}

/** Réponse de l'API pour un lien d'onboarding */
export interface OnboardingLinkResponse {
  url: string;
  expiresAt: number;
}

// ============================================================================
// VIREMENTS (TRANSFERS)
// ============================================================================

/** Commission de la plateforme (30%) */
export const PLATFORM_COMMISSION_RATE = 0.30;

/** Part du chauffeur (70%) */
export const DRIVER_SHARE_RATE = 0.70;

/** Résultat d'un virement */
export interface TransferResult {
  transferId: string;
  driverId: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'failed';
  error?: string;
}

/** Résumé du processus de paiement hebdomadaire */
export interface WeeklyPayoutSummary {
  processedAt: Date;
  totalDrivers: number;
  successCount: number;
  failedCount: number;
  totalAmountTransferred: number;
  currency: string;
  transfers: TransferResult[];
}

// ============================================================================
// STATUTS DE PAIEMENT
// ============================================================================

/**
 * Statuts de paiement normalisés — à utiliser partout dans l'application.
 * Source unique de vérité pour éviter les incohérences entre services.
 */
export const PAYMENT_STATUS = {
  PENDING:      'pending',       // Aucun paiement initié
  AUTHORIZED:   'authorized',    // PaymentIntent créé, autorisation confirmée
  CAPTURED:     'captured',      // Paiement Stripe capturé (course terminée)
  CANCELLED:    'cancelled',     // Autorisation annulée (course annulée)
  FAILED:       'failed',        // Échec de capture ou de débit
  WALLET_PAID:  'wallet_paid',   // Payé via portefeuille interne
} as const;

export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];

/** Méthode de paiement choisie par le passager */
export type PaymentMethod = 'card' | 'wallet';

// ============================================================================
// WEBHOOKS
// ============================================================================

/** Événements Stripe traités par l'application */
export type HandledStripeEvent =
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed'
  | 'payment_intent.canceled'
  | 'payment_intent.amount_capturable_updated'
  | 'payment_intent.requires_action'
  | 'account.updated'
  | 'transfer.created'
  | 'charge.refunded'
  | 'payout.paid'
  | 'payout.failed';
