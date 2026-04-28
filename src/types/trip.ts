/**
 * Types partagés pour les courses/trips
 *
 * Ces types sont utilisés à travers le dashboard chauffeur,
 * les composants de cartes de course, et les services de matching.
 */

import { PreciseLocation } from './booking';

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
  pickupLocation?: PreciseLocation;
  pickupLocationAccuracy?: number;
  destinationLocation?: PreciseLocation;
  driverLocation?: PreciseLocation;
  passengerLocation?: PreciseLocation;
  bookedForSomeoneElse?: boolean;
  passengerPhone?: string;
  passengerNotes?: string;
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
    bookedForSomeoneElse?: boolean;
    passengerName?: string;
    passengerPhone?: string;
    passengerNotes?: string;
  };
}
