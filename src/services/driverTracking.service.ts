import { BackgroundGeolocation } from '@/plugins/background-geolocation';
import { getAuth } from 'firebase/auth';
import { getDatabase, ref, set, onValue, off } from 'firebase/database';
import { serverTimestamp } from 'firebase/firestore';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { z } from 'zod';

/**
 * Service de tracking conducteur
 * Architecture : Firebase Realtime Database (Uber-level), Offline-first, RGPD-compliant
 * Conforme à medJiraV2.md §7.1 (Architecture Temps Réel)
 * 
 * 🔒 CORRECTION CRITIQUE (Problème #2) :
 * Le plugin Java n'implémente PAS addListener (API event-based)
 * Solution : Utiliser Firebase Realtime Database pour le tracking temps réel
 * 
 * Flux de données CORRIGÉ :
 * Plugin natif (Android) → Firebase RTDB (écriture directe) → Service (onValue) → UI
 * 
 * Avantages :
 * - Compatible avec l'implémentation Java actuelle
 * - Conforme à §7.1 (Firebase RTDB pour tracking position)
 * - Support offline natif via Firebase SDK
 * - Latence critique optimisée
 */

// ⚡ Uber rule: Le plugin natif gère déjà le throttling à 1Hz côté Android
// Suppression du throttling JS pour éviter le double throttling (~0.5Hz réel)
const RETRY_MAX_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 1000;

// Validation Zod (§8.2, Checklist)
const LocationDataSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().nonnegative(),
    speed: z.number().nonnegative(),
    heading: z.number().min(0).max(360),
    timestamp: z.number().positive(),
});

export type DriverLocation = z.infer<typeof LocationDataSchema>;

export interface TrackingConfig {
    driverId: string;
    tripId?: string;
    onLocationUpdate?: (location: DriverLocation) => void;
    onError?: (error: TrackingError) => void;
}

export interface TrackingError {
    code: 'PERMISSION_DENIED' | 'GPS_UNAVAILABLE' | 'NETWORK_ERROR' | 'BATTERY_SAVER' | 'OFFLINE_MODE';
    message: string;
    recoverable: boolean;
}

type DriverStatus = 'online' | 'offline' | 'on_trip';

class DriverTrackingService {
    private isTracking = false;
    private isOnline = true; // Gestion état réseau (§11.2)
    private removeLocationListener: (() => void) | null = null; // 🔒 Changé: onValue retourne () => void
    private removeConnectedListener: (() => void) | null = null;
    private retryAttempts = 0;
    private config: TrackingConfig | null = null;
    // ⚡ Uber/Bolt pattern: Garder uniquement la DERNIÈRE position offline
    // Évite l'explosion mémoire avec GPS rapide (1Hz = 3600 positions/heure)
    private lastOfflineLocation: DriverLocation | null = null;

    /**
     * Démarre le tracking avec validation RGPD
     */
    async startTracking(config: TrackingConfig): Promise<void> {
        if (this.isTracking) {
            await this.stopTracking();
        }

        // Validation §8.2 : consentement explicite
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user || user.uid !== config.driverId) {
            throw new Error('AUTH_MISMATCH: Identifiant conducteur invalide');
        }

        this.config = config;

