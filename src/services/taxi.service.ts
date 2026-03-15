/**
 * Service de Gestion des Taxis
 *
 * Gère les réservations, le calcul de prix,
 * et la recherche de chauffeurs.
 *
 * @module services/taxi
 */
//  Retiré eslint-disable @typescript-eslint/no-explicit-any (medJira.md #116)

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
import { Booking, BookingStatus, CarType, Location } from '@/types';
import { calculateTripPrice } from '@/lib/firebase-helpers';
import { CURRENCY_CODE, DEFAULT_PRICING } from '@/utils/constants';

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
    const pickupLocation = bookingData.pickupLocation; // Capture pour TypeScript
    
    // Exécuter le matching en arrière-plan pour ne pas bloquer l'interface utilisateur
    (async () => {
      try {
        const { findDriverWithRetry } = await import('./matching');

        // Utiliser le retry automatique avec périmètre
        // Plan A : 3-5 minutes initialement
        const result = await findDriverWithRetry(
          newBookingRef.id,
          pickupLocation,
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
      } catch (error: unknown) {
        // Ne pas bloquer la création si le matching échoue
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        logger.warn('Erreur lors du matching automatique', { error: errorMessage, bookingId: newBookingRef.id });
      }
    })();
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

  //  Utilisation de Record<string, unknown> pour plus de flexibilité avec serverTimestamp()
  const updateData: Record<string, unknown> = {
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
 * Annuler une réservation et libérer le chauffeur assigné
 */
export const cancelBooking = async (bookingId: string, reason?: string): Promise<void> => {
  // Récupérer le booking pour libérer le chauffeur
  const bookingRef = doc(db, 'bookings', bookingId);
  const bookingSnap = await getDoc(bookingRef);

  if (bookingSnap.exists()) {
    const booking = bookingSnap.data() as Booking;

    // Libérer le chauffeur s'il y en a un assigné
    if (booking.driverId) {
      try {
        const driverRef = doc(db, 'drivers', booking.driverId);
        await updateDoc(driverRef, {
          status: 'available',
          isAvailable: true,
          currentBookingId: null,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        logger.error('Erreur lors de la libération du chauffeur', { error, driverId: booking.driverId });
      }
    }
  }

  await updateBookingStatus(bookingId, 'cancelled', { reason });
};

/**
 * Récupérer les types de véhicules disponibles
 */
export const getCarTypes = async (): Promise<CarType[]> => {
  const carTypesRef = collection(db, 'carTypes');
  const q = query(carTypesRef, limit(50));
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs
    .map(snapshot => {
      const raw = snapshot.data() as Record<string, unknown>;

      const basePrice =
        typeof raw.basePrice === 'number'
          ? raw.basePrice
          : typeof raw.baseFare === 'number'
            ? raw.baseFare
            : DEFAULT_PRICING.BASE_PRICE;

      const pricePerKm =
        typeof raw.pricePerKm === 'number'
          ? raw.pricePerKm
          : typeof raw.price_per_km === 'number'
            ? raw.price_per_km
            : DEFAULT_PRICING.PRICE_PER_KM;

      const pricePerMinute =
        typeof raw.pricePerMinute === 'number'
          ? raw.pricePerMinute
          : typeof raw.price_per_minute === 'number'
            ? raw.price_per_minute
            : DEFAULT_PRICING.PRICE_PER_MINUTE;

      const carType: CarType = {
        id: (raw.id as string) || snapshot.id,
        name: (raw.name as string) || 'Standard',
        basePrice,
        pricePerKm,
        pricePerMinute,
        image: (raw.image as string) || (raw.imageUrl as string) || '',
        seats: (raw.seats as number) || (raw.capacity as number) || 4,
        time: (raw.time as string) || '2-4 min',
        order: (raw.order as number) ?? 0,
      };

      return carType;
    })
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
    } catch (directionsError: unknown) {
      // Si Directions API échoue, essayer avec Geocoding pour obtenir les coordonnées
      const errorMessage = directionsError instanceof Error ? directionsError.message : 'Erreur inconnue';
      logger.warn('Directions API échoué, tentative avec Geocoding', { error: errorMessage });

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
      } catch (geocodingError: unknown) {
        // On utilise l'erreur de géocodage pour enrichir le log
        const geoErrorMessage = geocodingError instanceof Error ? geocodingError.message : 'Erreur inconnue';
        logger.error('Le Geocoding de secours a aussi échoué', { error: geoErrorMessage });
        console.log("Le Geocoding de secours a aussi échoué", { error: geoErrorMessage });

        // Si tout échoue, relancer l'erreur originale
        const directionsErrorMessage = directionsError instanceof Error ? directionsError.message : 'Erreur inconnue';
        throw new Error(`Impossible de calculer l'itinéraire: ${directionsErrorMessage}. Vérifiez que les adresses sont correctes et que l'API Directions est activée.`);
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
    currency: CURRENCY_CODE,
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
  //  Ajout limit(50) pour optimiser les coûts Firestore (medJira.md #57)
  const q = query(
    driversRef,
    where('status', '==', 'available'),
    limit(50)
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

// Note: L'assignation de chauffeur se fait via le service matching/assignment.ts
// qui utilise une transaction Firestore atomique (runTransaction) pour éviter les conflits de concurrence.
// Ne pas utiliser de doublon ici.

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

/**
 * Mettre à jour la localisation du chauffeur pour une course
 */
export const updateDriverLocation = async (
  bookingId: string,
  location: Location
): Promise<void> => {
  const bookingRef = doc(db, 'bookings', bookingId);
  await updateDoc(bookingRef, {
    driverLocation: location,
    updatedAt: serverTimestamp(),
  });
};

export const updatePassengerLocation = async (
  bookingId: string,
  location: Location
): Promise<void> => {
  const bookingRef = doc(db, 'bookings', bookingId);
  await updateDoc(bookingRef, {
    passengerLocation: location,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Mettre à jour la destination (changement par le client)
 * Recalcule le prix estimé
 */
export const updateDestination = async (
  bookingId: string,
  newDestination: string,
  newDestinationLocation?: Location
): Promise<void> => {
  const bookingRef = doc(db, 'bookings', bookingId);
  const bookingSnap = await getDoc(bookingRef);

  if (!bookingSnap.exists()) throw new Error('Réservation introuvable');
  
  const booking = bookingSnap.data() as Booking;
  
  // Recalculer l'itinéraire et le prix
  let newPrice = booking.price;
  let newDistance = booking.distance;
  let newDuration = booking.duration;

  try {
    // Si on a la localisation actuelle du chauffeur (ou pickup si pas encore parti)
    const startLocation = booking.status === 'in_progress' && booking.driverLocation 
      ? booking.driverLocation 
      : booking.pickupLocation || booking.pickup;

    // Note: On suppose que startLocation est utilisable par estimateFare
    // Dans une implémentation réelle, il faudrait gérer les types Location vs string plus finement
    const estimate = await estimateFare({
      from: typeof startLocation === 'object' ? `${startLocation.lat},${startLocation.lng}` : booking.pickup,
      to: newDestination,
      type: booking.carType
    });

    newPrice = estimate.price;
    newDistance = estimate.distance;
    newDuration = estimate.duration;
  } catch (error) {
    logger.warn('Impossible de recalculer le prix exact, estimation approximative', { error });
  }

  await updateDoc(bookingRef, {
    destination: newDestination,
    destinationLocation: newDestinationLocation,
    price: newPrice, // Mise à jour du prix estimé
    distance: newDistance,
    duration: newDuration,
    updatedAt: serverTimestamp(),
  });
};

/**
 * Calculer le prix final de la course basé sur la durée réelle
 */
export const calculateFinalFare = async (bookingId: string): Promise<number> => {
  const bookingRef = doc(db, 'bookings', bookingId);
  const bookingSnap = await getDoc(bookingRef);

  if (!bookingSnap.exists()) throw new Error('Réservation introuvable');
  const booking = bookingSnap.data() as Booking;

  // Calculer la durée réelle depuis le début de la course
  const startTime = booking.startedAt instanceof Timestamp
    ? booking.startedAt.toDate()
    : (booking.startedAt ? new Date(booking.startedAt as any) : null);

  if (!startTime) {
    // Course pas encore démarrée, retourner le prix estimé
    return booking.price;
  }

  const endTime = new Date();
  const durationMinutes = Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 60000));

  // Récupérer les tarifs du type de véhicule
  const carTypes = await getCarTypes();
  const carType = carTypes.find(ct => ct.name === booking.carType) || carTypes[0];

  if (!carType) return booking.price;

  return calculateTripPrice(
    booking.distance,
    durationMinutes,
    carType.basePrice,
    carType.pricePerKm,
    carType.pricePerMinute
  );
};

/**
 * Marquer le chauffeur comme arrivé au point de prise en charge
 * Envoie une notification au client
 */
export const markDriverArrived = async (bookingId: string): Promise<void> => {
  await updateBookingStatus(bookingId, 'driver_arrived');
  
  // Envoyer une notification au client via le chat système
  try {
    const { sendSystemMessage } = await import('@/services/chat.service');
    await sendSystemMessage(bookingId, '🚗 Votre chauffeur est arrivé au point de rendez-vous !');
  } catch (error) {
    logger.error('Erreur envoi message système', { error, bookingId });
  }
};

/**
 * Démarrer la course (client à bord)
 * Active le suivi GPS en temps réel
 */
export const startTrip = async (bookingId: string): Promise<void> => {
  await updateBookingStatus(bookingId, 'in_progress', {
    startedAt: serverTimestamp() as any
  });
  
  // Notification système
  try {
    const { sendSystemMessage } = await import('@/services/chat.service');
    await sendSystemMessage(bookingId, ' Course démarrée ! Bon trajet !');
  } catch (error) {
    logger.error('Erreur envoi message système', { error, bookingId });
  }
};

/**
 * Terminer la course et calculer le prix final
 * Affiche une facture détaillée au client
 */
export const completeTrip = async (bookingId: string): Promise<void> => {
  const bookingRef = doc(db, 'bookings', bookingId);
  const bookingSnap = await getDoc(bookingRef);
  
  if (!bookingSnap.exists()) throw new Error('Booking not found');
  const booking = bookingSnap.data() as Booking;

  // Calcul du prix final basé sur la durée réelle
  const startTime = booking.startedAt instanceof Timestamp ? booking.startedAt.toDate() : new Date();
  const endTime = new Date();
  // Durée en minutes (minimum 1 minute)
  const durationMinutes = Math.max(1, Math.ceil((endTime.getTime() - startTime.getTime()) / 60000));
  
  // Récupérer les tarifs
  const carTypes = await getCarTypes();
  const carType = carTypes.find(ct => ct.name === booking.carType) || carTypes[0];
  
  // Recalculer le prix final
  const finalPrice = calculateTripPrice(
    booking.distance,
    durationMinutes,
    carType.basePrice,
    carType.pricePerKm,
    carType.pricePerMinute
  );

  await updateBookingStatus(bookingId, 'completed', {
    finalPrice: finalPrice,
    price: finalPrice,
    actualDuration: durationMinutes,
    completedAt: serverTimestamp() as any
  });
  
  // Libérer le chauffeur
  if (booking.driverId) {
    const driverRef = doc(db, 'drivers', booking.driverId);
    await updateDoc(driverRef, {
      status: 'available',
      currentBookingId: null
    });
  }
  
  // Envoyer la facture détaillée
  try {
    const { sendSystemMessage } = await import('@/services/chat.service');
    const invoice = `🏁 Course terminée !\n\n📋 Facture détaillée :\n• Tarif de base : ${carType.basePrice} CAD\n• Distance (${booking.distance.toFixed(2)} km) : ${(booking.distance * carType.pricePerKm).toFixed(2)} CAD\n• Durée (${durationMinutes} min) : ${(durationMinutes * carType.pricePerMinute).toFixed(2)} CAD\n\n💰 Total : ${finalPrice.toFixed(2)} CAD\n\nMerci pour votre confiance ! 🙏`;
    await sendSystemMessage(bookingId, invoice);
  } catch (error) {
    logger.error('Erreur envoi facture', { error, bookingId });
  }
};

/**
 * Calculer les pénalités d'annulation après le début de la course
 */
export const calculateCancellationPenalty = async (bookingId: string): Promise<number> => {
  const bookingRef = doc(db, 'bookings', bookingId);
  const bookingSnap = await getDoc(bookingRef);
  
  if (!bookingSnap.exists()) return 0;
  const booking = bookingSnap.data() as Booking;
  
  // Pas de pénalité si la course n'a pas démarré
  if (booking.status !== 'in_progress' || !booking.startedAt) {
    return 0;
  }
  
  // Calculer le temps écoulé depuis le début
  const startTime = booking.startedAt instanceof Timestamp ? booking.startedAt.toDate() : new Date();
  const now = new Date();
  const elapsedMinutes = Math.ceil((now.getTime() - startTime.getTime()) / 60000);
  
  // Récupérer les tarifs
  const carTypes = await getCarTypes();
  const carType = carTypes.find(ct => ct.name === booking.carType) || carTypes[0];
  
  // Pénalité = 50% du tarif de base + temps x tarif minute
  const penalty = (carType.basePrice * 0.5) + (elapsedMinutes * carType.pricePerMinute);

  return Math.round(Math.max(penalty, 2) * 100) / 100; // Minimum 2 CAD
};

/**
 * Débiter la pénalité d'annulation du portefeuille de l'utilisateur
 * et libérer le chauffeur
 */
export const debitCancellationPenalty = async (
  bookingId: string,
  userId: string,
  penalty: number
): Promise<void> => {
  if (penalty <= 0) return;

  try {
    const { payBooking } = await import('@/services/wallet.service');
    await payBooking(userId, bookingId, penalty);
    logger.info('Pénalité d\'annulation débitée', { bookingId, userId, penalty });
  } catch (error) {
    // Si le solde est insuffisant, on log mais on ne bloque pas l'annulation
    logger.error('Erreur lors du débit de la pénalité d\'annulation', { error, bookingId, penalty });
  }
};
