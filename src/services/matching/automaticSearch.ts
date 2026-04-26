/**
 * Service de Recherche Automatique
 * 
 * Gère la recherche périodique de chauffeurs pour une course donnée.
 * 
 * @module services/matching/automaticSearch
 */

import { doc, updateDoc, getDoc, serverTimestamp, increment, runTransaction } from 'firebase/firestore';
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
 * Registre des intervalles actifs par bookingId, pour permettre à
 * `stopAutomaticSearch` d'effectuer un vrai clearInterval côté client.
 */
const activeIntervals = new Map<string, NodeJS.Timeout>();
/**
 * Mutex par bookingId : empêche deux exécutions concurrentes de `attemptSearch`
 * lorsqu'une tentative dure plus longtemps que `intervalSeconds`.
 */
const searchingLocks = new Set<string>();

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

        // C-RACE-01: mutex — si une tentative précédente est toujours en cours
        // (findDriverWithRetry peut durer jusqu'à ~90s, > intervalSeconds par défaut),
        // on ignore purement et simplement ce tick.
        if (searchingLocks.has(bookingId)) {
            logger.debug('Tentative recherche auto ignorée (déjà en cours)', { bookingId });
            return;
        }
        searchingLocks.add(bookingId);

        try {
            const bookingRef = doc(db, 'bookings', bookingId);

            // C-RACE-02: check-then-update atomique.
            // On lit le booking, vérifie son statut et pose `status: 'pending'`
            // dans la même transaction pour éviter qu'un autre acteur (acceptation
            // chauffeur, annulation, etc.) ne change l'état entre la lecture et l'écriture.
            type TxOutcome =
                | { kind: 'stop'; reason: string; status?: string }
                | { kind: 'max' }
                | { kind: 'proceed'; booking: Booking };

            const outcome = await runTransaction<TxOutcome>(db, async (tx) => {
                const snap = await tx.get(bookingRef);
                if (!snap.exists()) {
                    return { kind: 'stop', reason: 'not_found' };
                }
                const booking = snap.data() as Booking;

                if (booking.status !== 'pending' && booking.status !== 'failed') {
                    return { kind: 'stop', reason: 'status', status: booking.status };
                }

                if (attemptCount + 1 > finalConfig.maxAttempts) {
                    return { kind: 'max' };
                }
                attemptCount++;

                tx.update(bookingRef, {
                    'automaticSearch.attemptCount': increment(1),
                    'automaticSearch.lastAttemptAt': serverTimestamp(),
                    status: 'pending',
                    failureReason: null,
                });

                return { kind: 'proceed', booking };
            });

            if (outcome.kind === 'stop') {
                if (outcome.reason === 'not_found') {
                    logger.warn('Booking introuvable, arrêt recherche auto', { bookingId });
                } else {
                    logger.info('Course acceptée ou annulée, arrêt recherche auto', {
                        bookingId,
                        status: outcome.status,
                    });
                }
                stop();
                return;
            }

            if (outcome.kind === 'max') {
                logger.info('Nombre max de tentatives atteint', { bookingId });
                stop();
                return;
            }

            logger.info(`Tentative recherche auto #${attemptCount}`, { bookingId });

            // Relancer la recherche avec retry
            const booking = outcome.booking;
            if (booking.pickupLocation) {
                await findDriverWithRetry(
                    bookingId,
                    booking.pickupLocation,
                    booking.destination,
                    booking.price,
                    booking.carType,
                    booking.bonus || 0,
                    {
                        timeoutSeconds: 90, // Aligné avec les autres configurations
                        maxRetries: 1, // Une seule tentative par cycle périodique
                    }
                );
            }

        } catch (error) {
            logger.error('Erreur tentative recherche auto', { error, bookingId });
        } finally {
            searchingLocks.delete(bookingId);
        }
    };

    // Lancer la première tentative après un court délai (1s) pour éviter de surcharger
    setTimeout(attemptSearch, 1000);

    // Configurer l'intervalle pour les tentatives suivantes
    intervalId = setInterval(attemptSearch, finalConfig.intervalSeconds * 1000);
    activeIntervals.set(bookingId, intervalId);

    // Fonction de nettoyage
    const stop = () => {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        activeIntervals.delete(bookingId);
        searchingLocks.delete(bookingId);
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
    // C-RACE-01: effectuer aussi un vrai clearInterval côté client si
    // une recherche a été démarrée dans ce processus.
    const intervalId = activeIntervals.get(bookingId);
    if (intervalId) {
        clearInterval(intervalId);
        activeIntervals.delete(bookingId);
    }
    searchingLocks.delete(bookingId);

    try {
        const bookingRef = doc(db, 'bookings', bookingId);
        await updateDoc(bookingRef, {
            'automaticSearch.enabled': false,
        });
    } catch (error) {
        logger.error('Erreur arrêt recherche auto Firestore', { error, bookingId });
    }
};
