/**
 * Types partagés pour les courses/trips
 *
 * Ces types sont utilisés à travers le dashboard chauffeur,
 * les composants de cartes de course, et les services de matching.
 */

export interface PreciseLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface BaseTrip {
  id: string;
  userId: string; // ID du client pour le chat
  passengerName: string;
  pickup: string;
  destination: string;
  price: number;
  status: 'pending' | 'accepted' | 'driver_arrived' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date | import('firebase/firestore').Timestamp | string | null;
  unreadMessages?: {
    client: number;
    driver: number;
  };
  // Coordonnées GPS précises pour la navigation
  pickupLocation?: PreciseLocation;
  pickupLocationAccuracy?: number; // Précision en mètres
  destinationLocation?: PreciseLocation;
  driverLocation?: PreciseLocation;
  passengerLocation?: PreciseLocation;
}

export type Trip = BaseTrip;

export interface RideRequest {
  rideId: string;
  candidate: import('./matching').RideCandidate;
  bookingData?: {
    pickup: string;
    destination: string;
    price: number;
    distance?: number;
    duration?: number;
  };
}
