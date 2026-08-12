// functions/src/config/stripe.ts

/** Part chauffeur sur chaque course (70 %) */
export const DELIVERY_SHARE_RATE = 0.70;

/** Part chauffeur sur chaque course (70 %) */
export const DRIVER_SHARE_RATE = 0.70;

/** Default restaurant commission when an approved restaurant has no rate yet. */
export const DEFAULT_RESTAURANT_COMMISSION_RATE = 5;

/** Devise par défaut pour les transactions */
export const DEFAULT_CURRENCY = 'cad';

/** Montant minimum pour une recharge de wallet */
export const MIN_WALLET_RECHARGE = 5;

/** Montant maximum pour une recharge de wallet */
export const MAX_WALLET_RECHARGE = 1000;
