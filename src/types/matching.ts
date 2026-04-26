/**
 * Types spécifiques au système de matching et candidatures
 * 
 * @module types/matching
 */

import { Timestamp } from 'firebase/firestore';
import { Location } from './booking';

/**
 * Statut d'une candidature de chauffeur
 */
export type CandidateStatus = 'pending' | 'accepted' | 'declined' | 'expired';

/**
 * Candidature d'un chauffeur pour une course
 */
export interface RideCandidate {
    rideId: string;
    driverId: string;
    status: CandidateStatus;
    expiresAt: Timestamp;
    createdAt: Timestamp;
    distance?: number; // Distance en km
    score?: number; // Score du chauffeur

    // Nouveau : Temps de trajet et bonus
    travelTimeMinutes?: number; // Temps de trajet estimé en minutes
    bonus?: number; // Montant du bonus pour cette course

    // Timestamps d'actions
    acceptedAt?: Timestamp;
    declinedAt?: Timestamp;
    expiredAt?: Timestamp;
}

/**
 * Paramètres pour la diffusion d'une course
 */
export interface BroadcastRideParams {
    rideId: string;
    pickupLocation: Location;
    destination: string;
    price: number;
    carType?: string;
    rangeKm?: number; // Rayon en km (pour référence)
    maxTravelMinutes?: number; // Périmètre en minutes (Plan A)
    timeoutSeconds?: number; // Délai avant expiration
    bonus?: number; // Montant du bonus (Plan B)
}

/**
 * Chauffeur disponible trouvé
 */
export interface AvailableDriver {
    driverId: string;
    driverName: string;
    location: Location;
    distance: number; // Distance en km
    travelTimeMinutes?: number; // Temps de trajet en minutes
    score: number; // Score combiné (rating + acceptRate)
    rating: number;
    acceptRate: number;
    isAvailable: boolean;
    carModel?: string;
    carPlate?: string;
    carColor?: string;
}

/**
 * Configuration pour la recherche de chauffeurs
 */
export interface FindDriversConfig {
    location: Location;
    rangeKm?: number; // Rayon maximal en km
    maxTravelMinutes: number; // Périmètre en minutes (3-5 min par défaut)
    maxResults?: number;
    carType?: string;
    useDirectionsAPI?: boolean; // Utiliser Directions API ou estimation
}

/**
 * Résultat d'une tentative de recherche de chauffeur
 */
export interface DriverSearchResult {
    success: boolean;
    driversNotified: number;
    finalRange: number; // Rayon final utilisé (en km)
    finalTravelTime: number; // Temps de trajet final utilisé (en minutes)
    bonusActivated: boolean; // Si le bonus a été activé
}

/**
 * Métriques de matching pour l'audit
 */
export interface MatchingMetrics {
    rideId: string;
    timestamp: Date;
    initialRange: number; // Rayon initial (km)
    initialTravelTime: number; // Temps initial (minutes)
    finalRange: number;
    finalTravelTime: number;
    retryCount: number;
    driversNotified: number;
    success: boolean;
    duration: number; // en millisecondes
    bonusUsed?: number; // Montant du bonus si utilisé
}
