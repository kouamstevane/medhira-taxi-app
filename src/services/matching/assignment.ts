/**
 * Service d'Attribution Atomique de Course
 * 
 * Gère l'attribution d'une course à un chauffeur de manière atomique
 * pour éviter les conflits de concurrence.
 * 
 * @module services/matching/assignment
 */

import {
  doc,
  getDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { logger } from '@/utils/logger';
import {
  markCandidateAccepted,
  expireAllPendingCandidates,
} from './broadcast';
import { getDriverById } from '../driver.service';

export interface AssignDriverResult {
  success: boolean;
  error?: string;
  rideId?: string;
  driverId?: string;
}

/**
 * Attribuer une course à un chauffeur de manière atomique
 * 
 * Utilise une transaction Firestore pour garantir l'atomicité :
 * - Vérifie que la course est toujours EN_ATTENTE
 * - Vérifie que le chauffeur peut accepter
 * - Met à jour le statut de la course
 * - Marque la candidature comme acceptée
 * - Expire les autres candidatures
 */
export const assignDriver = async (
  rideId: string,
  driverId: string
): Promise<AssignDriverResult> => {
  try {
    logger.info('Tentative d\'attribution de course', { rideId, driverId });

    // Utiliser une transaction pour garantir l'atomicité
    const result = await runTransaction(db, async (transaction) => {
      const rideRef = doc(db, 'bookings', rideId);
      const rideSnap = await transaction.get(rideRef);

      if (!rideSnap.exists()) {
        throw new Error('Course non trouvée');
      }

      const rideData = rideSnap.data();

      // Vérifier que la course est toujours en attente
      if (rideData.status !== 'pending') {
        throw new Error(
          `La course n'est plus disponible. Statut actuel: ${rideData.status}`
        );
      }

      // Vérifier que le chauffeur peut accepter
      const driver = await getDriverById(driverId);
      if (!driver) {
        throw new Error('Chauffeur non trouvé');
      }

      // Vérifier la disponibilité (isAvailable peut être undefined, on considère comme disponible)
      const isAvailable = driver.isAvailable !== undefined ? driver.isAvailable : true;
      if (!isAvailable) {
        throw new Error('Le chauffeur n\'est pas disponible');
      }

      // Vérifier ou créer la candidature
      const candidateRef = doc(db, 'bookings', rideId, 'candidates', driverId);
      const candidateSnap = await transaction.get(candidateRef);

      if (!candidateSnap.exists()) {
        // La candidature doit exister (créée par le broadcast) pour que le chauffeur puisse accepter.
        // Sans candidature, l'attribution n'est pas possible car le chauffeur n'a pas consenti.
        throw new Error(
          'Candidature non trouvée. Le chauffeur doit recevoir une offre de course via le broadcast avant de pouvoir accepter.'
        );
      } else {
        // Si la candidature existe, vérifier qu'elle est en attente
        const candidateData = candidateSnap.data();

        if (candidateData.status !== 'pending') {
          throw new Error(
            `Candidature déjà traitée. Statut: ${candidateData.status}`
          );
        }

        // Vérifier l'expiration (seulement si elle existe)
        const expiresAt = candidateData.expiresAt?.toDate();
        if (expiresAt && expiresAt < new Date()) {
          throw new Error('La candidature a expiré');
        }

        // Marquer la candidature comme acceptée
        transaction.update(candidateRef, {
          status: 'accepted',
          acceptedAt: serverTimestamp(),
        });
      }

      // Récupérer les informations du chauffeur
      const driverName = `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || 'Chauffeur';
      const driverPhone = driver.phone || driver.phoneNumber || '';
      const carModel = driver.car?.model || driver.carModel || '';
      const carPlate = driver.car?.plate || driver.carPlate || '';
      const carColor = driver.car?.color || driver.carColor || '';

      // Préparer les données de mise à jour (exclure les valeurs undefined)
      // Firestore n'accepte pas les valeurs undefined, donc on n'inclut que les champs définis
      const updateData: Record<string, unknown> = {
        status: 'accepted',
        driverId: driverId,
        driverName: driverName,
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Ajouter les champs optionnels seulement s'ils existent
      // Note: driverPhone est stocké mais pas affiché au client pour la sécurité
      if (driverPhone) {
        updateData.driverPhone = driverPhone;
      }
      if (driver.currentLocation) {
        updateData.driverLocation = driver.currentLocation;
      }
      if (carModel) {
        updateData.carModel = carModel;
      }
      if (carPlate) {
        updateData.carPlate = carPlate;
      }
      if (carColor) {
        updateData.carColor = carColor;
      }

      // Mettre à jour la course
      logger.info('Mise à jour de la course avec les données:', { rideId, updateData });
      transaction.update(rideRef, updateData);


      return { success: true, rideId, driverId };
    });

    // Expirer toutes les autres candidatures en attente (en dehors de la transaction)
    try {
      await expireAllPendingCandidates(rideId);
    } catch (expireError) {
      // Log l'erreur mais ne pas échouer l'attribution
      logger.error('Erreur lors de l\'expiration des candidatures', { error: expireError, rideId });
    }

    logger.info('Course attribuée avec succès', { rideId, driverId });
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    // Log l'erreur complète pour le débogage
    console.error('[ASSIGNMENT_DEBUG] Full error:', error);
    logger.error('Erreur lors de l\'attribution', { error: errorMessage, rideId, driverId, fullError: error });
    return {
      success: false,
      error: errorMessage || 'Erreur lors de l\'attribution de la course',
    };
  }
};

/**
 * Annuler l'attribution d'une course
 */
export const cancelAssignment = async (
  rideId: string,
  reason?: string
): Promise<void> => {
  try {
    const rideRef = doc(db, 'bookings', rideId);
    const rideSnap = await getDoc(rideRef);

    if (!rideSnap.exists()) {
      throw new Error('Course non trouvée');
    }

    await updateDoc(rideRef, {
      status: 'pending',
      driverId: null,
      driverName: null,
      driverPhone: null,
      driverLocation: null,
      carModel: null,
      carPlate: null,
      carColor: null,
      cancelledAt: serverTimestamp(),
      cancellationReason: reason,
      updatedAt: serverTimestamp(),
    });

    logger.info('Attribution annulée', { rideId, reason });
  } catch (error: any) {
    logger.error('Erreur lors de l\'annulation', { error, rideId });
    throw error;
  }
};

