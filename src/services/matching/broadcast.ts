/**
 * Service de Broadcast de Demandes de Course
 * 
 * Gère l'envoi de notifications aux chauffeurs disponibles
 * lorsqu'une nouvelle course est créée.
 * 
 * @module services/matching/broadcast
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { findAvailableDrivers } from './findAvailableDrivers';
import { RideCandidate, BroadcastRideParams } from '@/types';

/**
 * Diffuser une demande de course aux chauffeurs disponibles
 */
export const broadcastRideRequest = async (
  params: BroadcastRideParams
): Promise<string[]> => {
  const {
    rideId,
    pickupLocation,
    destination,
    price,
    carType,
    rangeKm = 20, // Rayon large par défaut
    maxTravelMinutes = 5, // Périmètre par défaut (Plan A)
    timeoutSeconds = 90, // 90 secondes pour laisser le temps aux chauffeurs de réagir
    bonus = 0,
  } = params;

  try {
    console.log('[BROADCAST] Début du broadcast de la course', {
      rideId,
      maxTravelMinutes,
      bonus
    });

    // Trouver les chauffeurs disponibles avec le nouveau système de périmètre
    const availableDrivers = await findAvailableDrivers({
      location: pickupLocation,
      rangeKm,
      maxTravelMinutes,
      maxResults: 10,
      carType,
      useDirectionsAPI: true, // Activer la vérification précise
    });

    if (availableDrivers.length === 0) {
      console.warn('[BROADCAST] Aucun chauffeur disponible trouvé dans le périmètre', {
        rideId,
        maxTravelMinutes
      });
      return [];
    }

    // Créer les candidatures pour chaque chauffeur
    const candidatesRef = collection(db, 'bookings', rideId, 'candidates');
    const driverIds: string[] = [];
    const expiresAt = new Date(Date.now() + timeoutSeconds * 1000);

    for (const driver of availableDrivers) {
      const candidateRef = doc(candidatesRef, driver.driverId);

      const candidate: RideCandidate = {
        rideId,
        driverId: driver.driverId,
        status: 'pending',
        expiresAt: Timestamp.fromDate(expiresAt),
        createdAt: serverTimestamp() as Timestamp,
        distance: driver.distance,
        score: driver.score,
        // Nouveaux champs
        travelTimeMinutes: driver.travelTimeMinutes,
        bonus: bonus,
      };

      await setDoc(candidateRef, candidate);
      driverIds.push(driver.driverId);
    }

    console.log('[BROADCAST] Broadcast terminé', {
      rideId,
      driversNotified: driverIds.length,
      bonus: bonus > 0 ? `${bonus} FCFA` : 'Aucun',
    });

    return driverIds;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('[BROADCAST] Erreur lors du broadcast:', errorMessage);
    throw new Error(`Erreur lors du broadcast: ${errorMessage}`);
  }
};

/**
 * Marquer une candidature comme acceptée
 */
export const markCandidateAccepted = async (
  rideId: string,
  driverId: string
): Promise<boolean> => {
  try {
    const candidateRef = doc(db, 'bookings', rideId, 'candidates', driverId);
    const candidateSnap = await getDoc(candidateRef);

    if (!candidateSnap.exists()) {
      console.warn('[BROADCAST] Candidature non trouvée', { rideId, driverId });
      return false;
    }

    const candidateData = candidateSnap.data();

    // Vérifier que la candidature est toujours en attente
    if (candidateData.status !== 'pending') {
      console.warn('[BROADCAST] Candidature déjà traitée', {
        rideId,
        driverId,
        status: candidateData.status,
      });
      return false;
    }

    // Vérifier que la candidature n'a pas expiré
    const expiresAt = candidateData.expiresAt?.toDate();
    if (expiresAt && expiresAt < new Date()) {
      console.warn('[BROADCAST] Candidature expirée', { rideId, driverId });
      await updateDoc(candidateRef, { status: 'expired' });
      return false;
    }

    // Marquer comme acceptée
    await updateDoc(candidateRef, {
      status: 'accepted',
      acceptedAt: serverTimestamp(),
    });

    console.log('[BROADCAST] Candidature acceptée', { rideId, driverId });
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('[BROADCAST] Erreur lors de l\'acceptation:', errorMsg);
    return false;
  }
};

/**
 * Marquer une candidature comme refusée
 */
