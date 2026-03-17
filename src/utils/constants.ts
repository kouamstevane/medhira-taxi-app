/**
 * Constantes de l'application
 *
 * ============================================================
 * MIGRATION MULTI-MARCHE — GUIDE RAPIDE
 * ============================================================
 * Pour migrer l'application vers un autre pays, modifiez
 * UNIQUEMENT cette ligne :
 *
 *   export const ACTIVE_MARKET: MarketCode = 'CM';
 *
 * Marches disponibles :
 *   'CM' -> Cameroun  (FCFA, fr-FR, +237)
 *   'CA' -> Canada    (CAD,  fr-CA, +1)
 *   'FR' -> France    (EUR,  fr-FR, +33)
 *   'BE' -> Belgique  (EUR,  fr-BE, +32)
 *
 * TOUTES les constantes exportees (devise, locale, tarifs,
 * seuils, frais...) sont automatiquement derivees de ce seul
 * parametre — aucune autre modification n'est necessaire.
 * ============================================================
 *
 * @module utils/constants
 */

import { Country } from '@/types';

// ============================================================================
// SEUL ENDROIT A MODIFIER POUR CHANGER DE MARCHE
// ============================================================================

/** Codes de marche supportes par l'application */
export type MarketCode = 'CM' | 'CA' | 'FR' | 'BE';

/**
 * MARCHE ACTIF
 *
 * Changez cette valeur pour migrer l'application vers un autre pays.
 * Toutes les constantes (devise, locale, tarifs, seuils...) s'adaptent
 * automatiquement — aucune autre modification n'est necessaire.
 *
 * @example
 * // Migrer vers le Canada :
 * export const ACTIVE_MARKET: MarketCode = 'CA';
 */
export const ACTIVE_MARKET: MarketCode = 'CM';

// ============================================================================
// INTERFACES DE CONFIGURATION
// ============================================================================

interface MarketPricing {
  /** Prix de base par course */
  BASE_PRICE: number;
  /** Prix par kilometre */
  PRICE_PER_KM: number;
  /** Prix par minute */
  PRICE_PER_MINUTE: number;
  /** Multiplicateur heure de pointe */
  PEAK_HOUR_MULTIPLIER: number;
  /** Multiplicateur trafic dense */
  TRAFFIC_MULTIPLIER: number;
  /** Taux de remise standard */
  DISCOUNT_RATE: number;
  /** Taux de penalite d'annulation (proportion du tarif de base) */
  CANCELLATION_PENALTY_RATE: number;
}

interface MarketLimits {
  /** Montant minimum de recharge du portefeuille */
  MIN_WALLET_RECHARGE: number;
  /** Montant maximum de recharge du portefeuille */
  MAX_WALLET_RECHARGE: number;
  /** Seuil de solde faible (declenche le badge "Recharger") */
  LOW_BALANCE_THRESHOLD: number;
  /** Penalite minimum d'annulation */
  MIN_CANCELLATION_PENALTY: number;
}

interface MarketWalletFees {
  /** Taux de frais de traitement (ex: 0.01 = 1%) */
  RECHARGE_RATE: number;
  /** Frais minimum par recharge */
  MIN_FEE: number;
}

interface MarketRestaurantDefaults {
  /** Prix moyen par personne (pour la creation de restaurant) */
  AVG_PRICE_PER_PERSON: number;
  /** Taux de commission en pourcentage */
  COMMISSION_RATE: number;
  /** Heure d'ouverture par defaut */
  OPENING_TIME: string;
  /** Heure de fermeture par defaut */
  CLOSING_TIME: string;
}

interface MarketFoodDeliveryPricing {
  /** Tarif de livraison par kilometre */
  RATE_PER_KM: number;
  /** Supplement weekend (montant fixe) */
  WEEKEND_SURCHARGE: number;
}

interface MarketWalletUI {
  /**
   * Montants predéfinis affichés dans la page de recharge du portefeuille.
   * Adapter aux conventions monetaires locales (FCFA : multiples de 1000,
   * CAD/EUR : petits montants entiers).
   */
  presetAmounts: number[];
}

