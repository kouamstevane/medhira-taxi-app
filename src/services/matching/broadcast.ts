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
// import { logger } from '@/utils/logger'; // Commenté pour éviter les erreurs
import { findAvailableDrivers } from './findAvailableDrivers';
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
    console.log('[BROADCAST] Début du broadcast de la course', { rideId, rangeKm });

    // Trouver les chauffeurs disponibles
    const availableDrivers = await findAvailableDrivers({
      location: pickupLocation,
      rangeKm,
      maxResults: 10,
      carType,
    });

    if (availableDrivers.length === 0) {
      console.warn('[BROADCAST] Aucun chauffeur disponible trouvé', { rideId, rangeKm });
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

    console.log('[BROADCAST] Broadcast terminé', {
      rideId,
      driversNotified: driverIds.length,
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
      const errorCode = (error as { code?: string }).code;
      const errorMessage = (error as { message?: string }).message;
      console.error('[BROADCAST] Erreur lors de l\'écoute:', errorCode, errorMessage);
      
      if (errorCode === 'permission-denied') {
        console.error('[BROADCAST] Permission refusée - Vérifiez les règles Firestore');
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
  } catch (error) {
    const errorCode = (error as { code?: string }).code;
    const errorMessage = (error as { message?: string }).message;
    console.error('[BROADCAST] Erreur récupération candidatures:', errorCode, errorMessage);
    
    if (errorCode === 'permission-denied') {
      console.error('[BROADCAST] Permission refusée - Vérifiez les règles Firestore');
    }
    
    return [];
  }
};

