/**
 * Constantes de l'application
 * 
 * Valeurs constantes utilisées dans toute l'application
 * 
 * @module utils/constants
 */

import { Country } from '@/types';

/**
 * Configuration de la devise
 *
 * VARIABLE GLOBALE POUR LA DEVISE
 * Modifiez cette constante pour changer la devise dans toute l'application
 * Exemples: 'FCFA', 'CAD', 'EUR', 'USD', 'XAF', etc.
 * 
 * VALIDATION: Les codes de devise sont validés au runtime pour éviter les fautes de frappe
 */
const VALID_CURRENCY_CODES = ['FCFA', 'CAD', 'EUR', 'USD', 'XAF'] as const;
type CurrencyCode = typeof VALID_CURRENCY_CODES[number];

const CURRENCY_CODE_RAW: CurrencyCode = 'CAD';

// Validation au runtime avec assertion TypeScript
if (!VALID_CURRENCY_CODES.includes(CURRENCY_CODE_RAW as any)) {
  throw new Error(`Invalid currency code: ${CURRENCY_CODE_RAW}. Must be one of: ${VALID_CURRENCY_CODES.join(', ')}`);
}

export const CURRENCY_CODE = CURRENCY_CODE_RAW;

/**
 * Liste des pays supportés par l'application
 */
export const SUPPORTED_COUNTRIES: Country[] = [
  { 
    code: 'CA', 
    dialCode: '+1', 
    name: 'Canada', 
    flag: '🇨🇦', 
    defaultNumber: '5550123456',
    phoneLength: 10
  },
  { 
    code: 'FR', 
    dialCode: '+33', 
    name: 'France', 
    flag: '🇫🇷', 
    defaultNumber: '612345678',
    phoneLength: 10
  },
  { 
    code: 'BE', 
    dialCode: '+32', 
    name: 'Belgique', 
    flag: '🇧🇪', 
    defaultNumber: '470123456',
    phoneLength: 9
  },
  { 
    code: 'CM', 
    dialCode: '+237', 
    name: 'Cameroun', 
    flag: '🇨🇲', 
    defaultNumber: '655744484',
    phoneLength: 9
  },
];

// Validation de synchronisation: s'assurer que tous les pays ont une phoneLength définie
const countriesWithoutPhoneLength = SUPPORTED_COUNTRIES.filter(c => !c.phoneLength);
if (countriesWithoutPhoneLength.length > 0) {
  console.error(
    `Erreur de configuration: Les pays suivants n'ont pas de phoneLength définie: ${countriesWithoutPhoneLength.map(c => c.code).join(', ')}`
  );
}

/**
 * Configuration de tarification par défaut (en FCFA)
 *
 * TARIFICATION POUR LE MARCHÉ CAMEROUNAIS
 * La devise principale est définie par CURRENCY_CODE (actuellement 'FCFA')
 *
 * Tarifs actuels FCFA (Cameroun):
 * - Prix de base: 1000 FCFA
 * - Prix par km: 500 FCFA
 * - Prix par minute: 50 FCFA
 *
 * Ces tarifs sont compétitifs pour le marché VTC camerounais et prennent en compte:
 * 1. Pouvoir d'achat local
 * 2. Coûts opérationnels des conducteurs (carburant, entretien)
 * 3. Compétitivité face aux alternatives (taxis traditionnels, autres VTC)
 * 
 * @remarks Pour modifier la devise, changer CURRENCY_CODE dans ce fichier.
 * Les tarifs seront automatiquement affichés avec la nouvelle devise.
 * 
 * @see CURRENCY_CODE pour la devise actuelle
 */
export const DEFAULT_PRICING = {
  BASE_PRICE: 3.5,
  PRICE_PER_KM: 1.75,
  PRICE_PER_MINUTE: 0.45,
  PEAK_HOUR_MULTIPLIER: 1.25,
  TRAFFIC_MULTIPLIER: 1.15,
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

export const LIMITS = {
  MAX_TRANSACTION_HISTORY: 50,
  // Limites adaptées pour le marché camerounais
  // MIN: 1000 FCFA (environ 1-2 courses minimum)
  // MAX: 100000 FCFA (environ 65-130 courses maximum)
  MIN_WALLET_RECHARGE: 1000,
  MAX_WALLET_RECHARGE: 100000,
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

/**
 * Mapping des codes de devise vers les codes ISO 4217
 * Extrait de format.ts pour optimisation et réutilisation
 */
export const CURRENCY_MAP: Record<string, string> = {
  'FCFA': 'XAF',  // Franc CFA d'Afrique Centrale
  'CAD': 'CAD',   // Dollar canadien
  'EUR': 'EUR',   // Euro
  'USD': 'USD',   // Dollar américain
  'XAF': 'XAF',   // Franc CFA d'Afrique Centrale
};

/**
 * Mapping des devises vers les locales appropriées
 * Extrait de format.ts pour optimisation et réutilisation
 */
export const CURRENCY_LOCALE_MAP: Record<string, string> = {
  'XAF': 'fr-FR',   // Afrique centrale
  'CAD': 'fr-CA',   // Canada
  'EUR': 'fr-FR',   // Europe
  'USD': 'en-US',   // États-Unis
};
