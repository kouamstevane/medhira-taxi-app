/**
 * Wallet — Cloud Functions onCall
 *
 * Re-exports des 5 fonctions migrées depuis les anciennes routes Next.js
 * (`src/app/api/wallet/*`). Voir chaque fichier pour les détails.
 *
 * @module walletApi
 */

export { walletGetBalance } from './walletGetBalance.js';
export { walletEnsure } from './walletEnsure.js';
export { walletFailTransaction } from './walletFailTransaction.js';
export { walletPayBooking } from './walletPayBooking.js';
export { walletRefundTransaction } from './walletRefundTransaction.js';
