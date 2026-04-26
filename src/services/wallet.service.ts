/**
 * Service de Gestion du Portefeuille (côté client)
 *
 * Les mutations passent par des Cloud Functions (httpsCallable) :
 *   - walletEnsure, walletPayBooking, walletFailTransaction, walletRefundTransaction
 * Les lectures restent côté client via Firestore (rules read-only).
 *
 * @module services/wallet
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  startAfter,
} from 'firebase/firestore';
import type { DocumentSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '@/config/firebase';
import {
  Wallet,
  Transaction,
  TransactionType,
  TransactionStatus,
} from '@/types';
import { CURRENCY_CODE, LIMITS } from '@/utils/constants';

// ============================================================================
// Wallet — lecture (client direct, rules read-only)
// ============================================================================

/**
 * Récupère ou crée le portefeuille de l'utilisateur authentifié.
 * La création passe par l'API route (admin SDK) — la lecture peut rester
 * côté client puisque les rules autorisent `read` sur son propre wallet.
 *
 * NOTE: le paramètre `userId` est conservé pour compat, mais l'API serveur
 * ignore ce paramètre et utilise toujours l'uid du token. Passer un uid
 * différent lancera malgré tout l'ensure pour l'utilisateur authentifié.
 */
export const getOrCreateWallet = async (userId: string): Promise<Wallet> => {
  const walletRef = doc(db, 'wallets', userId);
  const walletSnap = await getDoc(walletRef);
  if (walletSnap.exists()) {
    return walletSnap.data() as Wallet;
  }

  const ensureWallet = httpsCallable<unknown, { balance: number; currency: string }>(
    functions, 'walletEnsure'
  );
  const result = await ensureWallet({});
  const ensured = result.data;

  return {
    userId,
    balance: ensured.balance,
    currency: ensured.currency ?? CURRENCY_CODE,
    updatedAt: new Date(),
  };
};

/**
 * Récupère le solde du portefeuille.
 */
export const getWalletBalance = async (userId: string): Promise<number> => {
  const wallet = await getOrCreateWallet(userId);
  return wallet.balance;
};

// ============================================================================
// Transactions — mutations (via Cloud Functions)
// ============================================================================

/**
 * Paie une course / commande avec le wallet.
 * Le débit est atomique côté serveur (check solde + débit + création tx).
 */
export const payBooking = async (
  _userId: string,
  bookingId: string,
): Promise<string> => {
  const callable = httpsCallable<{ bookingId: string }, { transactionId: string }>(
    functions, 'walletPayBooking'
  );
  const result = await callable({ bookingId });
  return result.data.transactionId;
};

/**
 * Marque une transaction comme échouée.
 */
export const failTransaction = async (
  transactionId: string,
  reason: string
): Promise<void> => {
  const callable = httpsCallable<{ transactionId: string; reason: string }, unknown>(
    functions, 'walletFailTransaction'
  );
  await callable({ transactionId, reason });
};

/**
 * Rembourse une transaction existante.
 */
export const refundTransaction = async (
  originalTransactionId: string,
  _userId: string
): Promise<string> => {
  const callable = httpsCallable<{ originalTransactionId: string }, { refundId: string }>(
    functions, 'walletRefundTransaction'
  );
  const result = await callable({ originalTransactionId });
  return result.data.refundId;
};

// ============================================================================
// Transactions — lecture (client direct)
// ============================================================================

export const getTransactionHistory = (
  userId: string,
  limit: number = LIMITS.MAX_TRANSACTION_HISTORY
): Promise<Transaction[]> =>
  getTransactionHistoryPaginated(userId, { pageSize: limit }).then(r => r.transactions);

export type TransactionPageCursor = DocumentSnapshot;

export interface PaginatedTransactionResult {
  transactions: Transaction[];
  lastDocSnapshot: TransactionPageCursor | null;
  hasMore: boolean;
}

export const getTransactionHistoryPaginated = async (
  userId: string,
  options?: {
    pageSize?: number;
    type?: string;
    cursor?: TransactionPageCursor | null;
  }
): Promise<PaginatedTransactionResult> => {
  const pageSize = options?.pageSize ?? 20;

  const constraints = [
    where('userId', '==', userId),
    ...(options?.type ? [where('type', '==', options.type)] : []),
    orderBy('createdAt', 'desc'),
    firestoreLimit(pageSize),
    ...(options?.cursor ? [startAfter(options.cursor)] : []),
  ];

  const q = query(collection(db, 'transactions'), ...constraints);
  const snap = await getDocs(q);

  const transactions = snap.docs.map(d => d.data() as Transaction);
  const lastDocSnapshot = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
  const hasMore = snap.docs.length === pageSize;

  return { transactions, lastDocSnapshot, hasMore };
};

export const getTransactionById = async (
  transactionId: string
): Promise<Transaction | null> => {
  const transactionRef = doc(db, 'transactions', transactionId);
  const transactionSnap = await getDoc(transactionRef);

  if (transactionSnap.exists()) {
    return transactionSnap.data() as Transaction;
  }

  return null;
};

// Re-exports de types pour compat
export type { Transaction, TransactionType, TransactionStatus };
