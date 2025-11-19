/**
 * Service de Retry et Fallback pour le Matching
 * 
 * Gère les tentatives de recherche de chauffeurs avec élargissement progressif
 * du rayon de recherche et notification au client si aucun chauffeur n'est trouvé.
 * 
 * @module services/matching/retry
 */

import { logger } from '@/utils/logger';
import { broadcastRideRequest } from './broadcast';
import { Location } from '@/types';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';

export interface RetryConfig {
  initialRangeKm: number;
  maxRangeKm: number;
  rangeIncrement: number;
  maxRetries: number;
  timeoutSeconds: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  initialRangeKm: 5,
  maxRangeKm: 20,
  rangeIncrement: 5,
  maxRetries: 3,
  timeoutSeconds: 30,
};

/**
 * Rechercher un chauffeur avec retry et élargissement progressif
 */
export const findDriverWithRetry = async (
  rideId: string,
  pickupLocation: Location,
  destination: string,
  price: number,
  carType?: string,
  config: Partial<RetryConfig> = {}
): Promise<{ success: boolean; driversNotified: number; finalRange: number }> => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let currentRange = finalConfig.initialRangeKm;
  let retryCount = 0;
  let lastDriversNotified = 0;

  logger.info('Début recherche avec retry', {
    rideId,
    initialRange: currentRange,
    maxRange: finalConfig.maxRangeKm,
  });

  while (retryCount < finalConfig.maxRetries && currentRange <= finalConfig.maxRangeKm) {
    try {
      const driverIds = await broadcastRideRequest({
        rideId,
        pickupLocation,
        destination,
        price,
        carType,
        rangeKm: currentRange,
        timeoutSeconds: finalConfig.timeoutSeconds,
      });

      lastDriversNotified = driverIds.length;

      if (driverIds.length > 0) {
        logger.info('Chauffeurs trouvés avec retry', {
          rideId,
          range: currentRange,
          driversCount: driverIds.length,
          retryCount,
        });
        return {
          success: true,
          driversNotified: driverIds.length,
          finalRange: currentRange,
        };
      }

      // Aucun chauffeur trouvé, élargir le rayon
      retryCount++;
      currentRange += finalConfig.rangeIncrement;

      logger.info('Aucun chauffeur trouvé, élargissement du rayon', {
        rideId,
        newRange: currentRange,
        retryCount,
      });
    } catch (error: any) {
      logger.error('Erreur lors du retry', {
        error,
        rideId,
        range: currentRange,
        retryCount,
      });

      // En cas d'erreur, essayer avec un rayon plus large
      retryCount++;
      currentRange += finalConfig.rangeIncrement;

      if (retryCount >= finalConfig.maxRetries) {
        throw error;
      }
    }
  }

  // Aucun chauffeur trouvé après tous les essais
  logger.warn('Aucun chauffeur trouvé après tous les essais', {
    rideId,
    finalRange: currentRange,
    retryCount,
  });

  // Marquer la course comme échouée
  await notifyNoDriverAvailable(rideId);

  return {
    success: false,
    driversNotified: lastDriversNotified,
    finalRange: currentRange,
  };
};

/**
 * Notifier le client qu'aucun chauffeur n'est disponible
 */
const notifyNoDriverAvailable = async (rideId: string): Promise<void> => {
  try {
    const bookingRef = doc(db, 'bookings', rideId);
    await updateDoc(bookingRef, {
      status: 'failed',
      failureReason: 'Aucun chauffeur disponible dans la zone',
      updatedAt: serverTimestamp(),
    });

    logger.info('Client notifié - Aucun chauffeur disponible', { rideId });
  } catch (error: any) {
    logger.error('Erreur lors de la notification au client', { error, rideId });
  }
};

/**
 * Métriques de matching pour audit
 */
export interface MatchingMetrics {
  rideId: string;
  timestamp: Date;
  initialRange: number;
  finalRange: number;
  retryCount: number;
  driversNotified: number;
  success: boolean;
  duration: number; // en millisecondes
}

/**
 * Enregistrer les métriques de matching
 */
export const logMatchingMetrics = async (metrics: MatchingMetrics): Promise<void> => {
  try {
    // Pour l'instant, on log juste dans la console
    // Plus tard, on pourrait créer une collection 'matching_metrics' dans Firestore
    logger.info('Métriques de matching', metrics);
  } catch (error: any) {
    logger.error('Erreur lors de l\'enregistrement des métriques', { error, metrics });
  }
};

