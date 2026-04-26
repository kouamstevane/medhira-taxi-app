import { useEffect, useState, useCallback, useRef } from 'react';
import { driverTracking, type DriverLocation, type TrackingError, type TrackingConfig } from '@/services/driverTracking.service';
import { useAuth } from '@/hooks/useAuth';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'; // §9.1 haptic feedback

/**
 * Hook React pour tracking conducteur
 * Gestion cycle de vie, cleanup automatique, feedback UX
 * Conforme à medJiraV2.md
 */

interface UseDriverTrackingOptions {
    tripId?: string;
    enabled?: boolean;
}

export function useDriverTracking(options: UseDriverTrackingOptions = {}) {
    const { tripId, enabled = true } = options;
    const { currentUser } = useAuth();
    const [isTracking, setIsTracking] = useState(false);
    const [isOnline, setIsOnline] = useState(true); // État réseau (§11.2)
    const [lastLocation, setLastLocation] = useState<DriverLocation | null>(null);
    const [error, setError] = useState<TrackingError | null>(null);
    // RGPD SEC-G01 : true => UI doit afficher la modale de consentement géoloc.
    // TODO(Stevane) : brancher une modale qui appelle `grantConsent(uid, 'geolocation', 'ui_prompt')`
    const [needsGeolocationConsent, setNeedsGeolocationConsent] = useState(false);
    
    // Ref pour éviter les problèmes de fermeture (§4.1)
    const isTrackingRef = useRef(false);
    const lastHapticRef = useRef(0);

    const startTracking = useCallback(async () => {
        if (!currentUser?.uid) {
            console.warn('Cannot start tracking: no authenticated user');
            return;
        }

        try {
            const config: TrackingConfig = {
                driverId: currentUser.uid,
                tripId,
                onLocationUpdate: (location: DriverLocation) => {
                    setLastLocation(location);
                    
                    // Haptic feedback discret sur update (§9.1)
                    // Uniquement si vitesse > 5 m/s (18 km/h) pour éviter spam
                    if (location.speed > 5) {
                        const now = Date.now();
                        if (now - lastHapticRef.current >= 60000) {
                            lastHapticRef.current = now;
                            Haptics.impact({ style: ImpactStyle.Light }).catch(() => {
                                // Silencieux en cas d'erreur (non-critique)
                            });
                        }
                    }
                },
                onError: (err: TrackingError) => {
                    setError(err);
                    setIsTracking(false);
                    isTrackingRef.current = false;
                    
                    // Haptic feedback pour erreur (§9.1)
                    Haptics.notification({ type: NotificationType.Error }).catch(() => {
                        // Silencieux en cas d'erreur
                    });
                },
            };

            await driverTracking.startTracking(config);
            setIsTracking(true);
            isTrackingRef.current = true;
            setError(null);
            
            // Mise à jour état réseau
            const status = driverTracking.getStatus();
            setIsOnline(status.isOnline);
            
        } catch (err) {
            const error = err as TrackingError;
            setError(error);
            setIsTracking(false);
            isTrackingRef.current = false;
            if (error?.code === 'CONSENT_REQUIRED') {
                setNeedsGeolocationConsent(true);
            }
        }
    }, [currentUser?.uid, tripId]);

    const stopTracking = useCallback(async () => {
        if (!isTrackingRef.current) return;

        try {
            await driverTracking.stopTracking();
            setIsTracking(false);
            isTrackingRef.current = false;
            setLastLocation(null);
            setError(null);
        } catch (err) {
            console.error('Error stopping tracking:', err);
            setError(err as TrackingError);
        }
    }, []);

    // Auto-start/stop selon cycle de vie (§4.1)
    useEffect(() => {
        let mounted = true;

        if (enabled && currentUser?.uid && !isTrackingRef.current) {
            startTracking().then(() => {
                if (!mounted) {
                    // Cleanup si composant démonté pendant le démarrage
                    stopTracking();
                }
            });
        }

        // Cleanup correct (§4.1)
        return () => {
            mounted = false;
            if (isTrackingRef.current) {
                stopTracking();
            }
        };
    }, [enabled, currentUser?.uid, tripId, startTracking, stopTracking]);

    // Écoute changements état réseau (§11.2)
    useEffect(() => {
        const interval = setInterval(() => {
            const status = driverTracking.getStatus();
            setIsOnline(status.isOnline);
        }, 5000); // Vérification toutes les 5s

        return () => clearInterval(interval);
    }, []);

    return {
        isTracking,
        isOnline,
        lastLocation,
        error,
        startTracking,
        stopTracking,
        needsGeolocationConsent,
    };
}
