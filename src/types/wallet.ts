/**
 * Types liés au portefeuille et aux transactions
 * 
 * @module types/wallet
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Type de transaction
 */
export type TransactionType = 'deposit' | 'withdrawal' | 'payment' | 'refund';

/**
 * Statut d'une transaction
 */
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

/**
 * Méthode de paiement (Canada uniquement — Stripe carte bancaire)
 */
export type WalletPaymentMethod = 'visa' | 'mastercard' | 'stripe_card';

/**
 * Interface pour une transaction de portefeuille
 */
export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  netAmount?: number;
  fees?: number;
  currency: string;
  method?: WalletPaymentMethod;
  status: TransactionStatus;
  description?: string;
  reference?: string;
  bookingId?: string;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

/**
 * Interface pour un portefeuille utilisateur
 */
export interface Wallet {
  userId: string;
  balance: number;
  currency: string;
  updatedAt: Date | Timestamp;
}

/**
 * Demande de rechargement (Stripe uniquement au Canada)
 */
export interface RechargeRequest {
  amount: number;
  method: WalletPaymentMethod;
}

/**
 * Historique de transactions (pour pagination)
 */
export interface TransactionHistory {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
}
