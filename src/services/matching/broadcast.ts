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
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { findAvailableDrivers } from './findAvailableDrivers';
import { RideCandidate, BroadcastRideParams } from '@/types';
import { LIMITS, CURRENCY_CODE } from '@/utils/constants';

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

    const batch = writeBatch(db);

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
        travelTimeMinutes: driver.travelTimeMinutes,
        bonus: bonus,
      };

      batch.set(candidateRef, candidate);

      const driverRequestRef = doc(db, 'driver_requests', driver.driverId, 'requests', rideId);
      batch.set(driverRequestRef, {
        rideId,
        status: 'pending',
        expiresAt: Timestamp.fromDate(expiresAt),
        createdAt: serverTimestamp(),
        distance: driver.distance,
        travelTimeMinutes: driver.travelTimeMinutes,
        bonus: bonus,
      });

      driverIds.push(driver.driverId);
    }

    await batch.commit();

    console.log('[BROADCAST] Broadcast terminé', {
      rideId,
      driversNotified: driverIds.length,
      bonus: bonus > 0 ? `${bonus} ${CURRENCY_CODE}` : 'Aucun',
    });

    return driverIds;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    //  Typage correct de l'erreur (medJira.md #116)
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
    const rideRef = doc(db, 'bookings', rideId);

    //  Transaction atomique : read-check-write pour éviter que deux
    // chauffeurs acceptent simultanément la même course (race condition).
    const accepted = await runTransaction(db, async (tx) => {
      const rideSnap = await tx.get(rideRef);
      if (!rideSnap.exists()) return false;
      if (rideSnap.data().status !== 'pending') return false;

      const candidateSnap = await tx.get(candidateRef);

      if (!candidateSnap.exists()) {
        console.warn('[BROADCAST] Candidature non trouvée', { rideId, driverId });
        return false;
      }

      const candidateData = candidateSnap.data();

      if (candidateData.status !== 'pending') {
        console.warn('[BROADCAST] Candidature déjà traitée', {
          rideId,
          driverId,
          status: candidateData.status,
        });
        return false;
      }

      const expiresAt = candidateData.expiresAt?.toDate?.();
      if (expiresAt && expiresAt < new Date()) {
        console.warn('[BROADCAST] Candidature expirée', { rideId, driverId });
        tx.update(candidateRef, { status: 'expired' });
        return false;
      }

      tx.update(candidateRef, {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
      });
      return true;
    });

    if (accepted) {
      console.log('[BROADCAST] Candidature acceptée', { rideId, driverId });
    }
    return accepted;
  } catch (error: unknown) {
    //  Typage correct de l'erreur (medJira.md #116)
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

    await runTransaction(db, async (tx) => {
      const candidateSnap = await tx.get(candidateRef);

      if (!candidateSnap.exists()) {
        console.warn('[BROADCAST] Candidature non trouvée pour refus', { rideId, driverId });
        return;
      }

      const candidateData = candidateSnap.data();

      if (candidateData.status !== 'pending') {
        console.warn('[BROADCAST] Candidature déjà traitée, refus ignoré', {
          rideId,
          driverId,
          status: candidateData.status,
        });
        return;
      }

      tx.update(candidateRef, {
        status: 'declined',
        declinedAt: serverTimestamp(),
      });
    });

    console.log('[BROADCAST] Candidature refusée', { rideId, driverId });
  } catch (error: unknown) {
    //  Typage correct de l'erreur (medJira.md #116)
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
      where('status', '==', 'pending'),
      limit(100)
    );

    const pendingSnapshot = await getDocs(pendingQuery);

    if (pendingSnapshot.empty) return;

    await runTransaction(db, async (tx) => {
      let expiredCount = 0;

      for (const d of pendingSnapshot.docs) {
        const freshSnap = await tx.get(d.ref);
        if (freshSnap.exists() && freshSnap.data().status === 'pending') {
          tx.update(d.ref, {
            status: 'expired',
            expiredAt: serverTimestamp(),
          });
          expiredCount++;
        }
      }

      if (expiredCount > 0) {
        console.log('[BROADCAST] Candidatures expirées', {
          rideId,
          count: expiredCount,
        });
      }
    });
  } catch (error: unknown) {
    //  Typage correct de l'erreur (medJira.md #116)
    const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('[BROADCAST] Erreur lors de l\'expiration:', errorMsg);
  }
};

