/**
 * Types liés aux chauffeurs et véhicules
 * 
 * @module types/taxi
 */

import { Timestamp } from 'firebase/firestore';
import { Location } from './booking';

/**
 * Statut d'un chauffeur
 */
export type DriverStatus = 'offline' | 'available' | 'busy' | 'unavailable';

/**
 * Interface pour les données d'un chauffeur
 */
export interface Driver {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
  profileImageUrl?: string;
  status: DriverStatus;
  carModel?: string;
  carColor?: string;
  carPlate?: string;
  currentLocation?: Location;
  rating?: number;
  totalTrips?: number;
  verified: boolean;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

/**
 * Informations détaillées sur le véhicule (pour profil chauffeur)
 */
export interface VehicleInfo {
  make: string;
  model: string;
  year: number;
  color: string;
  licensePlate: string;
  seats: number;
  imageUrl?: string;
  insurance?: {
    provider: string;
    policyNumber: string;
    expiryDate: Date;
    verified: boolean;
  };
}

/**
 * Licence de conduite
 */
export interface DriverLicense {
  number: string;
  expiryDate: Date;
  verified: boolean;
  imageUrl?: string;
}

/**
 * Évaluation d'une course
 */
export interface Rating {
  id?: string;
  bookingId: string;
  driverId: string;
  userId: string;
  rating: number;
  comment?: string;
  createdAt?: Timestamp;
}

/**
 * Position en temps réel du chauffeur
 */
export interface LiveLocation {
  driverId: string;
  location: Location;
  heading?: number;
  speed?: number;
  timestamp: Timestamp;
}
