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
    code: 'CA', 
    dialCode: '+1', 
    name: 'Canada', 
    flag: '🇨🇦', 
    defaultNumber: '5550123456' 
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
    code: 'CM', 
    dialCode: '+237', 
    name: 'Cameroun', 
    flag: '🇨🇲', 
    defaultNumber: '655744484' 
  },
];

/**
 * Configuration de tarification par défaut (en CAD)
 *
 * CORRECTION FCFA→CAD #5: Documentation des taux de conversion historiques
 *
 * Taux de conversion historique: ~285 FCFA/CAD (1 CAD = 285 FCFA)
 *
 * Anciens tarifs FCFA (Cameroun):
 * - Prix de base: 1000 FCFA
 * - Prix par km: 500 FCFA
 * - Prix par minute: 50 FCFA
 *
 * Nouveaux tarifs CAD (Canada):
 * - Prix de base: 3.5 CAD (1000 FCFA / 285 ≈ 3.51)
 * - Prix par km: 1.75 CAD (500 FCFA / 285 ≈ 1.75)
 * - Prix par minute: 0.45 CAD (50 FCFA / 285 ≈ 0.175)
 *
 * ⚠️ NOTE IMPORTANTE SUR LE TARIF PAR MINUTE:
 * Le tarif par minute a été ajusté de 0.175 CAD à 0.45 CAD (multiplicateur 2.57x)
 * pour les raisons suivantes:
 * 
 * 1. Compétitivité marché canadien: Les tarifs VTC canadiens (Uber, Lyft) sont
 *    significativement plus élevés qu'au Cameroun en raison du coût de la vie
 *    et des réglementations locales.
 * 
 * 2. Coûts opérationnels: Les conducteurs canadiens ont des coûts plus élevés
 *    (carburant, assurance, entretien) qui doivent être reflétés dans les tarifs.
 * 
 * 3. Expérience utilisateur: Un tarif de 0.175 CAD/min serait perçu comme
 *    anormalement bas par les utilisateurs canadiens et pourrait créer de la
 *    méfiance sur la qualité du service.
 * 
 * 4. Analyse comparative: Uber au Canada facture environ 0.35-0.65 CAD/min
 *    selon la ville et le moment. Notre tarif de 0.45 CAD/min se positionne
 *    dans la moyenne basse du marché pour rester compétitif.
 * 
 * @remarks Ces tarifs sont basés sur une conversion directe avec ajustements
 * pour le marché canadien (compétitivité, pouvoir d'achat, coûts opérationnels).
 * 
 * @see Pour plus de détails, consulter la documentation interne:
 * - docs/migration-fcfa-cad.md
 * - docs/pricing-strategy-canada.md
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

/**
 * Limites de l'application (en CAD)
 */
export const LIMITS = {
  MAX_TRANSACTION_HISTORY: 50,
  // CORRECTION FCFA→CAD #4: Limites augmentées pour une application VTC canadienne
  // MIN: 20 CAD (environ 1-2 courses minimum)
  // MAX: 2000 CAD (environ 65-130 courses maximum)
  MIN_WALLET_RECHARGE: 20,
  MAX_WALLET_RECHARGE: 2000,
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