interface MarketConfig {
  /** Nom lisible du marche */
  name: string;
  /** Code pays ISO 3166-1 alpha-2 */
  countryCode: string;
  /** Code de devise affiche dans l'UI (ex: 'FCFA', 'CAD', 'EUR') */
  currencyCode: string;
  /**
   * Locale BCP-47 pour le formatage des nombres et dates.
   * Utiliser une locale universellement supportee (ex: 'fr-FR' plutot que 'fr-CM').
   */
  locale: string;
  /** Code pays par defaut pour l'enregistrement des chauffeurs */
  driverCountryCode: string;
  /** Tarification taxi */
  pricing: MarketPricing;
  /** Limites operationnelles dependantes du marche */
  limits: MarketLimits;
  /** Frais de rechargement du portefeuille */
  walletFees: MarketWalletFees;
  /** Valeurs par defaut pour la creation de restaurants */
  restaurantDefaults: MarketRestaurantDefaults;
  /** Tarification livraison de repas */
  foodDeliveryPricing: MarketFoodDeliveryPricing;
  /** Options UI specifiques au marche (montants predéfinis, etc.) */
  walletUI: MarketWalletUI;
}

// ============================================================================
// CONFIGURATIONS PAR MARCHE
// ============================================================================

const MARKET_CONFIGS: Record<MarketCode, MarketConfig> = {

  // --------------------------------------------------------------------------
  // CAMEROUN
  // Devise : FCFA (Franc CFA d'Afrique Centrale — ISO 4217 : XAF)
  // Tarifs VTC adaptes au pouvoir d'achat local
  // --------------------------------------------------------------------------
  CM: {
    name: 'Cameroun',
    countryCode: 'CM',
    currencyCode: 'FCFA',
    locale: 'fr-FR',          // fr-FR : fallback universel, meme formatage que fr-CM
    driverCountryCode: 'CM',
    pricing: {
      BASE_PRICE: 1000,       // 1 000 FCFA (~1,50 USD)
      PRICE_PER_KM: 500,      // 500 FCFA/km (~0,75 USD)
      PRICE_PER_MINUTE: 50,   // 50 FCFA/min (~0,075 USD)
      PEAK_HOUR_MULTIPLIER: 1.25,
      TRAFFIC_MULTIPLIER: 1.15,
      DISCOUNT_RATE: 0.10,
      CANCELLATION_PENALTY_RATE: 0.50,
    },
    limits: {
      MIN_WALLET_RECHARGE: 1000,      // 1 000 FCFA minimum
      MAX_WALLET_RECHARGE: 500000,    // 500 000 FCFA maximum
      LOW_BALANCE_THRESHOLD: 500,     // Alerte si solde < 500 FCFA
      MIN_CANCELLATION_PENALTY: 500,  // Penalite minimum 500 FCFA
    },
    walletFees: {
      RECHARGE_RATE: 0.01,  // 1% de frais de traitement
      MIN_FEE: 100,         // Frais minimum 100 FCFA
    },
    restaurantDefaults: {
      AVG_PRICE_PER_PERSON: 1500,  // ~1 500 FCFA par personne
      COMMISSION_RATE: 10,         // 10%
      OPENING_TIME: '08:00',
      CLOSING_TIME: '22:00',
    },
    foodDeliveryPricing: {
      RATE_PER_KM: 150,         // 150 FCFA/km
      WEEKEND_SURCHARGE: 200,   // +200 FCFA le weekend
    },
    walletUI: {
      presetAmounts: [1000, 5000, 10000, 20000, 50000],
    },
  },

  // --------------------------------------------------------------------------
  // CANADA
  // Devise : CAD (Dollar canadien)
  // --------------------------------------------------------------------------
  CA: {
    name: 'Canada',
    countryCode: 'CA',
    currencyCode: 'CAD',
    locale: 'fr-CA',
    driverCountryCode: 'CA',
    pricing: {
      BASE_PRICE: 3.50,
      PRICE_PER_KM: 1.75,
      PRICE_PER_MINUTE: 0.45,
      PEAK_HOUR_MULTIPLIER: 1.25,
      TRAFFIC_MULTIPLIER: 1.15,
      DISCOUNT_RATE: 0.10,
      CANCELLATION_PENALTY_RATE: 0.50,
    },
    limits: {
      MIN_WALLET_RECHARGE: 5,
      MAX_WALLET_RECHARGE: 1000,
      LOW_BALANCE_THRESHOLD: 5,
      MIN_CANCELLATION_PENALTY: 2,
    },
    walletFees: {
      RECHARGE_RATE: 0.015,  // 1,5% de frais
      MIN_FEE: 1,            // Frais minimum 1 CAD
    },
    restaurantDefaults: {
      AVG_PRICE_PER_PERSON: 20,
      COMMISSION_RATE: 15,
      OPENING_TIME: '08:00',
      CLOSING_TIME: '22:00',
    },
    foodDeliveryPricing: {
      RATE_PER_KM: 1.50,
      WEEKEND_SURCHARGE: 1.50,
    },
    walletUI: {
      presetAmounts: [5, 10, 20, 50, 100],
    },
  },

  // --------------------------------------------------------------------------
  // FRANCE
  // Devise : EUR (Euro)
  // --------------------------------------------------------------------------
  FR: {
    name: 'France',
    countryCode: 'FR',
    currencyCode: 'EUR',
    locale: 'fr-FR',
    driverCountryCode: 'FR',
    pricing: {
      BASE_PRICE: 2.50,
      PRICE_PER_KM: 1.10,
      PRICE_PER_MINUTE: 0.30,
      PEAK_HOUR_MULTIPLIER: 1.25,
      TRAFFIC_MULTIPLIER: 1.15,
      DISCOUNT_RATE: 0.10,
      CANCELLATION_PENALTY_RATE: 0.50,
    },
    limits: {
      MIN_WALLET_RECHARGE: 5,
      MAX_WALLET_RECHARGE: 500,
      LOW_BALANCE_THRESHOLD: 5,
      MIN_CANCELLATION_PENALTY: 2,
    },
    walletFees: {
      RECHARGE_RATE: 0.015,
      MIN_FEE: 1,
    },
    restaurantDefaults: {
      AVG_PRICE_PER_PERSON: 15,
      COMMISSION_RATE: 15,
      OPENING_TIME: '08:00',
      CLOSING_TIME: '22:00',
    },
    foodDeliveryPricing: {
      RATE_PER_KM: 1.20,
      WEEKEND_SURCHARGE: 1.00,
    },
    walletUI: {
      presetAmounts: [5, 10, 20, 50, 100],
    },
  },

  // --------------------------------------------------------------------------
  // BELGIQUE
  // Devise : EUR (Euro)
  // --------------------------------------------------------------------------
  BE: {
    name: 'Belgique',
    countryCode: 'BE',
    currencyCode: 'EUR',
    locale: 'fr-BE',
    driverCountryCode: 'BE',
    pricing: {
      BASE_PRICE: 2.50,
      PRICE_PER_KM: 1.15,
      PRICE_PER_MINUTE: 0.32,
      PEAK_HOUR_MULTIPLIER: 1.25,
      TRAFFIC_MULTIPLIER: 1.15,
      DISCOUNT_RATE: 0.10,
      CANCELLATION_PENALTY_RATE: 0.50,
    },
    limits: {
      MIN_WALLET_RECHARGE: 5,
      MAX_WALLET_RECHARGE: 500,
      LOW_BALANCE_THRESHOLD: 5,
      MIN_CANCELLATION_PENALTY: 2,
    },
    walletFees: {
      RECHARGE_RATE: 0.015,
      MIN_FEE: 1,
    },
    restaurantDefaults: {
      AVG_PRICE_PER_PERSON: 15,
      COMMISSION_RATE: 15,
      OPENING_TIME: '08:00',
      CLOSING_TIME: '22:00',
    },
    foodDeliveryPricing: {
      RATE_PER_KM: 1.20,
      WEEKEND_SURCHARGE: 1.00,
    },
    walletUI: {
      presetAmounts: [5, 10, 20, 50, 100],
    },
  },
};

