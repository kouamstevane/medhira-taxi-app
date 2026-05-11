import { useState, useCallback } from 'react';
import { Geolocation, Position } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { secureStorage } from '@/services/secureStorage.service';
import { withTimeout } from '@/utils/promise';
//  Conforme à medJiraV2.md §6.1 (modes adaptatifs + fallback lastKnownPosition)

export interface Location {
    lat: number;
    lng: number;
}

export interface PreciseLocation extends Location {
    accuracy: number; // Précision en mètres
    altitude?: number | null;
    heading?: number | null; // Direction (pour la navigation)
    speed?: number | null;
    timestamp: number;
}

export interface GeolocationState {
    location: Location | null;
    preciseLocation: PreciseLocation | null;
    error: string | null;
    loading: boolean;
    accuracy: number | null; // Précision en mètres
}

// Précision minimale acceptable (en mètres) pour une localisation "ultra-précise"
const MIN_ACCEPTABLE_ACCURACY = 50; // 50 mètres max
const IDEAL_ACCURACY = 20; // Idéalement moins de 20 mètres

//  Modes adaptatifs selon medJiraV2.md §6.1
export type GeolocationMode = 'tracking' | 'booking' | 'battery_critical';

interface GeolocationModeConfig {
    enableHighAccuracy: boolean;
    timeout: number;
    maximumAge: number;
}

const MODE_CONFIGS: Record<GeolocationMode, GeolocationModeConfig> = {
    // Mode tracking (course active) : Haute précision, timeout 15s, distanceFilter 10m
    tracking: {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
    },
    // Mode booking (recherche) : Précision standard, timeout 10s, cache 30s
    booking: {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 30000,
    },
    // Mode batterie critique (<20%) : Basse précision, timeout 10s, distanceFilter 50m
    battery_critical: {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
    },
};


