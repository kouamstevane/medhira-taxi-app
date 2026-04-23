/**
 * Service de Gestion des Chauffeurs
 * 
 * Gère les profils chauffeurs, leur disponibilité,
 * et leurs statistiques.
 * 
 * @module services/driver
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Driver, DriverStatus, Location, Rating } from '@/types';
import { LIMITS } from '@/utils/constants';

/**
 * Créer ou mettre à jour un profil chauffeur
 */
export const createOrUpdateDriver = async (
  driverId: string,
  driverData: Partial<Driver>
): Promise<void> => {
  try {
    const driverRef = doc(db, 'drivers', driverId);
    const driverSnap = await getDoc(driverRef);

    if (driverSnap.exists()) {
      await updateDoc(driverRef, {
        ...driverData,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(driverRef, {
        id: driverId,
        ...driverData,
        status: 'offline',
        verified: false,
        rating: 5,
        totalTrips: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error('[driver.service] createOrUpdateDriver failed:', error);
    throw error;
  }
};

/**
 * Récupérer un chauffeur par ID
 */
export const getDriverById = async (driverId: string): Promise<Driver | null> => {
  try {
    const driverRef = doc(db, 'drivers', driverId);
    const driverSnap = await getDoc(driverRef);

    if (driverSnap.exists()) {
      return driverSnap.data() as Driver;
    }

    return null;
  } catch (error) {
    console.error('[driver.service] getDriverById failed:', error);
    throw error;
  }
};

/**
 * Récupérer un chauffeur par userId
 */
export const getDriverByUserId = async (userId: string): Promise<Driver | null> => {
  try {
    const driversRef = collection(db, 'drivers');
    const q = query(driversRef, where('userId', '==', userId), limit(1));
    
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data() as Driver;
    }

    return null;
  } catch (error) {
    console.error('[driver.service] getDriverByUserId failed:', error);
    throw error;
  }
};

/**
 * Mettre à jour le statut d'un chauffeur
 */
export const updateDriverStatus = async (
  driverId: string,
  status: DriverStatus
): Promise<void> => {
  try {
    const driverRef = doc(db, 'drivers', driverId);

    await updateDoc(driverRef, {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[driver.service] updateDriverStatus failed:', error);
    throw error;
  }
};

/**
 * Mettre à jour la position du chauffeur
 */
export const updateDriverLocation = async (
  driverId: string,
  location: Location
): Promise<void> => {
  try {
    const driverRef = doc(db, 'drivers', driverId);
    
    await updateDoc(driverRef, {
      currentLocation: location,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[driver.service] updateDriverLocation failed:', error);
    throw error;
  }
};

/**
 * Passer en ligne / hors ligne
 */
export const toggleDriverOnline = async (
  driverId: string,
  isOnline: boolean
): Promise<void> => {
  try {
    const status: DriverStatus = isOnline ? 'available' : 'offline';
    await updateDriverStatus(driverId, status);
  } catch (error) {
    console.error('[driver.service] toggleDriverOnline failed:', error);
    throw error;
  }
};

/**
 * Récupérer les chauffeurs disponibles
 */
export const getAvailableDrivers = async (): Promise<Driver[]> => {
  try {
    const driversRef = collection(db, 'drivers');
    const q = query(
      driversRef,
      where('status', '==', 'available'),
      where('verified', '==', true),
      limit(LIMITS.DEFAULT_QUERY_LIMIT)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Driver);
  } catch (error) {
    console.error('[driver.service] getAvailableDrivers failed:', error);
    throw error;
  }
};

/**
 * Ajouter une évaluation pour un chauffeur
 */
export const addRating = async (
  bookingId: string,
  driverId: string,
  userId: string,
  rating: number,
  comment?: string
): Promise<void> => {
  try {
    const ratingsRef = collection(db, 'ratings');
    const newRatingRef = doc(ratingsRef);

    const ratingData: Rating = {
      id: newRatingRef.id,
      bookingId,
      driverId,
      userId,
      rating,
      comment,
      createdAt: serverTimestamp() as Timestamp,
    };

    await setDoc(newRatingRef, ratingData);

    await updateDriverRating(driverId, rating);
  } catch (error) {
    console.error('[driver.service] addRating failed:', error);
    throw error;
  }
};

/**
 * Mettre à jour la note moyenne du chauffeur avec une moyenne incrémentale.
 * Évite de relire tous les avis à chaque mise à jour.
 */
const updateDriverRating = async (driverId: string, newRating: number): Promise<void> => {
  try {
    const driverRef = doc(db, 'drivers', driverId);

    await runTransaction(db, async (tx) => {
      const driverSnap = await tx.get(driverRef);
      if (!driverSnap.exists()) return;

      const data = driverSnap.data();
      const oldCount: number = data.totalRatings ?? 0;
      const oldRating: number = data.rating ?? 0;
      const newCount = oldCount + 1;
      const newAvg = (oldRating * oldCount + newRating) / newCount;

      tx.update(driverRef, {
        rating: Math.round(newAvg * 10) / 10,
        totalRatings: increment(1),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    console.error('[driver.service] updateDriverRating failed:', error);
    throw error;
  }
};

/**
 * Incrémenter le nombre de courses d'un chauffeur
 */
export const incrementDriverTrips = async (driverId: string): Promise<void> => {
  try {
    const driverRef = doc(db, 'drivers', driverId);
    await updateDoc(driverRef, {
      totalTrips: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[driver.service] incrementDriverTrips failed:', error);
    throw error;
  }
};

/**
 * Incrémenter le nombre de courses acceptées
 */
export const incrementDriverAcceptedTrips = async (driverId: string): Promise<void> => {
  try {
    const driverRef = doc(db, 'drivers', driverId);
    await updateDoc(driverRef, {
      tripsAccepted: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[driver.service] incrementDriverAcceptedTrips failed:', error);
    throw error;
  }
};

/**
 * Incrémenter le nombre de courses refusées
 */
export const incrementDriverDeclinedTrips = async (driverId: string): Promise<void> => {
  try {
    const driverRef = doc(db, 'drivers', driverId);
    await updateDoc(driverRef, {
      tripsDeclined: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[driver.service] incrementDriverDeclinedTrips failed:', error);
    throw error;
  }
};

/**
 * Récupérer les évaluations d'un chauffeur
 */
export const getDriverRatings = async (driverId: string): Promise<Rating[]> => {
  try {
    const ratingsRef = collection(db, 'ratings');
    const q = query(
      ratingsRef,
      where('driverId', '==', driverId),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Rating);
  } catch (error) {
    console.error('[driver.service] getDriverRatings failed:', error);
    throw error;
  }
};

/**
 * Vérifier un chauffeur (admin)
 */
export const verifyDriver = async (driverId: string): Promise<void> => {
  try {
    const driverRef = doc(db, 'drivers', driverId);
    
    await updateDoc(driverRef, {
      verified: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[driver.service] verifyDriver failed:', error);
    throw error;
  }
};