// ============================================================================
// CONSTANTES DERIVEES — Toutes calculees depuis ACTIVE_MARKET
// NE PAS MODIFIER ces lignes. Modifier uniquement ACTIVE_MARKET ci-dessus.
// ============================================================================

const _market = MARKET_CONFIGS[ACTIVE_MARKET];

/**
 * Code de devise actif (ex: 'FCFA', 'CAD', 'EUR').
 * Derive automatiquement de ACTIVE_MARKET.
 */
export const CURRENCY_CODE = _market.currencyCode;

/**
 * Locale BCP-47 active pour le formatage des nombres et dates.
 * Derive automatiquement de ACTIVE_MARKET.
 */
export const DEFAULT_LOCALE = _market.locale;

/**
 * Code pays par defaut pour l'enregistrement des chauffeurs.
 * Derive automatiquement de ACTIVE_MARKET.
 */
export const DEFAULT_DRIVER_COUNTRY_CODE = _market.driverCountryCode;

/**
 * Tarification taxi active.
 * Derive automatiquement de ACTIVE_MARKET.
 */
export const DEFAULT_PRICING = _market.pricing;

/**
 * Frais de rechargement du portefeuille actifs.
 * Derives automatiquement de ACTIVE_MARKET.
 */
export const WALLET_FEES = _market.walletFees;