export const useCapacitorGeolocation = () => {
    const [state, setState] = useState<GeolocationState>({
        location: null,
        preciseLocation: null,
        error: null,
        loading: false,
        accuracy: null,
    });

    /**
     * Obtenir la position actuelle avec modes adaptatifs
     *  Conforme à medJiraV2.md §6.1 (modes adaptatifs + fallback lastKnownPosition)
     * 
     * @param mode Mode de géolocalisation (tracking, booking, battery_critical)
     * @param fallbackToCache Si true, utilise le cache lastKnownPosition en cas d'échec
     */
    const getCurrentPosition = useCallback(async (
        mode: GeolocationMode = 'booking',
        fallbackToCache = true
    ) => {
        setState(prev => ({ ...prev, loading: true, error: null }));

        // Master timeout : couvre le pire cas des 3 stratégies (15+15+10 = 40s).
        // Garantit que loading=false sera émis même si une WebView Android
        // ne renvoie jamais la callback native de Geolocation.
        const MASTER_TIMEOUT_MS = 40000;
        let masterTimeoutFired = false;
        const masterTimeout = setTimeout(() => {
            masterTimeoutFired = true;
            console.error('[Geolocation] Master timeout déclenché — déblocage forcé');
            setState({
                location: null,
                preciseLocation: null,
                error: "Délai d'attente GPS dépassé. Vérifiez que la localisation est activée.",
                loading: false,
                accuracy: null,
            });
        }, MASTER_TIMEOUT_MS);

        // setState garde-fou : n'écrase pas l'état si le master timeout a déjà tiré.
        const safeSetState = (next: GeolocationState) => {
            if (!masterTimeoutFired) setState(next);
        };

        try {
            console.log(`[Geolocation] Démarrage géolocalisation mode: ${mode}`);

            const permissionStatus = await withTimeout(
                Geolocation.checkPermissions(),
                5000,
                'checkPermissions'
            );
            console.log('[Geolocation] Statut permissions:', permissionStatus);

            if (permissionStatus.location === 'denied' || permissionStatus.location === 'prompt') {
                const request = await withTimeout(
                    Geolocation.requestPermissions(),
                    30000,
                    'requestPermissions'
                );
                console.log('[Geolocation] Résultat demande:', request);
                if (request.location === 'denied') {
                    throw new Error('Permission de géolocalisation refusée');
                }
            }

            //  Utiliser la configuration selon le mode (medJiraV2.md §6.1)
            const modeConfig = MODE_CONFIGS[mode];
            console.log('[Geolocation] Configuration mode:', modeConfig);

            let bestPosition: Position | null = null;
            let bestAccuracy = Infinity;
            const MAX_ATTEMPTS = 3; //  Dégradation progressive après 3 échecs

            // Stratégies de tentatives progressives
            const strategies = [
                // Tentative 1 : Configuration selon le mode
                modeConfig,
                // Tentative 2 : Fallback haute précision (si mode booking/battery)
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
                // Tentative 3 : Fallback basse précision (dernier recours)
                { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
            ];

            for (let i = 0; i < strategies.length; i++) {
                try {
                    const strategy = strategies[i];
                    console.log(`[Geolocation] Tentative ${i + 1}/${strategies.length}`, strategy);
                    
                    const position = await Geolocation.getCurrentPosition(strategy);
                    const accuracy = position.coords.accuracy;
                    
                    console.log(`[Geolocation] Succès tentative ${i + 1}. Précision: ${accuracy.toFixed(1)}m`);

                    // Garder la meilleure position trouvée jusqu'à présent
                    if (accuracy < bestAccuracy) {
                        bestAccuracy = accuracy;
                        bestPosition = position;
                    }

                    // Si la précision est acceptable (<= 50m), on s'arrête là
                    if (accuracy <= MIN_ACCEPTABLE_ACCURACY) {
                        console.log('[Geolocation] Précision acceptable atteinte !');
                        break;
                    }
                    
                } catch (err: unknown) {
                    //  Typage correct de l'erreur (medJira.md #116)
                    const errorCode = (err as { code?: number })?.code;
                    const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
                    console.warn(`[Geolocation] Échec tentative ${i + 1} (${errorCode}):`, errorMessage);
                    // On continue à la prochaine stratégie
                }
            }

            //  Dégradation progressive : Fallback lastKnownPosition après 3 échecs
            if (!bestPosition && fallbackToCache) {
                console.warn('[Geolocation] Échec GPS, tentative fallback lastKnownPosition...');
                
                const cachedPosition = await secureStorage.getLastKnownPosition();
                
                if (cachedPosition) {
                    const age = Date.now() - cachedPosition.timestamp;
                    const ageMinutes = Math.floor(age / 60000);
                    
                    console.log(`[Geolocation] Position cache trouvée (âge: ${ageMinutes}min)`);
                    
                    const preciseLocation: PreciseLocation = {
                        lat: cachedPosition.lat,
                        lng: cachedPosition.lng,
                        accuracy: cachedPosition.accuracy,
                        altitude: cachedPosition.altitude,
                        heading: cachedPosition.heading,
                        speed: cachedPosition.speed,
                        timestamp: cachedPosition.timestamp,
                    };

                    safeSetState({
                        location: {
                            lat: preciseLocation.lat,
                            lng: preciseLocation.lng
                        },
                        preciseLocation,
                        error: null,
                        loading: false,
                        accuracy: cachedPosition.accuracy,
                    });

                    console.warn(`[Geolocation] Utilisation position cache (précision dégradée: ${cachedPosition.accuracy.toFixed(0)}m)`);
                    
                    return preciseLocation;
                }
                
                console.error('[Geolocation] Aucune position cache disponible');
            }

            if (!bestPosition) {
                throw new Error("Impossible d'obtenir une localisation valide. Vérifiez que le GPS est activé.");
            }

            const preciseLocation: PreciseLocation = {
                lat: bestPosition.coords.latitude,
                lng: bestPosition.coords.longitude,
                accuracy: bestAccuracy,
                altitude: bestPosition.coords.altitude,
                heading: bestPosition.coords.heading,
                speed: bestPosition.coords.speed,
                timestamp: bestPosition.timestamp,
            };

            //  Mettre en cache lastKnownPosition (medJiraV2.md §6.1)
            await secureStorage.setLastKnownPosition({
                lat: preciseLocation.lat,
                lng: preciseLocation.lng,
                accuracy: preciseLocation.accuracy,
                timestamp: preciseLocation.timestamp,
            });

            console.log('[Geolocation] Position FINALE:', {
                lat: preciseLocation.lat.toFixed(6),
                lng: preciseLocation.lng.toFixed(6),
                accuracy: `${preciseLocation.accuracy.toFixed(1)}m`,
                qualité: preciseLocation.accuracy <= IDEAL_ACCURACY ? 'EXCELLENTE' : 
                         preciseLocation.accuracy <= MIN_ACCEPTABLE_ACCURACY ? 'BONNE' : 'ACCEPTABLE'
            });

            // Avertir si la précision n'est pas idéale
            if (bestAccuracy > MIN_ACCEPTABLE_ACCURACY) {
                console.warn(`[Geolocation] Précision limitée (${bestAccuracy.toFixed(0)}m). Conseil: sortir à l'extérieur.`);
            }

            safeSetState({
                location: {
                    lat: preciseLocation.lat,
                    lng: preciseLocation.lng
                },
                preciseLocation,
                error: null,
                loading: false,
                accuracy: bestAccuracy,
            });

            return preciseLocation;

        } catch (err: unknown) {
            console.error('[Geolocation] Erreur:', err);
            const errorMessage = err instanceof Error && err.message
                ? err.message
                : 'Impossible d\'obtenir la position';

            safeSetState({
                location: null,
                preciseLocation: null,
                error: errorMessage,
                loading: false,
                accuracy: null,
            });

            throw err;
        } finally {
            clearTimeout(masterTimeout);
        }
    }, []);

    /**
     * Watch position (pour le suivi en temps réel avec precision)
     *  Ajout throttling pour optimiser la batterie (medJira.md #67)
     */
    const watchPosition = useCallback((
        callback: (location: PreciseLocation) => void,
        options?: { throttleMs?: number; maxFrequencyHz?: number }
    ) => {
        //  Configuration du throttling (medJira.md #67)
        const { throttleMs = 1000, maxFrequencyHz = 1 } = options || {};
        let watchId: string | null = null;
        let lastCallbackTime = 0;
        let cancelled = false;

        const startWatch = async () => {
            try {
                const id = await Geolocation.watchPosition(
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: throttleMs // Accept cache within throttle window
                    },
                    (position, err) => {
                        if (cancelled) return;
                        if (err) {
                            console.error('Erreur watch position:', err);
                            return;
                        }
                        if (position) {
                            const now = Date.now();
                            const speed = position.coords.speed ?? 0;
                            const effectiveInterval = speed > 1 ? throttleMs : 5000;
                            const timeSinceLastCallback = now - lastCallbackTime;

                            if (timeSinceLastCallback >= effectiveInterval) {
                                lastCallbackTime = now;
                                const preciseLocation: PreciseLocation = {
                                    lat: position.coords.latitude,
                                    lng: position.coords.longitude,
                                    accuracy: position.coords.accuracy,
                                    altitude: position.coords.altitude,
                                    heading: position.coords.heading,
                                    speed: position.coords.speed,
                                    timestamp: position.timestamp,
                                };
                                callback(preciseLocation);
                            }
                        }
                    }
                );
                if (cancelled) {
                    // Unmounted between the await and here — clean up immediately
                    await Geolocation.clearWatch({ id });
                    return;
                }
                watchId = id;
            } catch (err: unknown) {
                //  Typage correct de l'erreur (medJira.md #116)
                console.error('Erreur démarrage watch:', err instanceof Error ? err.message : err);
            }
        };

        startWatch();

        return () => {
            cancelled = true;
            if (watchId) {
                Geolocation.clearWatch({ id: watchId });
            }
        };
    }, []);

    /**
     * Vérifier si la précision actuelle est suffisante pour une navigation fiable
     */
    const isAccuracyGoodEnough = useCallback(() => {
        if (!state.accuracy) return false;
        return state.accuracy <= MIN_ACCEPTABLE_ACCURACY;
    }, [state.accuracy]);

    /**
     * Obtenir une description textuelle de la qualité de la précision
     */
    const getAccuracyQuality = useCallback(() => {
        if (!state.accuracy) return 'Inconnue';
        if (state.accuracy <= 10) return 'Excellente (GPS)';
        if (state.accuracy <= IDEAL_ACCURACY) return 'Très bonne';
        if (state.accuracy <= MIN_ACCEPTABLE_ACCURACY) return 'Bonne';
        if (state.accuracy <= 100) return 'Moyenne';
        return 'Faible (WiFi/Réseau)';
    }, [state.accuracy]);

    return {
        ...state,
        getCurrentPosition,
        watchPosition,
        isAccuracyGoodEnough,
        getAccuracyQuality,
        isNative: Capacitor.isNativePlatform()
    };
};
