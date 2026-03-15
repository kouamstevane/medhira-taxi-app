/**
 * Utilitaires de formatage
 *
 * Fonctions pour formater les nombres, dates, prix, etc.
 *
 * @module utils/format
 */

import { CURRENCY_CODE, CURRENCY_MAP, CURRENCY_LOCALE_MAP } from './constants';

/**
 * Formate un montant avec le code de devise global
 *
 * FONCTION PRINCIPALE pour les affichages financiers et transactions
 * Utilise le code de devise (ex: "FCFA") plutôt qu'un symbole pour plus de clarté
 *
 * @param amount - Montant à formater (doit être >= 0, sinon sera clampé à 0)
 * @returns Montant formaté avec code de devise (ex: "1 500 000 FCFA")
 *
 * @example
 * formatCurrencyWithCode(1500000) // "1 500 000 FCFA"
 * formatCurrencyWithCode(NaN) // "0 FCFA"
 * formatCurrencyWithCode(-100) // "0 FCFA" (clampé pour sécurité)
 */
export const formatCurrencyWithCode = (amount: number): string => {
  // Validation: NaN et montants négatifs sont clampés à 0
  // Les montants négatifs dans une app VTC indiquent généralement une erreur ou fraude potentielle
  const validAmount = typeof amount === 'number' && !isNaN(amount) && amount >= 0 ? amount : 0;
  return `${validAmount.toLocaleString('fr-FR')} ${CURRENCY_CODE}`;
};

/**
 * Formate un montant en devise locale avec symbole
 *
 * FONCTION SECONDAIRE pour les interfaces utilisateur compactes
 * Utilise le symbole de devise (ex: "$", "€") plutôt que le code
 * @param amount - Montant à formater
 * @returns Montant formaté avec symbole ou code de devise
 *
 * @see formatCurrencyWithCode pour les affichages financiers principaux
 */
export const formatCurrency = (amount: number): string => {
  const currency = CURRENCY_MAP[CURRENCY_CODE] || 'CAD';
  const locale = CURRENCY_LOCALE_MAP[currency] || 'fr-FR';
  
  // Pour FCFA, utiliser le code de devise au lieu du symbole (pas de symbole standard)
  const currencyDisplay = (CURRENCY_CODE as string) === 'FCFA' || (CURRENCY_CODE as string) === 'XAF' ? 'code' : 'symbol';
  
  return amount.toLocaleString(locale, {
    style: 'currency',
    currency: currency,
    currencyDisplay: currencyDisplay
  });
};

/**
 * Formate un numéro de téléphone
 * 
 * @param phone - Numéro à formater
 * @returns Numéro formaté
 * 
 * @example
 * formatPhoneNumber("+15550123456") // "+1 (555) 012-3456"
 */
export const formatPhoneNumber = (phone: string): string => {
  // Supprimer tout ce qui n'est pas chiffre ou +
  const clean = phone.replace(/[^\d+]/g, '');
  
  // Format Canada (+1)
  if (clean.startsWith('+1') && clean.length === 12) {
    return clean.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '$1 ($2) $3-$4');
  }
  
  // Format Cameroun (+237)
  if (clean.startsWith('+237')) {
    return clean.replace(/(\+237)(\d)(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5 $6');
  }
  
  return phone;
};

/**
 * Formate une distance en km
 * 
 * @param distance - Distance en kilomètres
 * @param decimals - Nombre de décimales (par défaut 1)
 * @returns Distance formatée
 * 
 * @example
 * formatDistance(5.678) // "5.7 km"
 */
export const formatDistance = (distance: number, decimals: number = 1): string => {
  return `${distance.toFixed(decimals)} km`;
};

/**
 * Formate une durée en minutes
 * 
 * @param minutes - Durée en minutes
 * @returns Durée formatée
 * 
 * @example
 * formatDuration(45) // "45 min"
 * formatDuration(90) // "1h 30min"
 */
export const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
};

/**
 * Formate une date en format français
 * 
 * @param date - Date à formater
 * @returns Date formatée
 * 
 * @example
 * formatDate(new Date()) // "4 novembre 2025"
 */
export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('fr-CA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
};

/**
 * Formate une date avec l'heure
 * 
 * @param date - Date à formater
 * @returns Date et heure formatées
 * 
 * @example
 * formatDateTime(new Date()) // "4 novembre 2025 à 13:45"
 */
export const formatDateTime = (date: Date): string => {
  return new Intl.DateTimeFormat('fr-CA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};
