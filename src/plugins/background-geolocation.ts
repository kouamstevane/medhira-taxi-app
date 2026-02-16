import { registerPlugin } from '@capacitor/core';

/**
 * Interface strict TypeScript pour background geolocation
 * Architecture : Event-based (Uber-level)
 * Respecte medJiraV2.md : §5.2, §7.1, §8.2
 */

export interface LocationData {
    lat: number;
    lng: number;
    accuracy: number;
    speed: number;
    heading: number;
    timestamp: number;
}

export interface StartTrackingOptions {
    driverId: string;      // Requis RGPD §8.2 (traçabilité consentement)
    tripId?: string;       // Optionnel si en attente de course
    throttleInterval?: number;  // Override 1Hz (ms)
}

export interface TrackingStatus {
    isTracking: boolean;
    hasPermissions: boolean;
    lastLocation?: LocationData;
}

export interface BackgroundGeolocationPlugin {
    /**
     * Démarre le tracking avec consentement RGPD traçable
     * @throws Error si permissions refusées ou driverId manquant
     * 
     * NOTE: Le plugin émettra des événements 'location' automatiquement
     * Utiliser addListener('location', callback) pour les recevoir
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

    /**
     * Ajoute un listener pour les événements de localisation
     * @param eventName 'location' pour recevoir les mises à jour GPS
     * @param callback Fonction appelée à chaque mise à jour (throttled 1Hz)
     * @returns Fonction de suppression du listener
     */
    addListener(eventName: 'location', callback: (data: LocationData) => void): Promise<{
        remove: () => Promise<void>;
    }>;

    /**
     * Supprime tous les listeners
     */
    removeAllListeners(): Promise<void>;
}

// Registration plugin Capacitor
export const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
    'BackgroundGeolocation'
);
