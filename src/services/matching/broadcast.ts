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
import { logger } from '@/utils/logger';
import { findAvailableDrivers, AvailableDriver } from './findAvailableDrivers';
import { Location } from '@/types';

export interface RideCandidate {
  rideId: string;
  driverId: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: Timestamp;
  createdAt: Timestamp;
  distance?: number;
  score?: number;
}

export interface BroadcastRideParams {
  rideId: string;
  pickupLocation: Location;
  destination: string;
  price: number;
  carType?: string;
  rangeKm?: number;
  timeoutSeconds?: number; // Délai avant expiration (défaut: 30s)
}

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
    rangeKm = 5, // Rayon par défaut de 5 km
    timeoutSeconds = 30, // Délai par défaut de 30 secondes
  } = params;

  try {
    logger.info('Début du broadcast de la course', { rideId, rangeKm });

    // Trouver les chauffeurs disponibles
    const availableDrivers = await findAvailableDrivers({
      location: pickupLocation,
      rangeKm,
      maxResults: 10,
      carType,
    });

    if (availableDrivers.length === 0) {
      logger.warn('Aucun chauffeur disponible trouvé', { rideId, rangeKm });
      return [];
    }

    // Créer les candidatures pour chaque chauffeur
    // Utiliser la collection 'bookings' au lieu de 'rides'
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
      };

      await setDoc(candidateRef, candidate);
      driverIds.push(driver.driverId);
    }

    logger.info('Broadcast terminé', {
      rideId,
      driversNotified: driverIds.length,
    });

    return driverIds;
  } catch (error: any) {
    logger.error('Erreur lors du broadcast', { error, rideId });
    throw new Error(`Erreur lors du broadcast: ${error.message}`);
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
      logger.warn('Candidature non trouvée', { rideId, driverId });
      return false;
    }

    const candidateData = candidateSnap.data();
    
    // Vérifier que la candidature est toujours en attente
    if (candidateData.status !== 'pending') {
      logger.warn('Candidature déjà traitée', {
        rideId,
        driverId,
        status: candidateData.status,
      });
      return false;
    }

    // Vérifier que la candidature n'a pas expiré
    const expiresAt = candidateData.expiresAt?.toDate();
    if (expiresAt && expiresAt < new Date()) {
      logger.warn('Candidature expirée', { rideId, driverId });
      await updateDoc(candidateRef, { status: 'expired' });
      return false;
    }

    // Marquer comme acceptée
    await updateDoc(candidateRef, {
      status: 'accepted',
      acceptedAt: serverTimestamp(),
    });

    logger.info('Candidature acceptée', { rideId, driverId });
    return true;
  } catch (error: any) {
    logger.error('Erreur lors de l\'acceptation', { error, rideId, driverId });
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
      logger.warn('Candidature non trouvée pour refus', { rideId, driverId });
      return;
    }

    await updateDoc(candidateRef, {
      status: 'declined',
      declinedAt: serverTimestamp(),
    });

    logger.info('Candidature refusée', { rideId, driverId });
  } catch (error: any) {
    logger.error('Erreur lors du refus', { error, rideId, driverId });
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

    logger.info('Candidatures expirées', {
      rideId,
      count: pendingSnapshot.size,
    });
  } catch (error: any) {
    logger.error('Erreur lors de l\'expiration', { error, rideId });
  }
};

/**
 * S'abonner aux demandes de course pour un chauffeur
 */
export const subscribeToDriverRideRequests = (
  driverId: string,
  callback: (requests: Array<{ rideId: string; candidate: RideCandidate }>) => void
): (() => void) => {
  // Écouter toutes les collections candidates où le driverId correspond
  // Note: Firestore ne supporte pas directement les requêtes sur les sous-collections
  // On utilise une approche différente : écouter les bookings avec status 'pending'
  // et vérifier si le chauffeur a une candidature
  
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
          
          // Ne retourner que les candidatures en attente et non expirées
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
      logger.error('Erreur lors de l\'écoute des demandes', { error, driverId, code: error.code, message: error.message });
      
      // Si erreur de permission, logger plus de détails
      if (error.code === 'permission-denied') {
        logger.error('Permission refusée - Vérifiez les règles Firestore', {
          driverId,
          collection: 'bookings',
          subcollection: 'candidates',
        });
      }
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
  } catch (error: any) {
    logger.error('Erreur lors de la récupération des candidatures', {
      error,
      driverId,
      code: error.code,
      message: error.message,
    });
    
    // Si erreur de permission, logger plus de détails
    if (error.code === 'permission-denied') {
      logger.error('Permission refusée - Vérifiez les règles Firestore', {
        driverId,
        collection: 'bookings',
        subcollection: 'candidates',
      });
    }
    
    return [];
  }
};