/**
 * Valeurs par defaut pour la creation de restaurants.
 * Derivees automatiquement de ACTIVE_MARKET.
 */
export const RESTAURANT_DEFAULTS = _market.restaurantDefaults;

/**
 * Tarification livraison de repas active.
 * Derivee automatiquement de ACTIVE_MARKET.
 */
export const FOOD_DELIVERY_PRICING = _market.foodDeliveryPricing;

/**
 * Montants predéfinis pour la recharge du portefeuille.
 * Derives automatiquement de ACTIVE_MARKET (adaptes aux conventions monetaires locales).
 */
export const WALLET_PRESET_AMOUNTS = _market.walletUI.presetAmounts;

// ============================================================================
// CONSTANTES FIXES — Independantes du marche
// ============================================================================

/**
 * Liste exhaustive de tous les pays supportes.
 * NE PAS modifier l'ordre ici — l'ordre est calcule dynamiquement
 * dans SUPPORTED_COUNTRIES en fonction de ACTIVE_MARKET.
 */
const _ALL_COUNTRIES: Country[] = [
  {
    code: 'CM',
    dialCode: '+237',
    name: 'Cameroun',
    flag: '\uD83C\uDDE8\uD83C\uDDF2',
    defaultNumber: '655744484',
    phoneLength: 9,
  },
  {
    code: 'CA',
    dialCode: '+1',
    name: 'Canada',
    flag: '\uD83C\uDDE8\uD83C\uDDE6',
    defaultNumber: '5550123456',
    phoneLength: 10,
  },
  {
    code: 'FR',
    dialCode: '+33',
    name: 'France',
    flag: '\uD83C\uDDEB\uD83C\uDDF7',
    defaultNumber: '612345678',
    phoneLength: 10,
  },
  {
    code: 'BE',
    dialCode: '+32',
    name: 'Belgique',
    flag: '\uD83C\uDDE7\uD83C\uDDEA',
    defaultNumber: '470123456',
    phoneLength: 9,
  },
];

/**
 * Liste des pays supportes par l'application.
 * Le pays du marche actif (ACTIVE_MARKET) apparait toujours en premier —
 * ce tri est calcule automatiquement, aucune modification manuelle n'est necessaire.
 */
export const SUPPORTED_COUNTRIES: Country[] = [
  ..._ALL_COUNTRIES.filter(c => c.code === ACTIVE_MARKET),
  ..._ALL_COUNTRIES.filter(c => c.code !== ACTIVE_MARKET),
];