/**
 * S'abonner aux demandes de course pour un chauffeur
 *  NOUVELLE ARCHITECTURE : Utilise driver_requests au lieu de collection group sur bookings
 * Cela évite les erreurs de permissions et améliore les performances
 */
export const subscribeToDriverRideRequests = (
  driverId: string,
  callback: (requests: Array<{ rideId: string; candidate: RideCandidate }>) => void
): (() => void) => {
  //  Utiliser driver_requests/{driverId}/requests au lieu de collection group sur bookings
  const requestsRef = collection(db, 'driver_requests', driverId, 'requests');
  const pendingRequestsQuery = query(
    requestsRef,
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(LIMITS.DEFAULT_QUERY_LIMIT)
  );

  const unsubscribe = onSnapshot(
    pendingRequestsQuery,
    (snapshot) => {
      const requests: Array<{ rideId: string; candidate: RideCandidate }> = [];

      for (const doc of snapshot.docs) {
        const requestData = doc.data();
        const expiresAt = requestData.expiresAt?.toDate();
        
        // Vérifier que la demande n'a pas expiré
        if (!expiresAt || expiresAt > new Date()) {
          requests.push({
            rideId: doc.id,
            candidate: {
              rideId: doc.id,
              driverId,
              status: requestData.status,
              expiresAt: requestData.expiresAt,
              createdAt: requestData.createdAt,
              distance: requestData.distance,
              travelTimeMinutes: requestData.travelTimeMinutes,
              bonus: requestData.bonus,
            } as RideCandidate,
          });
        }
      }

      callback(requests);
    },
    (error: unknown) => {
      //  Typage correct de l'erreur (medJira.md #116)
      const errorCode = (error as { code?: string }).code;
      const errorMessage = (error as { message?: string }).message;
      console.error('[BROADCAST] Erreur lors de l\'écoute des demandes:', errorCode, errorMessage);
    }
  );

  return unsubscribe;
};

/**
 * Récupérer les candidatures en attente pour un chauffeur
 *  NOUVELLE ARCHITECTURE : Utilise driver_requests au lieu de collection group sur bookings
 */
export const getPendingCandidatesForDriver = async (
  driverId: string
): Promise<Array<{ rideId: string; candidate: RideCandidate }>> => {
  try {
    //  Utiliser driver_requests/{driverId}/requests au lieu de collection group sur bookings
    const requestsRef = collection(db, 'driver_requests', driverId, 'requests');
    const pendingRequestsQuery = query(
      requestsRef,
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(LIMITS.DEFAULT_QUERY_LIMIT)
    );

    const requestsSnapshot = await getDocs(pendingRequestsQuery);
    const requests: Array<{ rideId: string; candidate: RideCandidate }> = [];

    for (const doc of requestsSnapshot.docs) {
      const requestData = doc.data();
      const expiresAt = requestData.expiresAt?.toDate();
      
      // Vérifier que la demande n'a pas expiré
      if (!expiresAt || expiresAt > new Date()) {
        requests.push({
          rideId: doc.id,
          candidate: {
            rideId: doc.id,
            driverId,
            status: requestData.status,
            expiresAt: requestData.expiresAt,
            createdAt: requestData.createdAt,
            distance: requestData.distance,
            travelTimeMinutes: requestData.travelTimeMinutes,
            bonus: requestData.bonus,
          } as RideCandidate,
        });
      }
    }

    return requests;
  } catch (error: unknown) {
    //  Typage correct de l'erreur (medJira.md #116)
    const errorCode = (error as { code?: string }).code;
    const errorMessage = (error as { message?: string }).message;
    console.error('[BROADCAST] Erreur récupération des demandes:', errorCode, errorMessage);
    return [];
  }
};
