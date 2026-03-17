/**
 * Helpers Firebase
 * 
 * Fonctions utilitaires pour simplifier les interactions avec Firebase
 * 
 * @module lib/firebase-helpers
 */

import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { UserData, Booking, Transaction, Wallet } from '@/types';
import { DEFAULT_PRICING, CURRENCY_CODE, PEAK_HOURS } from '@/utils/constants';

/**
 * Crée ou met à jour un document utilisateur dans Firestore
 * 
 * @param userId - ID de l'utilisateur
 * @param data - Données à enregistrer
 * @returns Promise résolue quand l'opération est terminée
 */
export const createOrUpdateUser = async (
  userId: string,
  data: Partial<UserData>
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    await updateDoc(userRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(userRef, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
};

/**
 * Récupère les données d'un utilisateur depuis Firestore
 * 
 * @param userId - ID de l'utilisateur
 * @returns Données de l'utilisateur ou null
 */
export const getUserData = async (userId: string): Promise<UserData | null> => {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    return userSnap.data() as UserData;
  }

  return null;
};

/**
 * Vérifie si l'heure actuelle est une heure de pointe
 * 
 * @returns true si c'est une heure de pointe
 */
export const isPeakHour = (): boolean => {
  const now = new Date();
  const hours = now.getHours();
  return (hours >= PEAK_HOURS.MORNING_START && hours <= PEAK_HOURS.MORNING_END) || (hours >= PEAK_HOURS.EVENING_START && hours <= PEAK_HOURS.EVENING_END);
};

/**
 * Calcule le prix d'une course de taxi
 * 
 * @param distance - Distance en km
 * @param duration - Durée en minutes
 * @param basePrice - Prix de base
 * @param pricePerKm - Prix par km
 * @param pricePerMinute - Prix par minute
 * @returns Prix calculé arrondi à 2 décimales
 */
export const calculateTripPrice = (
  distance: number,
  duration: number,
  basePrice: number,
  pricePerKm: number,
  pricePerMinute: number
): number => {
  let price = basePrice + (distance * pricePerKm) + (duration * pricePerMinute);

  // Appliquer le multiplicateur d'heure de pointe si applicable
  // Utiliser DEFAULT_PRICING.PEAK_HOUR_MULTIPLIER (1.25) pour la cohérence
  if (isPeakHour()) {
    price *= DEFAULT_PRICING.PEAK_HOUR_MULTIPLIER;
  }

  // Arrondir à 2 décimales (centimes)
  return Math.round(price * 100) / 100;
};

/**
 * Convertit un Timestamp Firestore en Date JavaScript
 * 
 * @param timestamp - Timestamp Firestore
 * @returns Date JavaScript
 */
export const timestampToDate = (timestamp: Timestamp | Date | undefined): Date => {
  if (!timestamp) {
    return new Date();
  }

  if (timestamp instanceof Date) {
    return timestamp;
  }

  if ('toDate' in timestamp && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }

  return new Date();
};

/**
 * Récupère ou crée un portefeuille pour un utilisateur
 * 
 * @param userId - ID de l'utilisateur
 * @returns Données du portefeuille
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
    updatedAt: serverTimestamp() as any,
  };

  await setDoc(walletRef, newWallet);
  return newWallet;
};
