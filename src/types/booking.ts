/**
 * Types liés aux réservations de taxi
 * 
 * @module types/booking
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Coordonnées géographiques
 */
export interface Location {
  lat: number;
  lng: number;
}

/**
 * Suggestion d'adresse pour l'autocomplétion Google Maps
 */
export interface PlaceSuggestion {
  description: string;
  place_id: string;
}

/**
 * Statut d'une réservation
 */
export type BookingStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'failed';

/**
 * Interface pour une réservation de taxi
 */
export interface Booking {
  id: string;
  userId: string;
  userEmail?: string | null;
  pickup: string;
  destination: string;
  pickupLocation?: Location;
  destinationLocation?: Location;
  distance: number;
  duration: number;
  price: number;
  finalPrice?: number;
  carType: string;
  status: BookingStatus;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  driverLocation?: Location;
  carModel?: string;
  carColor?: string;
  carPlate?: string;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
  completedAt?: Date | Timestamp;
  cancelledAt?: Date | Timestamp;
  reason?: string;
}

/**
 * Type de véhicule disponible
 */
export interface CarType {
  id: string;
  name: string;
  basePrice: number;
  pricePerKm: number;
  pricePerMinute: number;
  image: string;
  seats: number;
  time: string;
  order?: number;
}

/**
 * Configuration de tarification
 */
export interface PricingConfig {
  basePrice: number;
  pricePerKm: number;
  pricePerMinute: number;
  peakHourMultiplier: number;
  trafficMultiplier: number;
  discountRate: number;
}

/**
 * Résultat du calcul de prix (pour affichage détaillé)
 */
export interface PriceCalculation {
  basePrice: number;
  distancePrice: number;
  durationPrice: number;
  carTypeMultiplier: number;
  peakHourMultiplier: number;
  trafficMultiplier: number;
  totalPrice: number;
  currency: string;
}