// Validation de synchronisation : tous les pays doivent avoir une phoneLength
const _countriesWithoutPhoneLength = SUPPORTED_COUNTRIES.filter(c => !c.phoneLength);
if (_countriesWithoutPhoneLength.length > 0) {
  console.error(
    `Erreur de configuration: Les pays suivants n'ont pas de phoneLength definie: ${_countriesWithoutPhoneLength.map(c => c.code).join(', ')}`
  );
}

/**
 * Heures de pointe (identiques pour tous les marches).
 */
export const PEAK_HOURS = {
  MORNING_START: 7,
  MORNING_END: 9,
  EVENING_START: 16,
  EVENING_END: 19,
};

/**
 * URLs par defaut de l'application.
 */
export const DEFAULT_URLS = {
  DEFAULT_AVATAR: '/images/default.webp',
  LOGO: '/images/logo.png',
};

/**
 * Limites operationnelles.
 *
 * Les seuils financiers (rechargement, solde faible, penalites)
 * sont derives du marche actif et s'adaptent automatiquement.
 * Les limites techniques (requetes Firestore, timeouts) sont fixes.
 */
export const LIMITS = {
  // -- Limites financieres (dependantes du marche) ---------------------------
  /** Montant minimum de recharge du portefeuille */
  MIN_WALLET_RECHARGE: _market.limits.MIN_WALLET_RECHARGE,
  /** Montant maximum de recharge du portefeuille */
  MAX_WALLET_RECHARGE: _market.limits.MAX_WALLET_RECHARGE,
  /** Seuil de solde faible : affiche le badge "Recharger" */
  LOW_BALANCE_THRESHOLD: _market.limits.LOW_BALANCE_THRESHOLD,
  /** Penalite d'annulation minimum */
  MIN_CANCELLATION_PENALTY: _market.limits.MIN_CANCELLATION_PENALTY,

  // -- Limites techniques (independantes du marche) --------------------------
  /**
   * Nombre maximum d'entrees dans l'historique de transactions.
   * Utiliser pour getTransactionHistory() uniquement.
   */
  MAX_TRANSACTION_HISTORY: 50,
  /**
   * Limite par defaut pour les requetes Firestore generiques
   * (chauffeurs, notifications, commandes, candidats...).
   * Distinct de MAX_TRANSACTION_HISTORY pour permettre un reglage independant.
   */
  DEFAULT_QUERY_LIMIT: 50,
  /** Timeout de recherche de chauffeur en millisecondes */
  DRIVER_SEARCH_TIMEOUT: 60000,
};

/**
 * Messages d'erreur courants.
 */
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Probleme de connexion. Verifiez votre reseau.',
  AUTH_ERROR: "Erreur d'authentification",
  FIREBASE_ERROR: 'Erreur de communication avec le serveur',
  INVALID_PHONE: 'Numero de telephone invalide',
  INVALID_EMAIL: 'Adresse email invalide',
  REQUIRED_FIELDS: 'Veuillez remplir tous les champs obligatoires',
};

/**
 * Mapping des codes de devise internes vers les codes ISO 4217.
 * Utilise par format.ts pour les appels a Intl.NumberFormat.
 */
export const CURRENCY_MAP: Record<string, string> = {
  'FCFA': 'XAF',  // Franc CFA d'Afrique Centrale
  'CAD': 'CAD',   // Dollar canadien
  'EUR': 'EUR',   // Euro
  'USD': 'USD',   // Dollar americain
  'XAF': 'XAF',   // Franc CFA d'Afrique Centrale (alias)
};

/**
 * Mapping des codes ISO 4217 vers les locales BCP-47.
 * Utilise par format.ts pour choisir la locale de formatage monetaire.
 * Coherent avec les locales definies dans MARKET_CONFIGS.
 */
export const CURRENCY_LOCALE_MAP: Record<string, string> = {
  'XAF': 'fr-FR',   // Afrique centrale -> formatage francais universel
  'FCFA': 'fr-FR',  // Alias FCFA -> meme formatage
  'CAD': 'fr-CA',   // Canada
  'EUR': 'fr-FR',   // Europe
  'USD': 'en-US',   // Etats-Unis
};
