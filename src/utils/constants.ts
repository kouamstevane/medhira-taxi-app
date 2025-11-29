/**
 * Constantes de l'application
 * 
 * Valeurs constantes utilisées dans toute l'application
 * 
 * @module utils/constants
 */

import { Country } from '@/types';

/**
 * Liste des pays supportés par l'application
 */
export const SUPPORTED_COUNTRIES: Country[] = [
  { 
    code: 'CM', 
    dialCode: '+237', 
    name: 'Cameroun', 
    flag: '🇨🇲', 
    defaultNumber: '655744484' 
  },
  { 
    code: 'FR', 
    dialCode: '+33', 
    name: 'France', 
    flag: '🇫🇷', 
    defaultNumber: '612345678' 
  },
  { 
    code: 'BE', 
    dialCode: '+32', 
    name: 'Belgique', 
    flag: '🇧🇪', 
    defaultNumber: '470123456' 
  },
  { 
    code: 'CA', 
    dialCode: '+1', 
    name: 'Canada', 
    flag: '🇨🇦', 
    defaultNumber: '5550123456' 
  },
];

/**
 * Configuration de tarification par défaut
 */
export const DEFAULT_PRICING = {
  BASE_PRICE: 1000,
  PRICE_PER_KM: 500,
  PRICE_PER_MINUTE: 50,
  PEAK_HOUR_MULTIPLIER: 1.2,
  TRAFFIC_MULTIPLIER: 1.1,
  DISCOUNT_RATE: 0.1,
};

/**
 * Heures de pointe
 */
export const PEAK_HOURS = {
  MORNING_START: 7,
  MORNING_END: 9,
  EVENING_START: 16,
  EVENING_END: 19,
};

/**
 * URLs par défaut
 */
export const DEFAULT_URLS = {
  DEFAULT_AVATAR: '/images/default.webp',
  LOGO: '/images/logo.png',
};

/**
 * Limites de l'application
 */
export const LIMITS = {
  MAX_TRANSACTION_HISTORY: 50,
  MIN_WALLET_RECHARGE: 1000,
  MAX_WALLET_RECHARGE: 500000,
  DRIVER_SEARCH_TIMEOUT: 60000, // 60 secondes
};

/**
 * Messages d'erreur courants
 */
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Problème de connexion. Vérifiez votre réseau.',
  AUTH_ERROR: 'Erreur d\'authentification',
  FIREBASE_ERROR: 'Erreur de communication avec le serveur',
  INVALID_PHONE: 'Numéro de téléphone invalide',
  INVALID_EMAIL: 'Adresse email invalide',
  REQUIRED_FIELDS: 'Veuillez remplir tous les champs obligatoires',
};