export const markCandidateDeclined = async (
  rideId: string,
  driverId: string
): Promise<void> => {
  try {
    const candidateRef = doc(db, 'bookings', rideId, 'candidates', driverId);
    const candidateSnap = await getDoc(candidateRef);

    if (!candidateSnap.exists()) {
      console.warn('[BROADCAST] Candidature non trouvée pour refus', { rideId, driverId });
      return;
    }

    await updateDoc(candidateRef, {
      status: 'declined',
      declinedAt: serverTimestamp(),
    });

    console.log('[BROADCAST] Candidature refusée', { rideId, driverId });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('[BROADCAST] Erreur lors du refus:', errorMsg);
  }
};

/**
 * Marquer toutes les candidatures restantes comme expirées
 */
export const expireAllPendingCandidates = async (
  rideId: string
): Promise<void> => {
  try {
    const candidatesRef = collection(db, 'bookings', rideId, 'candidates');
    const pendingQuery = query(
      candidatesRef,
      where('status', '==', 'pending')
    );

    const pendingSnapshot = await getDocs(pendingQuery);

    const updatePromises = pendingSnapshot.docs.map((doc) =>
      updateDoc(doc.ref, {
        status: 'expired',
        expiredAt: serverTimestamp(),
      })
    );

    await Promise.all(updatePromises);

    console.log('[BROADCAST] Candidatures expirées', {
      rideId,
      count: pendingSnapshot.size,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('[BROADCAST] Erreur lors de l\'expiration:', errorMsg);
  }
};

/**
 * S'abonner aux demandes de course pour un chauffeur
 */
export const subscribeToDriverRideRequests = (
  driverId: string,
  callback: (requests: Array<{ rideId: string; candidate: RideCandidate }>) => void
): (() => void) => {
  const bookingsRef = collection(db, 'bookings');
  const pendingRidesQuery = query(
    bookingsRef,
    where('status', '==', 'pending')
  );

  const unsubscribe = onSnapshot(
    pendingRidesQuery,
    async (snapshot) => {
      const requests: Array<{ rideId: string; candidate: RideCandidate }> = [];

      for (const rideDoc of snapshot.docs) {
        const rideId = rideDoc.id;
        const candidateRef = doc(db, 'bookings', rideId, 'candidates', driverId);
        const candidateSnap = await getDoc(candidateRef);

        if (candidateSnap.exists()) {
          const candidateData = candidateSnap.data() as RideCandidate;

          if (candidateData.status === 'pending') {
            const expiresAt = candidateData.expiresAt?.toDate();
            if (!expiresAt || expiresAt > new Date()) {
              requests.push({
                rideId,
                candidate: candidateData,
              });
            }
          }
        }
      }

      callback(requests);
    },
    (error) => {
      const errorCode = (error as { code?: string }).code;
      const errorMessage = (error as { message?: string }).message;
      console.error('[BROADCAST] Erreur lors de l\'écoute:', errorCode, errorMessage);
    }
  );

  return unsubscribe;
};

/**
 * Récupérer les candidatures en attente pour un chauffeur
 */
export const getPendingCandidatesForDriver = async (
  driverId: string
): Promise<Array<{ rideId: string; candidate: RideCandidate }>> => {
  try {
    const bookingsRef = collection(db, 'bookings');
    const pendingRidesQuery = query(
      bookingsRef,
      where('status', '==', 'pending')
    );

    const ridesSnapshot = await getDocs(pendingRidesQuery);
    const requests: Array<{ rideId: string; candidate: RideCandidate }> = [];

    for (const rideDoc of ridesSnapshot.docs) {
      const rideId = rideDoc.id;
      const candidateRef = doc(db, 'bookings', rideId, 'candidates', driverId);
      const candidateSnap = await getDoc(candidateRef);

      if (candidateSnap.exists()) {
        const candidateData = candidateSnap.data() as RideCandidate;

        if (candidateData.status === 'pending') {
          const expiresAt = candidateData.expiresAt?.toDate();
          if (!expiresAt || expiresAt > new Date()) {
            requests.push({
              rideId,
              candidate: candidateData,
            });
          }
        }
      }
    }

    return requests;
  } catch (error) {
    const errorCode = (error as { code?: string }).code;
    const errorMessage = (error as { message?: string }).message;
    console.error('[BROADCAST] Erreur récupération candidatures:', errorCode, errorMessage);
    return [];
  }
};
