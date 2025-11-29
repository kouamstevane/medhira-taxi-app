/**
 * Service de Retry et Fallback pour le Matching
 * 
 * Gère les tentatives de recherche de chauffeurs avec élargissement progressif
 * du périmètre (temps de trajet) et gestion du Plan B (Bonus).
 * 
 * @module services/matching/retry
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from '@/utils/logger';
import { broadcastRideRequest } from './broadcast';
import { Location, MatchingMetrics } from '@/types';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';

export interface RetryConfig {
  initialPerimeterMinutes: number; // Plan A: 3-5 min
  expandedPerimeterMinutes: number; // Plan B: 10 min
  maxRetries: number;
  timeoutSeconds: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  initialPerimeterMinutes: 5,
  expandedPerimeterMinutes: 10,
  maxRetries: 3,
  timeoutSeconds: 90, // Aligné avec broadcast.ts
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
  bonus: number = 0,
  config: Partial<RetryConfig> = {}
): Promise<{ success: boolean; driversNotified: number; finalPerimeter: number }> => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Déterminer le périmètre initial
  // Si bonus > 0, on commence directement avec le périmètre élargi (Plan B)
  // Sinon on commence avec le périmètre restreint (Plan A)
  let currentPerimeter = bonus > 0
    ? finalConfig.expandedPerimeterMinutes
    : finalConfig.initialPerimeterMinutes;

  let retryCount = 0;
  let lastDriversNotified = 0;
  const startTime = Date.now();

  logger.info('Début recherche avec retry', {
    rideId,
    initialPerimeter: currentPerimeter,
    bonus,
    plan: bonus > 0 ? 'Plan B' : 'Plan A',
  });

  while (retryCount < finalConfig.maxRetries) {
    try {
      // Si on a déjà échoué une fois et qu'on a un bonus, ou si on est au dernier essai
      // on s'assure d'utiliser le périmètre élargi
      if (retryCount > 0 && bonus > 0) {
        currentPerimeter = finalConfig.expandedPerimeterMinutes;
      }

      const driverIds = await broadcastRideRequest({
        rideId,
        pickupLocation,
        destination,
        price,
        carType,
        maxTravelMinutes: currentPerimeter,
        timeoutSeconds: finalConfig.timeoutSeconds,
        bonus,
      });

      lastDriversNotified = driverIds.length;

      if (driverIds.length > 0) {
        logger.info('Chauffeurs trouvés avec retry', {
          rideId,
          perimeter: currentPerimeter,
          driversCount: driverIds.length,
          retryCount,
        });

        // Log métriques succès
        await logMatchingMetrics({
          rideId,
          timestamp: new Date(),
          initialRange: 0, // Non pertinent ici
          initialTravelTime: finalConfig.initialPerimeterMinutes,
          finalRange: 0,
          finalTravelTime: currentPerimeter,
          retryCount,
          driversNotified: driverIds.length,
          success: true,
          duration: Date.now() - startTime,
          bonusUsed: bonus,
        });

        return {
          success: true,
          driversNotified: driverIds.length,
          finalPerimeter: currentPerimeter,
        };
      }

      // Aucun chauffeur trouvé
      retryCount++;

      // Si on était en Plan A, on reste en Plan A pour les retries sauf si le client ajoute un bonus
      // L'expansion automatique sans bonus n'est pas activée pour forcer le passage au Plan B via bonus

      logger.info('Aucun chauffeur trouvé, nouvelle tentative', {
        rideId,
        perimeter: currentPerimeter,
        retryCount,
      });

      // Attendre un peu avant le retry (ex: 2 secondes)
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error: any) {
      logger.error('Erreur lors du retry', {
        error,
        rideId,
        perimeter: currentPerimeter,
        retryCount,
      });

      retryCount++;
      if (retryCount >= finalConfig.maxRetries) {
        throw error;
      }
    }
  }

  // Aucun chauffeur trouvé après tous les essais
  logger.warn('Aucun chauffeur trouvé après tous les essais', {
    rideId,
    finalPerimeter: currentPerimeter,
    retryCount,
  });

  // NE PAS marquer automatiquement comme failed ici, 
  // car le client peut vouloir réessayer manuellement avec un bonus
  // C'est le timer de 60s côté client (page.tsx) qui marquera failed si besoin
  // await notifyNoDriverAvailable(rideId);

  // Log métriques échec
  await logMatchingMetrics({
    rideId,
    timestamp: new Date(),
    initialRange: 0,
    initialTravelTime: finalConfig.initialPerimeterMinutes,
    finalRange: 0,
    finalTravelTime: currentPerimeter,
    retryCount,
    driversNotified: lastDriversNotified,
    success: false,
    duration: Date.now() - startTime,
    bonusUsed: bonus,
  });

  return {
    success: false,
    driversNotified: lastDriversNotified,
    finalPerimeter: currentPerimeter,
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
 * Enregistrer les métriques de matching
 */
export const logMatchingMetrics = async (metrics: MatchingMetrics): Promise<void> => {
  try {
    logger.info('Métriques de matching', metrics);
    // Ici on pourrait aussi sauvegarder dans Firestore si besoin
  } catch (error: any) {
    logger.error('Erreur lors de l\'enregistrement des métriques', { error, metrics });
  }
};
