/**
 * Service de Gestion du Portefeuille
 * 
 * Gère le portefeuille utilisateur, les transactions,
 * et les opérations de rechargement/paiement.
 * 
 * @module services/wallet
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  Wallet,
  Transaction,
  TransactionType,
  TransactionStatus,
  PaymentMethod,
  RechargeRequest,
} from '@/types';
import { CURRENCY_CODE, LIMITS } from '@/utils/constants';

/**
 * Récupérer ou créer un portefeuille utilisateur
 */
export const getOrCreateWallet = async (userId: string): Promise<Wallet> => {
  const walletRef = doc(db, 'wallets', userId);
  const walletSnap = await getDoc(walletRef);

  if (walletSnap.exists()) {
    return walletSnap.data() as Wallet;
  }

  // Créer un nouveau portefeuille
  const newWallet: Wallet = {
    userId,
    balance: 0,
    currency: CURRENCY_CODE,
    updatedAt: serverTimestamp() as Timestamp,
  };

  await setDoc(walletRef, newWallet);
  return newWallet;
};

/**
 * Récupérer le solde du portefeuille
 */
export const getWalletBalance = async (userId: string): Promise<number> => {
  const wallet = await getOrCreateWallet(userId);
  return wallet.balance;
};

/**
 * Créer une transaction
 */
export const createTransaction = async (
  transactionData: Omit<Transaction, 'id' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const transactionsRef = collection(db, 'transactions');
  const newTransactionRef = doc(transactionsRef);

  const transaction: Transaction = {
    ...transactionData,
    id: newTransactionRef.id,
    status: 'pending',
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  await setDoc(newTransactionRef, transaction);
  return newTransactionRef.id;
};

/**
 * Recharger le portefeuille
 */
export const rechargeWallet = async (
  userId: string,
  request: RechargeRequest
): Promise<string> => {
  const transactionId = await createTransaction({
    userId,
    type: 'deposit',
    amount: request.amount,
    currency: CURRENCY_CODE,
    method: request.method,
    description: `Rechargement via ${request.method}`,
  });

  try {
    // Dans une vraie application, ici on intégrerait l'API de paiement
    await completeTransaction(transactionId, userId, request.amount);
  } catch (error) {
    await failTransaction(transactionId, `Échec rechargement: ${(error as Error).message}`);
    throw error;
  }

  return transactionId;
};

/**
 * Finaliser une transaction et mettre à jour le solde
 */
export const completeTransaction = async (
  transactionId: string,
  userId: string,
  amount: number
): Promise<void> => {
  const transactionRef = doc(db, 'transactions', transactionId);
  const walletRef = doc(db, 'wallets', userId);

  await runTransaction(db, async (transaction) => {
    const walletDoc = await transaction.get(walletRef);
    
    if (!walletDoc.exists()) {
      throw new Error('Portefeuille introuvable');
    }

    const currentBalance = walletDoc.data().balance;
    const newBalance = currentBalance + amount;

    // Mettre à jour le solde
    transaction.update(walletRef, {
      balance: newBalance,
      updatedAt: serverTimestamp(),
    });

    // Marquer la transaction comme complétée
    transaction.update(transactionRef, {
      status: 'completed',
      updatedAt: serverTimestamp(),
    });
  });
};

/**
 * Payer une course avec le portefeuille
 * La vérification du solde est effectuée à l'intérieur de la transaction
 * pour éviter les race conditions (double débit, solde négatif).
 */
export const payBooking = async (
  userId: string,
  bookingId: string,
  amount: number
): Promise<string> => {
  const transactionRef_outer = doc(collection(db, 'transactions'));
  const transactionId = transactionRef_outer.id;
  const walletRef = doc(db, 'wallets', userId);

  // Créer d'abord l'entrée pending
  const transaction: Transaction = {
    id: transactionId,
    userId,
    type: 'payment',
    amount: -amount,
    currency: CURRENCY_CODE,
    description: 'Paiement de course',
    bookingId,
    status: 'pending',
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };
  await setDoc(transactionRef_outer, transaction);

  try {
    // Vérification du solde ET débit dans la même transaction atomique
    await runTransaction(db, async (tx) => {
      const walletDoc = await tx.get(walletRef);
      if (!walletDoc.exists()) throw new Error('Portefeuille introuvable');

      const currentBalance = walletDoc.data().balance;
      if (currentBalance < amount) throw new Error('Solde insuffisant');

      tx.update(walletRef, {
        balance: currentBalance - amount,
        updatedAt: serverTimestamp(),
      });
      tx.update(transactionRef_outer, {
        status: 'completed',
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    await failTransaction(transactionId, (error as Error).message);
    throw error;
  }

  return transactionId;
};

/**
 * Récupérer l'historique des transactions
 */
export const getTransactionHistory = async (
  userId: string,
  limit: number = LIMITS.MAX_TRANSACTION_HISTORY
): Promise<Transaction[]> => {
  const transactionsRef = collection(db, 'transactions');
  const q = query(
    transactionsRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    firestoreLimit(limit)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as Transaction);
};

/**
 * Récupérer une transaction par ID
 */
export const getTransactionById = async (transactionId: string): Promise<Transaction | null> => {
  const transactionRef = doc(db, 'transactions', transactionId);
  const transactionSnap = await getDoc(transactionRef);

  if (transactionSnap.exists()) {
    return transactionSnap.data() as Transaction;
  }

  return null;
};

/**
 * Marquer une transaction comme échouée
 */
export const failTransaction = async (transactionId: string, reason: string): Promise<void> => {
  const transactionRef = doc(db, 'transactions', transactionId);
  
  await updateDoc(transactionRef, {
    status: 'failed',
    description: reason,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Rembourser une transaction
 */
export const refundTransaction = async (
  originalTransactionId: string,
  userId: string
): Promise<string> => {
  const originalTransaction = await getTransactionById(originalTransactionId);
  
  if (!originalTransaction) {
    throw new Error('Transaction originale introuvable');
  }

  // Créer une transaction de remboursement
  const refundTransactionId = await createTransaction({
    userId,
    type: 'refund',
    amount: Math.abs(originalTransaction.amount),
    currency: originalTransaction.currency,
    description: `Remboursement de la transaction ${originalTransactionId}`,
    reference: originalTransactionId,
  });

  // Créditer le portefeuille
  await completeTransaction(refundTransactionId, userId, Math.abs(originalTransaction.amount));

  return refundTransactionId;
};
