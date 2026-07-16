import { useState, useCallback } from 'react';
import { Geolocation, Position } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { secureStorage } from '@/services/secureStorage.service';
import { withTimeout } from '@/utils/promise';
import { haversineKm } from '@/utils/distance';
import { GpsKalmanFilter, type SmoothingOptions } from '@/utils/gpsSmoothing';
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

// Seuils de précision en mètres.
// Resserrés vs Google Maps app : un point taxi à >30m peut faire rater la prise en charge.
const MIN_ACCEPTABLE_ACCURACY = 30;
const IDEAL_ACCURACY = 15;
// Burst : durée max d'affinage progressif via watchPosition (ms).
const REFINE_BURST_DURATION_MS = 5000;
// Burst : précision en dessous de laquelle on s'arrête immédiatement (ms).
const REFINE_EARLY_STOP_ACCURACY = 10;
// Filtre outlier : on rejette une lecture si elle "saute" de plus que la somme des
// rayons d'incertitude des deux points (statistiquement improbable que les deux soient correctes).
const OUTLIER_REJECTION_FACTOR = 1;

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
    // Mode booking (réservation) : Haute précision, timeout 12s, AUCUN cache.
    // Le pickup taxi exige une position fraîche — un cache de 30s peut placer
    // l'utilisateur à plusieurs centaines de mètres s'il vient de se déplacer.
    booking: {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
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

    const readBrowserPosition = useCallback(async (mode: GeolocationMode): Promise<PreciseLocation> => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            throw new Error('La géolocalisation du navigateur n’est pas disponible.');
        }

        if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost') {
            throw new Error('Le web exige HTTPS ou localhost pour accéder au GPS.');
        }

        const options: PositionOptions = {
            enableHighAccuracy: mode !== 'battery_critical',
            timeout: mode === 'tracking' ? 15000 : 12000,
            maximumAge: 0,
        };

        const bestPosition = await new Promise<GeolocationPosition>((resolve, reject) => {
            let watchId: number | null = null;
            let resolved = false;
            let best: GeolocationPosition | null = null;
            let stopTimer: ReturnType<typeof setTimeout> | null = null;

            const finish = async (fn: () => void, value?: GeolocationPosition | Error) => {
                if (resolved) return;
                resolved = true;
                if (stopTimer) clearTimeout(stopTimer);
                fn();
                if (value instanceof Error) {
                    reject(value);
                } else if (value) {
                    resolve(value);
                } else {
                    reject(new Error('Impossible d’obtenir une position fiable.'));
                }
            };

            const clearWatchSafe = () => {
                if (watchId !== null) {
                    navigator.geolocation.clearWatch(watchId);
                    watchId = null;
                }
            };

            watchId = navigator.geolocation.watchPosition(
                (position) => {
                    if (!position) return;
                    if (!best || position.coords.accuracy < best.coords.accuracy) {
                        best = position;
                    }

                    if (best && best.coords.accuracy <= 30) {
                        void finish(clearWatchSafe, best);
                    }
                },
                (error) => {
                    if (resolved) return;
                    void finish(clearWatchSafe, new Error(error.message || 'Erreur de géolocalisation navigateur'));
                },
                options
            );

            stopTimer = setTimeout(() => {
                if (resolved) return;
                if (best) {
                    void finish(clearWatchSafe, best);
                } else {
                    void finish(clearWatchSafe, new Error('Impossible d’obtenir une position fiable.'));
                }
            }, mode === 'tracking' ? 12000 : 10000);
        });

        const preciseLocation: PreciseLocation = {
            lat: bestPosition.coords.latitude,
            lng: bestPosition.coords.longitude,
            accuracy: bestPosition.coords.accuracy,
            altitude: bestPosition.coords.altitude,
            heading: bestPosition.coords.heading,
            speed: bestPosition.coords.speed,
            timestamp: bestPosition.timestamp,
        };

        await secureStorage.setLastKnownPosition({
            lat: preciseLocation.lat,
            lng: preciseLocation.lng,
            accuracy: preciseLocation.accuracy,
            timestamp: preciseLocation.timestamp,
        });

        setState({
            location: { lat: preciseLocation.lat, lng: preciseLocation.lng },
            preciseLocation,
            error: null,
            loading: false,
            accuracy: preciseLocation.accuracy,
        });

        return preciseLocation;
    }, []);

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

        if (typeof window !== 'undefined' && !Capacitor.isNativePlatform()) {
            try {
                return await readBrowserPosition(mode);
            } catch (browserErr) {
                if (!fallbackToCache) {
                    setState({
                        location: null,
                        preciseLocation: null,
                        error: browserErr instanceof Error ? browserErr.message : 'Impossible d\'obtenir la position',
                        loading: false,
                        accuracy: null,
                    });
                    throw browserErr;
                }
            }
        }

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
    }, [readBrowserPosition]);

    /**
     * Affinage progressif via watchPosition pendant ~5s : démarre un watch,
     * collecte plusieurs lectures et conserve la plus précise. Le GPS converge
     * en quelques secondes après un cold-start : la 1re lecture est souvent
     * Wi-Fi (50-100m), les suivantes passent à GPS pur (5-15m).
     *
     * À utiliser au moment critique (confirmation pickup taxi) plutôt que
     * getCurrentPosition qui prend la 1re lecture "acceptable".
     */
    const getPrecisePositionBurst = useCallback(async (
        durationMs: number = REFINE_BURST_DURATION_MS,
        signal?: AbortSignal
    ): Promise<PreciseLocation> => {
        setState(prev => ({ ...prev, loading: true, error: null }));

        const permissionStatus = await withTimeout(
            Geolocation.checkPermissions(),
            5000,
            'checkPermissions'
        );
        if (permissionStatus.location === 'denied' || permissionStatus.location === 'prompt') {
            const request = await withTimeout(
                Geolocation.requestPermissions(),
                30000,
                'requestPermissions'
            );
            if (request.location === 'denied') {
                throw new Error('Permission de géolocalisation refusée');
            }
        }

        let best: Position | null = null;
        let watchId: string | null = null;

        const finish = async (): Promise<PreciseLocation> => {
            if (watchId) {
                try { await Geolocation.clearWatch({ id: watchId }); } catch {}
                watchId = null;
            }
            if (!best) {
                throw new Error("Impossible d'obtenir une localisation précise.");
            }
            const precise: PreciseLocation = {
                lat: best.coords.latitude,
                lng: best.coords.longitude,
                accuracy: best.coords.accuracy,
                altitude: best.coords.altitude,
                heading: best.coords.heading,
                speed: best.coords.speed,
                timestamp: best.timestamp,
            };
            await secureStorage.setLastKnownPosition({
                lat: precise.lat,
                lng: precise.lng,
                accuracy: precise.accuracy,
                timestamp: precise.timestamp,
            });
            setState({
                location: { lat: precise.lat, lng: precise.lng },
                preciseLocation: precise,
                error: null,
                loading: false,
                accuracy: precise.accuracy,
            });
            console.log('[Geolocation] Burst FINAL:', {
                lat: precise.lat.toFixed(6),
                lng: precise.lng.toFixed(6),
                accuracy: `${precise.accuracy.toFixed(1)}m`,
            });
            return precise;
        };

        return new Promise<PreciseLocation>((resolve, reject) => {
            let stopTimer: ReturnType<typeof setTimeout> | null = null;
            let resolved = false;

            const settle = async (action: 'resolve' | 'reject', err?: Error) => {
                if (resolved) return;
                resolved = true;
                if (stopTimer) clearTimeout(stopTimer);
                try {
                    if (action === 'reject') {
                        if (watchId) {
                            try { await Geolocation.clearWatch({ id: watchId }); } catch {}
                        }
                        setState(prev => ({ ...prev, loading: false, error: err?.message ?? 'Erreur' }));
                        reject(err ?? new Error('Annulé'));
                    } else {
                        resolve(await finish());
                    }
                } catch (e) {
                    reject(e instanceof Error ? e : new Error(String(e)));
                }
            };

            if (signal) {
                if (signal.aborted) {
                    settle('reject', new Error('Annulé'));
                    return;
                }
                signal.addEventListener('abort', () => settle('reject', new Error('Annulé')), { once: true });
            }

            Geolocation.watchPosition(
                { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
                (position, err) => {
                    if (resolved) return;
                    if (err) {
                        console.warn('[Geolocation] Burst watch err:', err);
                        return;
                    }
                    if (!position) return;

                    const acc = position.coords.accuracy;

                    // Filtre outlier : on rejette une lecture qui saute hors du
                    // rayon d'incertitude combiné de la meilleure lecture.
                    if (best) {
                        const distM = haversineKm(
                            { lat: best.coords.latitude, lng: best.coords.longitude },
                            { lat: position.coords.latitude, lng: position.coords.longitude }
                        ) * 1000;
                        const jumpThreshold = (best.coords.accuracy + acc) * OUTLIER_REJECTION_FACTOR;
                        if (distM > jumpThreshold && acc > best.coords.accuracy) {
                            console.warn(`[Geolocation] Burst outlier rejeté: saut ${distM.toFixed(0)}m, acc ${acc.toFixed(0)}m`);
                            return;
                        }
                    }

                    if (!best || acc < best.coords.accuracy) {
                        best = position;
                        console.log(`[Geolocation] Burst nouvelle meilleure: ${acc.toFixed(1)}m`);
                    }

                    if (acc <= REFINE_EARLY_STOP_ACCURACY) {
                        settle('resolve');
                    }
                }
            ).then((id) => {
                if (resolved) {
                    Geolocation.clearWatch({ id }).catch(() => {});
                    return;
                }
                watchId = id;
                stopTimer = setTimeout(() => settle('resolve'), durationMs);
            }).catch((e) => settle('reject', e instanceof Error ? e : new Error(String(e))));
        });
    }, []);

    /**
     * Watch position (pour le suivi en temps réel avec precision)
     *  Ajout throttling pour optimiser la batterie (medJira.md #67)
     */
    const watchPosition = useCallback((
        callback: (location: PreciseLocation) => void,
        options?: {
            throttleMs?: number;
            maxFrequencyHz?: number;
            outlierFilter?: boolean;
            /**
             * Active le lissage Kalman + rejet d'outliers vitesse.
             * Désactive automatiquement `outlierFilter` (le Kalman le couvre).
             * Cf. docs/superpowers/specs/2026-05-12-gps-smoothing.md.
             */
            smoothing?: boolean;
            smoothingOptions?: SmoothingOptions;
        }
    ) => {
        //  Configuration du throttling (medJira.md #67)
        const {
            throttleMs = 1000,
            outlierFilter: outlierFilterOpt = true,
            smoothing = false,
            smoothingOptions,
        } = options || {};
        // Le Kalman remplace le filtre d'outlier simple — on le désactive si smoothing.
        const outlierFilter = smoothing ? false : outlierFilterOpt;
        const kalman = smoothing ? new GpsKalmanFilter(smoothingOptions) : null;
        let watchId: string | null = null;
        let lastCallbackTime = 0;
        let cancelled = false;
        let lastAccepted: PreciseLocation | null = null;

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
                            // Throttle adaptatif batterie : si on n'a PAS de Kalman,
                            // on espace en stationnaire (5 s). Avec Kalman activé,
                            // on doit garder un flux régulier sinon le filtre n'a
                            // pas assez de samples pour converger au repos.
                            const effectiveInterval = kalman
                                ? throttleMs
                                : (speed > 1 ? throttleMs : 5000);
                            const timeSinceLastCallback = now - lastCallbackTime;

                            if (timeSinceLastCallback >= effectiveInterval) {
                                // Filtre outlier : rejette une lecture qui saute hors du
                                // rayon d'incertitude combiné de la dernière acceptée,
                                // sauf si l'utilisateur bouge (speed > 1 m/s).
                                if (outlierFilter && lastAccepted && speed <= 1) {
                                    const distM = haversineKm(
                                        { lat: lastAccepted.lat, lng: lastAccepted.lng },
                                        { lat: position.coords.latitude, lng: position.coords.longitude }
                                    ) * 1000;
                                    const jumpThreshold = (lastAccepted.accuracy + position.coords.accuracy) * OUTLIER_REJECTION_FACTOR;
                                    if (distM > jumpThreshold && position.coords.accuracy > lastAccepted.accuracy) {
                                        console.warn(`[Geolocation] Watch outlier rejeté: ${distM.toFixed(0)}m`);
                                        return;
                                    }
                                }

                                let outLat = position.coords.latitude;
                                let outLng = position.coords.longitude;
                                let outAcc = position.coords.accuracy;

                                // Lissage Kalman : si activé, remplace lat/lng/accuracy
                                // par l'estimé filtré. Rejette les outliers vitesse.
                                if (kalman) {
                                    const smoothed = kalman.update({
                                        lat: position.coords.latitude,
                                        lng: position.coords.longitude,
                                        accuracy: position.coords.accuracy,
                                        timestamp: position.timestamp,
                                        speed: position.coords.speed,
                                        heading: position.coords.heading,
                                        altitude: position.coords.altitude,
                                    });
                                    if (!smoothed) {
                                        console.warn('[Geolocation] Smoothing: outlier vitesse rejeté');
                                        return;
                                    }
                                    outLat = smoothed.lat;
                                    outLng = smoothed.lng;
                                    outAcc = smoothed.accuracy;
                                    console.log(
                                        `[Geolocation] Smoothed: ${outAcc.toFixed(1)}m (raw ${position.coords.accuracy.toFixed(1)}m)`
                                    );
                                }

                                lastCallbackTime = now;
                                const preciseLocation: PreciseLocation = {
                                    lat: outLat,
                                    lng: outLng,
                                    accuracy: outAcc,
                                    altitude: position.coords.altitude,
                                    heading: position.coords.heading,
                                    speed: position.coords.speed,
                                    timestamp: position.timestamp,
                                };
                                lastAccepted = preciseLocation;
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
            if (kalman) kalman.reset();
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
        getPrecisePositionBurst,
        watchPosition,
        isAccuracyGoodEnough,
        getAccuracyQuality,
        isNative: Capacitor.isNativePlatform()
    };
};
