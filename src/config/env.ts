/**
 * Gestion Centralisée des Variables d'Environnement
 * 
 * Valide et expose les variables d'environnement de manière type-safe.
 * Lance une erreur si des variables requises sont manquantes.
 * 
 * @module config/env
 */

import { logger } from '@/utils/logger';

/**
 * Configuration de l'environnement
 */
interface EnvironmentConfig {
  // Environment
  isDevelopment: boolean;
  isProduction: boolean;
  nodeEnv: string;

  // Firebase
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };

  // Google Maps
  googleMapsApiKey: string;

  // API URLs (si backend externe)
  apiUrl?: string;
}

/**
 * Récupérer une variable d'environnement
 * Lance une erreur si la variable est requise mais absente
 */
function getEnvVar(key: string, required: boolean = true): string {
  const value = process.env[key];

  if (!value && required) {
    logger.error(`Variable d'environnement manquante: ${key}`);
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value || '';
}

/**
 * Valider et construire la configuration
 */
function buildConfig(): EnvironmentConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';

  return {
    // Environment
    isDevelopment: nodeEnv === 'development',
    isProduction: nodeEnv === 'production',
    nodeEnv,

    // Firebase (requis)
    firebase: {
      apiKey: getEnvVar('NEXT_PUBLIC_FIREBASE_API_KEY'),
      authDomain: getEnvVar('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
      projectId: getEnvVar('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
      storageBucket: getEnvVar('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: getEnvVar('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
      appId: getEnvVar('NEXT_PUBLIC_FIREBASE_APP_ID'),
    },

    // Google Maps (requis)
    googleMapsApiKey: getEnvVar('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'),

    // API URL (optionnel)
    apiUrl: getEnvVar('NEXT_PUBLIC_API_URL', false),
  };
}

/**
 * Configuration exportée
 */
export const env = buildConfig();

/**
 * Afficher les variables d'environnement chargées (mode dev uniquement)
 */
if (env.isDevelopment) {
  logger.info('Environment configuration loaded', {
    nodeEnv: env.nodeEnv,
    firebaseProject: env.firebase.projectId,
    hasGoogleMapsKey: !!env.googleMapsApiKey,
  });
}