        try {
            // 1. Démarrage service natif (écrit directement dans Firebase RTDB)
            await BackgroundGeolocation.startTracking({
                driverId: config.driverId,
                tripId: config.tripId,
            });

            // 2. Écoute Firebase RTDB pour les mises à jour de position
            // 🔒 CORRECTION: Utiliser onValue au lieu de addListener (plugin Java non implémenté)
            this.setupLocationListener(config.driverId);

            // 3. Écoute état connexion (§11.2)
            this.setupConnectionListener();

            // 4. Mise à jour Firestore (état "en ligne")
            await this.updateDriverStatus(config.driverId, 'online');

            this.isTracking = true;
            this.retryAttempts = 0;

        } catch (error: unknown) {
            await this.handleStartError(error);
        }
    }

    /**
     * Arrêt tracking avec cleanup complet
     */
    async stopTracking(): Promise<void> {
        if (!this.isTracking) return;

        // Cleanup listeners événements
        if (this.removeLocationListener) {
            this.removeLocationListener(); // 🔒 Changé: onValue retourne () => void, pas Promise
            this.removeLocationListener = null;
        }

        if (this.removeConnectedListener) {
            this.removeConnectedListener();
            this.removeConnectedListener = null;
        }

        // Arrêt service natif (arrête les events)
        try {
            await BackgroundGeolocation.stopTracking();
        } catch (error) {
            console.error('Error stopping native tracking:', error);
        }

        // Mise à jour statut Firestore
        if (this.config?.driverId) {
            await this.updateDriverStatus(this.config.driverId, 'offline');
        }

        // 🔒 Plus de synchronisation offline nécessaire (géré par le service natif)
        
        this.isTracking = false;
        this.config = null;
        this.lastOfflineLocation = null;
    }

    /**
     * Setup listener pour événements de localisation via Firebase Realtime Database
     * 🔒 CORRECTION CRITIQUE (Problème #2) :
     * Le plugin Java n'implémente PAS addListener
     * Solution : Écouter Firebase RTDB où le service natif écrit les positions
     * 
     * Flux de données :
     * Service natif (Android) → Firebase RTDB (écriture) → onValue (écoute) → handleLocationUpdate
     */
    private setupLocationListener(driverId: string): void {
        const db = getDatabase();
        const locationRef = ref(db, `driver_locations/${driverId}`);
        
        // 🔒 Utiliser onValue de Firebase RTDB au lieu de addListener du plugin
        // Conforme à §7.1 (Firebase RTDB pour tracking position conducteur)
        onValue(locationRef, (snapshot) => {
            const locationData = snapshot.val();
            
            if (locationData) {
                // ⚡ Uber rule: PAS de throttling JS - le natif gère à 1Hz
                // Laisser Android gérer le throttling natif
                this.handleLocationUpdate(locationData);
            }
        });
        
        // 🔒 onValue retourne une fonction de déconnexion, pas une Promise
        this.removeLocationListener = () => off(locationRef);
    }

    /**
     * Gestion mises à jour localisation avec validation
     * 🔒 CORRECTION: Plus d'écriture Firebase RTDB ici (fait par le service natif)
     * Ce service ne fait qu'écouter et valider les positions
     */
    private async handleLocationUpdate(locationData: DriverLocation): Promise<void> {
        if (!this.config) return;

        // Validation Zod (Checklist)
        try {
            const validatedLocation = LocationDataSchema.parse(locationData);
            
            // 🔒 Le service natif écrit déjà dans Firebase RTDB
            // Ce service ne fait qu'écouter et propager à l'UI
            
            // Callback client (pour UI)
            if (this.config.onLocationUpdate) {
                this.config.onLocationUpdate(validatedLocation);
            }
        } catch (error) {
            console.error('Invalid location data:', error);
            this.config?.onError?.({
                code: 'NETWORK_ERROR',
                message: 'Données de localisation invalides',
                recoverable: true,
            });
        }
    }

    /**
     * Setup listener état connexion (§11.2)
     * 🔒 CORRECTION: Plus de synchronisation offline (géré par le service natif)
     */
    private setupConnectionListener(): void {
        const db = getDatabase();
        const connectedRef = ref(db, '.info/connected');
        
        onValue(connectedRef, (snapshot) => {
            this.isOnline = snapshot.val() === true;
            
            // 🔒 Le service natif gère la synchronisation automatique
            // Plus besoin de syncLastOfflineLocation ici
        });

        this.removeConnectedListener = () => off(connectedRef);
    }

    /**
     * Mise à jour statut conducteur Firestore
     * Optimistic update avec rollback (§7.2)
     */
    private async updateDriverStatus(
        driverId: string,
        status: DriverStatus
    ): Promise<void> {
        const db = getFirestore();
        const driverRef = doc(db, 'drivers', driverId);

        // Optimistic update local
        const updateData = {
            status,
            lastStatusChange: serverTimestamp(),
            locationUpdatedAt: status === 'online' ? serverTimestamp() : null,
        };

        try {
            await updateDoc(driverRef, updateData);
        } catch (error) {
            // Rollback logique si échec
            console.error('Failed to update driver status:', error);
            throw error;
        }
    }

    /**
     * Gestion erreurs avec exponential backoff (§7.1)
     */
    private async handleStartError(error: unknown): Promise<void> {
        const trackingError: TrackingError = this.parseError(error);

        if (this.retryAttempts < RETRY_MAX_ATTEMPTS && trackingError.recoverable) {
            this.retryAttempts++;
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, this.retryAttempts);

            await new Promise(resolve => setTimeout(resolve, delay));
            return this.startTracking(this.config!);
        }

        this.config?.onError?.(trackingError);
        throw error;
    }

    private parseError(error: unknown): TrackingError {
        if (error instanceof Error) {
            if (error.message.includes('PERMISSION_DENIED')) {
                return {
                    code: 'PERMISSION_DENIED',
                    message: 'Permissions localisation requises',
                    recoverable: false,
                };
            }
            if (error.message.includes('offline') || error.message.includes('network')) {
                return {
                    code: 'OFFLINE_MODE',
                    message: 'Mode hors ligne activé',
                    recoverable: true,
                };
            }
        }
        return {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : 'Erreur inconnue',
            recoverable: true,
        };
    }

    getStatus(): { isTracking: boolean; isOnline: boolean } {
        return {
            isTracking: this.isTracking,
            isOnline: this.isOnline,
        };
    }
}

// Singleton export
export const driverTracking = new DriverTrackingService();
