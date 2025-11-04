/**
 * Service de Gestion des Taxis
 * 
 * Gère les réservations, le calcul de prix,
 * et la recherche de chauffeurs.
 * 
 * @module services/taxi
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
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Booking, BookingStatus, CarType, Driver, Location } from '@/types';
import { calculateTripPrice, isPeakHour } from '@/lib/firebase-helpers';

/**
 * Créer une nouvelle réservation
 */
export const createBooking = async (bookingData: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  const bookingsRef = collection(db, 'bookings');
  const newBookingRef = doc(bookingsRef);
  
  const booking: Booking = {
    ...bookingData,
    id: newBookingRef.id,
    status: 'pending',
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };
  
  await setDoc(newBookingRef, booking);
  return newBookingRef.id;
};

/**
 * Récupérer une réservation par ID
 */
export const getBookingById = async (bookingId: string): Promise<Booking | null> => {
  const bookingRef = doc(db, 'bookings', bookingId);
  const bookingSnap = await getDoc(bookingRef);
  
  if (bookingSnap.exists()) {
    return bookingSnap.data() as Booking;
  }
  
  return null;
};

/**
 * Récupérer les réservations d'un utilisateur
 */
export const getUserBookings = async (userId: string, limitCount: number = 10): Promise<Booking[]> => {
  const bookingsRef = collection(db, 'bookings');
  const q = query(
    bookingsRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as Booking);
};

/**
 * Mettre à jour le statut d'une réservation
 */
export const updateBookingStatus = async (
  bookingId: string,
  status: BookingStatus,
  additionalData?: Partial<Booking>
): Promise<void> => {
  const bookingRef = doc(db, 'bookings', bookingId);
  
  const updateData: any = {
    status,
    updatedAt: serverTimestamp(),
    ...additionalData,
  };
  
  // Ajouter des timestamps spécifiques selon le statut
  if (status === 'completed') {
    updateData.completedAt = serverTimestamp();
  } else if (status === 'cancelled') {
    updateData.cancelledAt = serverTimestamp();
  }
  
  await updateDoc(bookingRef, updateData);
};

/**
 * Annuler une réservation
 */
export const cancelBooking = async (bookingId: string, reason?: string): Promise<void> => {
  await updateBookingStatus(bookingId, 'cancelled', { reason });
};

/**
 * Récupérer les types de véhicules disponibles
 */
export const getCarTypes = async (): Promise<CarType[]> => {
  const carTypesRef = collection(db, 'carTypes');
  const querySnapshot = await getDocs(carTypesRef);
  
  return querySnapshot.docs
    .map(doc => doc.data() as CarType)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
};

/**
 * Calculer le prix d'une course
 */
export const calculatePrice = (
  distance: number,
  duration: number,
  carType: CarType
): number => {
  return calculateTripPrice(
    distance,
    duration,
    carType.basePrice,
    carType.pricePerKm,
    carType.pricePerMinute
  );
};

/**
 * Rechercher des chauffeurs disponibles à proximité
 */
export const findNearbyDrivers = async (
  location: Location,
  maxDistance: number = 10 // km
): Promise<Driver[]> => {
  // Note: Cette implémentation simplifiée devrait utiliser GeoFirestore
  // pour une recherche géographique efficace
  const driversRef = collection(db, 'drivers');
  const q = query(
    driversRef,
    where('status', '==', 'available'),
    limit(10)
  );
  
  const querySnapshot = await getDocs(q);
  const drivers = querySnapshot.docs.map(doc => doc.data() as Driver);
  
  // Filtrer par distance (simplifi�� - devrait utiliser GeoFirestore)
  return drivers.filter(driver => {
    if (!driver.currentLocation) return false;
    const distance = calculateDistance(location, driver.currentLocation);
    return distance <= maxDistance;
  });
};

/**
 * Assigner un chauffeur à une réservation
 */
export const assignDriver = async (bookingId: string, driverId: string): Promise<void> => {
  const driverRef = doc(db, 'drivers', driverId);
  const driverSnap = await getDoc(driverRef);
  
  if (!driverSnap.exists()) {
    throw new Error('Chauffeur introuvable');
  }
  
  const driver = driverSnap.data() as Driver;
  
  await updateBookingStatus(bookingId, 'accepted', {
    driverId,
    driverName: `${driver.firstName} ${driver.lastName}`,
    driverPhone: driver.phoneNumber,
    carModel: driver.carModel,
    carColor: driver.carColor,
    carPlate: driver.carPlate,
  });
  
  // Mettre à jour le statut du chauffeur
  await updateDoc(driverRef, {
    status: 'busy',
    updatedAt: serverTimestamp(),
  });
};

/**
 * Calculer la distance entre deux points (formule de Haversine)
 */
function calculateDistance(point1: Location, point2: Location): number {
  const R = 6371; // Rayon de la Terre en km
  const dLat = toRad(point2.lat - point1.lat);
  const dLon = toRad(point2.lng - point1.lng);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(point1.lat)) *
    Math.cos(toRad(point2.lat)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}
