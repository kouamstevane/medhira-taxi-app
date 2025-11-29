/**
 * Service de Recherche Automatique
 * 
 * Gère la recherche périodique de chauffeurs pour une course donnée.
 * 
 * @module services/matching/automaticSearch
 */

import { doc, updateDoc, getDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logger } from '@/utils/logger';
import { findDriverWithRetry } from './retry';
import { Booking } from '@/types';

interface AutoSearchConfig {
    intervalSeconds: number;
    maxAttempts: number;
}

const DEFAULT_CONFIG: AutoSearchConfig = {
    intervalSeconds: 60, // 1 minute
    maxAttempts: 10,
};

/**
 * Démarrer la recherche automatique
 * 
 * @returns Fonction pour arrêter la recherche (cleanup)
 */
export const startAutomaticSearch = (
    bookingId: string,
    config: Partial<AutoSearchConfig> = {}
): (() => void) => {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    let attemptCount = 0;
    let intervalId: NodeJS.Timeout | null = null;
    let isRunning = true;

    logger.info('Démarrage recherche automatique', { bookingId, config: finalConfig });

    // Fonction de tentative
    const attemptSearch = async () => {
        if (!isRunning) return;

        try {
            // Vérifier l'état actuel du booking
            const bookingRef = doc(db, 'bookings', bookingId);
            const bookingSnap = await getDoc(bookingRef);

            if (!bookingSnap.exists()) {
                logger.warn('Booking introuvable, arrêt recherche auto', { bookingId });
                stop();
                return;
            }

            const booking = bookingSnap.data() as Booking;

            // Arrêter si la course n'est plus en attente ou failed
            if (booking.status !== 'pending' && booking.status !== 'failed') {
                logger.info('Course acceptée ou annulée, arrêt recherche auto', {
                    bookingId,
                    status: booking.status
                });
                stop();
                return;
            }

            // Si c'est failed, on peut réessayer (le client a probablement cliqué sur "Recherche auto")
            // Si c'est pending, on continue

            attemptCount++;

            if (attemptCount > finalConfig.maxAttempts) {
                logger.info('Nombre max de tentatives atteint', { bookingId });
                // Ne pas marquer comme failed ici, laisser le client décider ou le timeout global
                stop();
                return;
            }

            logger.info(`Tentative recherche auto #${attemptCount}`, { bookingId });

            // Mettre à jour les métriques de recherche auto
            await updateDoc(bookingRef, {
                'automaticSearch.attemptCount': increment(1),
                'automaticSearch.lastAttemptAt': serverTimestamp(),
                // Si c'était failed, remettre en pending
                status: 'pending',
                failureReason: null,
            });

            // Relancer la recherche avec retry
            // Note: On utilise les paramètres existants du booking
            if (booking.pickupLocation) {
                await findDriverWithRetry(
                    bookingId,
                    booking.pickupLocation,
                    booking.destination,
                    booking.price,
                    booking.carType,
                    booking.bonus || 0,
                    {
                        // Configuration spécifique pour une tentative périodique
                        timeoutSeconds: 90, // Aligné avec les autres configurations
                        maxRetries: 1, // Une seule tentative par cycle périodique
                    }
                );
            }

        } catch (error) {
            logger.error('Erreur tentative recherche auto', { error, bookingId });
        }
    };

    // Lancer la première tentative après un court délai (1s) pour éviter de surcharger
    setTimeout(attemptSearch, 1000);

    // Configurer l'intervalle pour les tentatives suivantes
    intervalId = setInterval(attemptSearch, finalConfig.intervalSeconds * 1000);

    // Fonction de nettoyage
    const stop = () => {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        isRunning = false;
        logger.info('Arrêt recherche automatique', { bookingId });
    };

    return stop;
};

/**
 * Arrêter explicitement la recherche automatique (helper)
 * Note: Idéalement on utilise la fonction retournée par startAutomaticSearch,
 * mais ceci peut servir si on gère l'état via Firestore uniquement.
 */
export const stopAutomaticSearch = async (bookingId: string): Promise<void> => {
    try {
        const bookingRef = doc(db, 'bookings', bookingId);
        await updateDoc(bookingRef, {
            'automaticSearch.enabled': false,
        });
    } catch (error) {
        logger.error('Erreur arrêt recherche auto Firestore', { error, bookingId });
    }
};
