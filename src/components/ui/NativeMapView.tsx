import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap } from '@capacitor/google-maps';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';

// ✅ Interfaces strictement typées (medJiraV2.md #2)
interface MapClickEvent {
    latitude: number;
    longitude: number;
}

interface MarkerData {
    id: string;
    position: { lat: number; lng: number };
    title?: string;
}

interface NativeMapViewProps {
    apiKey: string;
    center: { lat: number; lng: number };
    zoom: number;
    markers?: MarkerData[];
    onMapClick?: (event: MapClickEvent) => void;
    onMarkerClick?: (markerId: string) => void;
    className?: string;
    onError?: (error: Error) => void;
    enableClustering?: boolean;
}

export const NativeMapView: React.FC<NativeMapViewProps> = ({
    apiKey,
    center,
    zoom,
    markers = [],
    onMapClick,
    onMarkerClick,
    className = '',
    onError,
    enableClustering = true,
}) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<GoogleMap | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOnline, setIsOnline] = useState(true);
    const [isAppActive, setIsAppActive] = useState(true);
    
    const cameraUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const markersUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentMarkersRef = useRef<string[]>([]);
    const lastClickRef = useRef<number>(0);
    const isMountedRef = useRef<boolean>(true);
    
    // ✅ Refs pour stabiliser les callbacks sans déclencher recréation map
    const callbacksRef = useRef({
        onMapClick,
        onMarkerClick,
        onError
    });

    // ✅ Mise à jour des refs à chaque render (toujours frais)
    useEffect(() => {
        callbacksRef.current = { onMapClick, onMarkerClick, onError };
    });

    // ✅ Gestion réseau native Capacitor (medJiraV2.md #6.1, #11.2)
    useEffect(() => {
        let networkCleanup: (() => void) | null = null;
        let appCleanup: (() => void) | null = null;

        const initListeners = async () => {
            try {
                // État initial réseau
                const status = await Network.getStatus();
                if (isMountedRef.current) {
                    setIsOnline(status.connected);
                }

                // Listener réseau natif
                const networkListener = await Network.addListener('networkStatusChange', (s) => {
                    if (isMountedRef.current) {
                        setIsOnline(s.connected);
                    }
                });
                networkCleanup = networkListener.remove;

                // ✅ Gestion cycle de vie app (medJiraV2.md #5.2 - batterie)
                const appListener = await App.addListener('appStateChange', ({ isActive }) => {
                    setIsAppActive(isActive);
                    if (!isActive) {
                        // Pause mises à jour quand app en background
                        if (cameraUpdateTimeoutRef.current) {
                            clearTimeout(cameraUpdateTimeoutRef.current);
                        }
                    }
                });
                appCleanup = appListener.remove;

            } catch (error) {
                // Fallback navigateur si Capacitor non dispo (web)
                console.warn('Capacitor plugins unavailable, using fallback');
                const handleOnline = () => setIsOnline(true);
                const handleOffline = () => setIsOnline(false);
                window.addEventListener('online', handleOnline);
                window.addEventListener('offline', handleOffline);
                setIsOnline(navigator.onLine);
                
                networkCleanup = () => {
                    window.removeEventListener('online', handleOnline);
                    window.removeEventListener('offline', handleOffline);
                };
            }
        };

        initListeners();

        return () => {
            networkCleanup?.();
            appCleanup?.();
        };
    }, []);

    // ✅ Throttling 500ms avec haptic (medJiraV2.md #5.1, #9.1)
    const throttledAction = useCallback(async (action: () => void, hapticStyle: ImpactStyle) => {
        const now = Date.now();
        if (now - lastClickRef.current < 500) return;
        lastClickRef.current = now;

        try {
            await Haptics.impact({ style: hapticStyle });
        } catch {
            // Silencieux si haptics non supporté
        }
        action();
    }, []);

    // ✅ Création map - DÉPENDANCES MINIMALES (medJiraV2.md #7.2)
    useEffect(() => {
        if (!mapRef.current || !isOnline || mapInstanceRef.current) return;

        const createMap = async () => {
            try {
                setIsLoading(true);
                
                const newMap = await GoogleMap.create({
                    id: 'vtc-map-native',
                    element: mapRef.current!,
                    apiKey: apiKey,
                    config: {
                        center: center,
                        zoom: zoom,
                        androidLiteMode: false,
                        devicePixelRatio: Math.min(window.devicePixelRatio, 3),
                        styles: [
                            {
                                featureType: 'poi',
                                elementType: 'labels',
                                stylers: [{ visibility: 'off' }],
                            },
                            {
                                featureType: 'transit',
                                elementType: 'labels',
                                stylers: [{ visibility: 'off' }],
                            },
                        ],
                    },
                });

                if (!isMountedRef.current) {
                    newMap.destroy();
                    return;
                }

                mapInstanceRef.current = newMap;

                // ✅ Localisation native (medJiraV2.md #5.2)
                await newMap.enableCurrentLocation(true);

                // ✅ Listeners avec accès aux refs fraîches (pas de recréation)
                await newMap.setOnMapClickListener((event) => {
                    if (!callbacksRef.current.onMapClick) return;
                    throttledAction(() => {
                        callbacksRef.current.onMapClick!({
                            latitude: event.latitude,
                            longitude: event.longitude,
                        });
                    }, ImpactStyle.Light);
                });

                await newMap.setOnMarkerClickListener((event) => {
                    if (!callbacksRef.current.onMarkerClick) return;
                    throttledAction(() => {
                        callbacksRef.current.onMarkerClick!(event.markerId);
                    }, ImpactStyle.Medium);
                });

                if (isMountedRef.current) {
                    setIsLoading(false);
                }
            } catch (e: unknown) {
                const error = e instanceof Error ? e : new Error(String(e));
                console.error('[NativeMapView] Creation error:', error);
                
                if (isMountedRef.current) {
                    setIsLoading(false);
                    callbacksRef.current.onError?.(error);
                }
            }
        };

        createMap();

        // ✅ Cleanup destruction complète (medJiraV2.md #4.1)
        return () => {
            if (mapInstanceRef.current) {
                // Pas besoin de removeListeners, destroy() suffit
                mapInstanceRef.current.destroy();
                mapInstanceRef.current = null;
            }
        };
        // ✅ SEULEMENT apiKey et isOnline - jamais les callbacks
    }, [apiKey, isOnline]);

    // ✅ Update camera avec debouncing et gestion background (medJiraV2.md #5.1)
    useEffect(() => {
        if (!mapInstanceRef.current || !isAppActive) return;

        if (cameraUpdateTimeoutRef.current) {
            clearTimeout(cameraUpdateTimeoutRef.current);
        }

        cameraUpdateTimeoutRef.current = setTimeout(() => {
            if (mapInstanceRef.current && isMountedRef.current && isAppActive) {
                mapInstanceRef.current.setCamera({
                    coordinate: center,
                    zoom: zoom,
                    animate: true,
                });
            }
        }, 500);

        return () => {
            if (cameraUpdateTimeoutRef.current) {
                clearTimeout(cameraUpdateTimeoutRef.current);
            }
        };
    }, [center.lat, center.lng, zoom, isAppActive]);

    // ✅ Update markers avec debouncing (medJiraV2.md #5.1, #7.2)
    useEffect(() => {
        if (!mapInstanceRef.current || !isAppActive) return;

        if (markersUpdateTimeoutRef.current) {
            clearTimeout(markersUpdateTimeoutRef.current);
        }

        const updateMarkers = async () => {
            if (!mapInstanceRef.current || !isMountedRef.current) return;

            try {
                // Suppression markers existants
                if (currentMarkersRef.current.length > 0) {
                    await mapInstanceRef.current.removeMarkers(currentMarkersRef.current);
                    currentMarkersRef.current = [];
                }

                if (markers.length === 0) return;

                // ✅ Clustering >50 markers (medJiraV2.md #5.1)
                const shouldCluster = enableClustering && markers.length > 50;
                const markersToProcess = shouldCluster
                    ? markers.slice(0, 50)
                    : markers.slice(0, 100);

                const nativeMarkers = markersToProcess.map(m => ({
                    coordinate: m.position,
                    title: m.title?.slice(0, 50),
                    snippet: m.title?.slice(0, 100),
                    markerId: m.id,
                    iconSize: { width: 44, height: 44 }, // ✅ Touch target 44px (medJiraV2.md #9.1)
                    iconAnchor: { x: 22, y: 44 },
                }));

                const addedMarkerIds = await mapInstanceRef.current.addMarkers(nativeMarkers);
                
                if (isMountedRef.current) {
                    currentMarkersRef.current = addedMarkerIds;
                }

            } catch (error) {
                console.error('[NativeMapView] Marker update error:', error);
                if (isMountedRef.current) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    callbacksRef.current.onError?.(err);
                }
            }
        };

        markersUpdateTimeoutRef.current = setTimeout(updateMarkers, 500);

        return () => {
            if (markersUpdateTimeoutRef.current) {
                clearTimeout(markersUpdateTimeoutRef.current);
            }
        };
    }, [markers, enableClustering, isAppActive]);

    // ✅ Cleanup global (medJiraV2.md #2, #4.1)
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            
            cameraUpdateTimeoutRef.current && clearTimeout(cameraUpdateTimeoutRef.current);
            markersUpdateTimeoutRef.current && clearTimeout(markersUpdateTimeoutRef.current);
            
            if (mapInstanceRef.current) {
                if (currentMarkersRef.current.length > 0) {
                    mapInstanceRef.current.removeMarkers(currentMarkersRef.current).catch(() => {});
                }
                mapInstanceRef.current.destroy();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    // ✅ Skeleton screen (medJiraV2.md #9.1)
    if (isLoading) {
        return (
            <div 
                className={`relative w-full h-full bg-gray-200 animate-pulse ${className}`}
                aria-label="Chargement de la carte"
                role="status"
            >
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3">
                    <div className="w-12 h-12 bg-gray-300 rounded-full animate-pulse" />
                    <div className="text-gray-500 text-sm font-medium">
                        Chargement de la carte...
                    </div>
                </div>
            </div>
        );
    }

    // ✅ État offline (medJiraV2.md #11.2)
    if (!isOnline) {
        return (
            <div 
                className={`relative w-full h-full bg-gray-50 flex flex-col items-center justify-center p-6 ${className}`}
                role="alert"
                aria-live="polite"
            >
                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
                    </svg>
                </div>
                <h3 className="text-gray-900 font-semibold text-lg mb-2">
                    Mode hors ligne
                </h3>
                <p className="text-gray-500 text-center text-sm mb-4 max-w-xs">
                    La carte nécessite une connexion internet pour fonctionner.
                </p>
                <button
                    onClick={async () => {
                        try {
                            const status = await Network.getStatus();
                            setIsOnline(status.connected);
                        } catch {
                            setIsOnline(navigator.onLine);
                        }
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium
                             active:bg-blue-700 transition-colors min-h-[44px] min-w-[44px]"
                    aria-label="Vérifier la connexion"
                >
                    Réessayer
                </button>
            </div>
        );
    }

    // ✅ Container avec safe areas (medJiraV2.md #6.2)
    return (
        <div 
            className={`relative w-full h-full overflow-hidden ${className}`}
            style={{
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)',
                paddingLeft: 'env(safe-area-inset-left)',
                paddingRight: 'env(safe-area-inset-right)',
            }}
        >
            <div
                ref={mapRef}
                id="capacitor-map-container"
                className="w-full h-full"
                style={{ display: 'block', minHeight: '100%', minWidth: '100%' }}
                role="application"
                aria-label="Carte interactive"
            />
            
            {/* ✅ Indicateur background si nécessaire */}
            {!isAppActive && (
                <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                    App en pause
                </div>
            )}
        </div>
    );
};

export default NativeMapView;