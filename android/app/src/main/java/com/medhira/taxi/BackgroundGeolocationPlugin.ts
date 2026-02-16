import { registerPlugin } from '@capacitor/core';

/**
 * Interface strict TypeScript pour background geolocation
 * Respecte medJiraV2.md : §5.2, §7.1, §8.2
 */

export interface StartTrackingOptions {
    driverId: string;      // Requis RGPD §8.2 (traçabilité consentement)
    tripId?: string;       // Optionnel si en attente de course
    throttleInterval?: number;  // Override 1Hz (ms)
}

export interface TrackingStatus {
    isTracking: boolean;
    hasPermissions: boolean;
    lastLocation?: {
        lat: number;
        lng: number;
        timestamp: number;
        accuracy: number;
    };
}

export interface BackgroundGeolocationPlugin {
    /**
     * Démarre le tracking avec consentement RGPD traçable
     * @throws Error si permissions refusées ou driverId manquant
     */
    startTracking(options: StartTrackingOptions): Promise<void>;

    /**
     * Arrête le tracking et nettoie les ressources
     * Déclenche anonymisation côté Firebase (§8.2)
     */
    stopTracking(): Promise<{ stopped: boolean }>;

    /**
     * État courant sans appel natif (cache local)
     */
    getCurrentStatus(): Promise<TrackingStatus>;
}

// Registration plugin Capacitor
export const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
    'BackgroundGeolocation'
);