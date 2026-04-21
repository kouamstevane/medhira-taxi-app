/**
 * Service de Gestion du Portefeuille (côté client)
 *
 * ⚠️ Les MUTATIONS ont été déplacées vers des API routes serveur protégées
 * par `verifyFirebaseToken` + Firebase Admin SDK. Ce module ne fait plus
 * QUE :
 *   - des appels `fetch('/api/wallet/...')` pour toute mutation
 *   - des LECTURES Firestore directes (les rules sont read-only pour le client)
 *
 * Rationale : les rules Firestore ne peuvent pas empêcher un attaquant
 * connecté de faire `runTransaction(db, tx => tx.update(walletRef, { balance: 999999 }))`
 * depuis la console du navigateur si l'écriture passe uniquement par le SDK
 * client. Seule une API serveur (admin SDK) peut valider la logique métier
 * et garantir l'intégrité du solde.
 *
 * Les signatures publiques sont conservées pour éviter un refactor invasif
 * des consommateurs (taxi.service.ts, food-delivery.service.ts, pages wallet, etc.).
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
import { db, auth } from '@/config/firebase';
import {
  Wallet,
  Transaction,
  TransactionType,
  TransactionStatus,
} from '@/types';
import { CURRENCY_CODE, LIMITS } from '@/utils/constants';

// ============================================================================
// Helpers internes — fetch authentifié
// ============================================================================

async function getAuthToken(): Promise<string> {
  const current = auth.currentUser;
  if (!current) {
    throw new Error('Utilisateur non authentifié');
  }
  return current.getIdToken();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Erreur serveur (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error as string;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  // Tolère les réponses vides
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

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
  // Lecture directe d'abord (évite un aller-retour réseau si le wallet existe)
  const walletRef = doc(db, 'wallets', userId);
  const walletSnap = await getDoc(walletRef);
  if (walletSnap.exists()) {
    return walletSnap.data() as Wallet;
  }

  // Sinon, création côté serveur
  const ensured = await postJson<{ balance: number; currency: string }>(
    '/api/wallet/ensure',
    {}
  );

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
// Transactions — mutations (via API routes serveur)
// ============================================================================

/**
 * Crée une transaction en statut "pending".
 * Délègue à POST /api/wallet/create-transaction.
 */
export const createTransaction = async (
  transactionData: Omit<Transaction, 'id' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const { transactionId } = await postJson<{ transactionId: string }>(
    '/api/wallet/create-transaction',
    {
      type: transactionData.type,
      amount: transactionData.amount,
      currency: transactionData.currency,
      description: transactionData.description,
      reference: transactionData.reference,
      bookingId: transactionData.bookingId,
      method: transactionData.method,
      fees: transactionData.fees,
      netAmount: transactionData.netAmount,
    }
  );
  return transactionId;
};

/**
 * Finalise une transaction et crédite le wallet de `amount`.
 * Idempotent côté serveur : si la transaction est déjà "completed",
 * aucun double crédit n'est émis.
 */
export const completeTransaction = async (
  transactionId: string,
  _userId: string,
  amount: number
): Promise<void> => {
  await postJson('/api/wallet/complete-transaction', {
    transactionId,
    amount,
  });
};

/**
 * Paie une course / commande avec le wallet.
 * Le débit est atomique côté serveur (check solde + débit + création tx).
 */
export const payBooking = async (
  _userId: string,
  bookingId: string,
  amount: number
): Promise<string> => {
  const { transactionId } = await postJson<{ transactionId: string }>(
    '/api/wallet/pay-booking',
    { bookingId, amount }
  );
  return transactionId;
};

/**
 * Marque une transaction comme échouée.
 */
export const failTransaction = async (
  transactionId: string,
  reason: string
): Promise<void> => {
  await postJson('/api/wallet/fail-transaction', { transactionId, reason });
};

/**
 * Rembourse une transaction existante.
 */
export const refundTransaction = async (
  originalTransactionId: string,
  _userId: string
): Promise<string> => {
  const { refundId } = await postJson<{ refundId: string }>(
    '/api/wallet/refund-transaction',
    { originalTransactionId }
  );
  return refundId;
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
