/**
 * Service de Gestion des Taxis
 * 
 * Gère les réservations, le calcul de prix,
 * et la recherche de chauffeurs.
 * 
 * @module services/taxi
 */

import { logger } from '@/utils/logger';
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

  // Déclencher le matching automatique avec retry si une localisation est disponible
  if (bookingData.pickupLocation) {
    try {
      const { findDriverWithRetry } = await import('./matching');

      // Utiliser le retry automatique avec périmètre
      // Plan A : 3-5 minutes initialement
      const result = await findDriverWithRetry(
        newBookingRef.id,
        bookingData.pickupLocation,
        bookingData.destination,
        bookingData.price,
        bookingData.carType,
        bookingData.bonus || 0, // Passer le bonus
        {
          initialPerimeterMinutes: 5, // Plan A: 5 min max
          expandedPerimeterMinutes: 10, // Plan B: 10 min max
          maxRetries: 3,
          timeoutSeconds: 30,
        }
      );

      logger.info('Matching automatique terminé', {
        bookingId: newBookingRef.id,
        success: result.success,
        driversNotified: result.driversNotified,
        finalPerimeter: result.finalPerimeter,
      });
    } catch (error: any) {
      // Ne pas bloquer la création si le matching échoue
      logger.warn('Erreur lors du matching automatique', { error, bookingId: newBookingRef.id });
    }
  }

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
    .map(doc => ({
      ...doc.data(),
      id: doc.data().id || doc.id, // Utiliser l'ID du document si pas présent dans les données
    } as CarType))
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
 * Interface pour l'estimation de tarif
 */
export interface FareEstimate {
  price: number;
  distance: number;
  duration: number;
  currency: string;
}

/**
 * Interface pour les paramètres d'estimation
 */
export interface EstimateFareParams {
  from: string | Location;
  to: string | Location;
  type: string; // ID du type de véhicule
}

/**
 * Estimer le tarif d'une course
 * 
 * @param params - Paramètres de la course (départ, destination, type de véhicule)
 * @returns Estimation du tarif avec distance et durée
 */
export const estimateFare = async (params: EstimateFareParams): Promise<FareEstimate> => {
  const { from, to, type } = params;

  // Récupérer le type de véhicule
  const carTypes = await getCarTypes();
  const carType = carTypes.find(ct => ct.id === type || ct.name.toLowerCase() === type.toLowerCase());

  if (!carType) {
    throw new Error(`Type de véhicule "${type}" introuvable`);
  }

  // Calculer la distance et la durée
  let distance: number;
  let duration: number;

  if (typeof from === 'string' && typeof to === 'string') {
    // Utiliser Google Directions API pour calculer distance et durée
    if (typeof window === 'undefined' || !window.google || !window.google.maps) {
      throw new Error('Google Maps API non chargée');
    }

    const directionsService = new window.google.maps.DirectionsService();

    try {
      const result = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
        directionsService.route(
          {
            origin: from,
            destination: to,
            travelMode: window.google.maps.TravelMode.DRIVING,
            provideRouteAlternatives: false,
          },
          (result: google.maps.DirectionsResult | null, status: google.maps.DirectionsStatus) => {
            if (status === 'OK' && result && result.routes && result.routes.length > 0) {
              resolve(result);
            } else if (status === 'ZERO_RESULTS') {
              reject(new Error('Aucun itinéraire trouvé entre ces deux points. Vérifiez les adresses.'));
            } else if (status === 'NOT_FOUND') {
              reject(new Error('Une ou plusieurs adresses n\'ont pas pu être trouvées. Vérifiez les adresses saisies.'));
            } else {
              reject(new Error(`Erreur calcul itinéraire: ${status}. Vérifiez que l'API Directions est activée.`));
            }
          }
        );
      });

      const route = result.routes[0];
      const leg = route.legs[0];

      if (!leg || !leg.distance || !leg.duration) {
        throw new Error('Impossible de calculer la distance et la durée');
      }

      distance = leg.distance.value / 1000; // Convertir en km
      duration = Math.ceil(leg.duration.value / 60); // Convertir en minutes
    } catch (directionsError: any) {
      // Si Directions API échoue, essayer avec Geocoding pour obtenir les coordonnées
      logger.warn('Directions API échoué, tentative avec Geocoding', { error: directionsError });

      try {
        const geocoder = new window.google.maps.Geocoder();

        // Géocoder les deux adresses
        const [fromResult, toResult] = await Promise.all([
          new Promise<google.maps.GeocoderResult>((resolve, reject) => {
            geocoder.geocode({ address: from }, (results, status) => {
              if (status === 'OK' && results && results.length > 0) {
                resolve(results[0]);
              } else {
                reject(new Error(`Impossible de géocoder le point de départ: ${status}`));
              }
            });
          }),
          new Promise<google.maps.GeocoderResult>((resolve, reject) => {
            geocoder.geocode({ address: to }, (results, status) => {
              if (status === 'OK' && results && results.length > 0) {
                resolve(results[0]);
              } else {
                reject(new Error(`Impossible de géocoder la destination: ${status}`));
              }
            });
          }),
        ]);

        const fromLocation = {
          lat: fromResult.geometry.location.lat(),
          lng: fromResult.geometry.location.lng(),
        };
        const toLocation = {
          lat: toResult.geometry.location.lat(),
          lng: toResult.geometry.location.lng(),
        };

        // Calculer avec la formule de Haversine
        distance = calculateDistance(fromLocation, toLocation);
        duration = Math.ceil((distance / 40) * 60); // Estimation: 40 km/h moyenne
      } catch (geocodingError: any) {
        // Si tout échoue, relancer l'erreur originale
        throw new Error(`Impossible de calculer l'itinéraire: ${directionsError.message}. Vérifiez que les adresses sont correctes et que l'API Directions est activée.`);
      }
    }
  } else if (typeof from === 'object' && typeof to === 'object') {
    // Calculer directement avec les coordonnées (formule de Haversine)
    distance = calculateDistance(from, to);
    // Estimation de durée basée sur la distance (vitesse moyenne 40 km/h)
    duration = Math.ceil((distance / 40) * 60);
  } else {
    throw new Error('Format de départ ou destination invalide');
  }

  // Calculer le prix
  const price = calculatePrice(distance, duration, carType);

  return {
    price,
    distance,
    duration,
    currency: 'FCFA',
  };
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
