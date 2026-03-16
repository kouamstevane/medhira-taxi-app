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

/**
 * Créer ou mettre à jour un profil chauffeur
 */
export const createOrUpdateDriver = async (
  driverId: string,
  driverData: Partial<Driver>
): Promise<void> => {
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
};

/**
 * Récupérer un chauffeur par ID
 */
export const getDriverById = async (driverId: string): Promise<Driver | null> => {
  const driverRef = doc(db, 'drivers', driverId);
  const driverSnap = await getDoc(driverRef);

  if (driverSnap.exists()) {
    return driverSnap.data() as Driver;
  }

  return null;
};

/**
 * Récupérer un chauffeur par userId
 */
export const getDriverByUserId = async (userId: string): Promise<Driver | null> => {
  const driversRef = collection(db, 'drivers');
  const q = query(driversRef, where('userId', '==', userId));
  
  const querySnapshot = await getDocs(q);
  
  if (!querySnapshot.empty) {
    return querySnapshot.docs[0].data() as Driver;
  }

  return null;
};

/**
 * Mettre à jour le statut d'un chauffeur
 */
export const updateDriverStatus = async (
  driverId: string,
  status: DriverStatus
): Promise<void> => {
  const driverRef = doc(db, 'drivers', driverId);
  
  await updateDoc(driverRef, {
    status,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Mettre à jour la position du chauffeur
 */
export const updateDriverLocation = async (
  driverId: string,
  location: Location
): Promise<void> => {
  const driverRef = doc(db, 'drivers', driverId);
  
  await updateDoc(driverRef, {
    currentLocation: location,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Passer en ligne / hors ligne
 */
export const toggleDriverOnline = async (
  driverId: string,
  isOnline: boolean
): Promise<void> => {
  const status: DriverStatus = isOnline ? 'available' : 'offline';
  await updateDriverStatus(driverId, status);
};

/**
 * Récupérer les chauffeurs disponibles
 */
export const getAvailableDrivers = async (): Promise<Driver[]> => {
  const driversRef = collection(db, 'drivers');
  //  Ajout limit(50) pour optimiser les coûts Firestore (medJira.md #57)
  const q = query(
    driversRef,
    where('status', '==', 'available'),
    where('verified', '==', true),
    limit(50)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as Driver);
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
  // Créer l'évaluation
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

  // Mettre à jour la note moyenne du chauffeur
  await updateDriverRating(driverId, rating);
};

/**
 * Mettre à jour la note moyenne du chauffeur avec une moyenne incrémentale.
 * Évite de relire tous les avis à chaque mise à jour.
 */
const updateDriverRating = async (driverId: string, newRating: number): Promise<void> => {
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
};

/**
 * Incrémenter le nombre de courses d'un chauffeur
 */
export const incrementDriverTrips = async (driverId: string): Promise<void> => {
  const driverRef = doc(db, 'drivers', driverId);
  const driverSnap = await getDoc(driverRef);

  if (driverSnap.exists()) {
    const currentTrips = driverSnap.data().totalTrips || 0;
    
    await updateDoc(driverRef, {
      totalTrips: currentTrips + 1,
      updatedAt: serverTimestamp(),
    });
  }
};

/**
 * Incrémenter le nombre de courses acceptées
 */
export const incrementDriverAcceptedTrips = async (driverId: string): Promise<void> => {
  const driverRef = doc(db, 'drivers', driverId);
  const driverSnap = await getDoc(driverRef);

  if (driverSnap.exists()) {
    const currentAccepted = driverSnap.data().tripsAccepted || 0;
    
    await updateDoc(driverRef, {
      tripsAccepted: currentAccepted + 1,
      updatedAt: serverTimestamp(),
    });
  }
};

/**
 * Incrémenter le nombre de courses refusées
 */
export const incrementDriverDeclinedTrips = async (driverId: string): Promise<void> => {
  const driverRef = doc(db, 'drivers', driverId);
  const driverSnap = await getDoc(driverRef);

  if (driverSnap.exists()) {
    const currentDeclined = driverSnap.data().tripsDeclined || 0;
    
    await updateDoc(driverRef, {
      tripsDeclined: currentDeclined + 1,
      updatedAt: serverTimestamp(),
    });
  }
};

/**
 * Récupérer les évaluations d'un chauffeur
 */
export const getDriverRatings = async (driverId: string): Promise<Rating[]> => {
  const ratingsRef = collection(db, 'ratings');
  //  Ajout limit(20) - 20 dernières notes suffisent (medJira.md #57)
  const q = query(
    ratingsRef,
    where('driverId', '==', driverId),
    orderBy('createdAt', 'desc'),
    limit(20)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as Rating);
};

/**
 * Vérifier un chauffeur (admin)
 */
export const verifyDriver = async (driverId: string): Promise<void> => {
  const driverRef = doc(db, 'drivers', driverId);
  
  await updateDoc(driverRef, {
    verified: true,
    updatedAt: serverTimestamp(),
  });
};
