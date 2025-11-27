import { useState, useEffect, useCallback } from 'react';
import { Geolocation, Position } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

export interface Location {
    lat: number;
    lng: number;
}

export interface GeolocationState {
    location: Location | null;
    error: string | null;
    loading: boolean;
}

export const useCapacitorGeolocation = () => {
    const [state, setState] = useState<GeolocationState>({
        location: null,
        error: null,
        loading: false,
    });

    const getCurrentPosition = useCallback(async () => {
        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            console.log('📍 [Geolocation] Démarrage de la géolocalisation...');
            
            // Vérifier les permissions
            const permissionStatus = await Geolocation.checkPermissions();
            console.log('📍 [Geolocation] Statut permissions:', permissionStatus);

            if (permissionStatus.location === 'denied') {
                console.log('⚠️ [Geolocation] Permission refusée, demande en cours...');
                // Demander la permission si elle n'est pas accordée (sauf si refusée définitivement)
                const request = await Geolocation.requestPermissions();
                console.log('📍 [Geolocation] Résultat demande:', request);
                if (request.location === 'denied') {
                    throw new Error('Permission de géolocalisation refusée');
                }
            }

            console.log('📍 [Geolocation] Récupération position GPS (timeout: 30s)...');
            // Obtenir la position avec paramètres optimisés pour une précision maximale
            // Timeout augmenté pour permettre au GPS de se fixer, même à l'intérieur
            const position = await Geolocation.getCurrentPosition({
                enableHighAccuracy: true, // Force l'utilisation du GPS
                timeout: 30000, // 30 secondes pour laisser le temps au GPS de se fixer
                maximumAge: 2000 // Position fraîche uniquement
            });

            console.log('✅ [Geolocation] Position obtenue:', {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy
            });

            setState({
                location: {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                },
                error: null,
                loading: false
            });

            return {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            console.error('Erreur géolocalisation:', err);
            console.log("Erreur géolocalisation:", err)
            let errorMessage = 'Impossible d\'obtenir la position';

            if (err.message) {
                errorMessage = err.message;
            }

            setState({
                location: null,
                error: errorMessage,
                loading: false
            });

            throw err;
        }
    }, []);

    // Watch position (pour le suivi en temps réel)
    const watchPosition = useCallback((callback: (location: Location) => void) => {
        let watchId: string | null = null;

        const startWatch = async () => {
            try {
                watchId = await Geolocation.watchPosition(
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0
                    },
                    (position, err) => {
                        if (err) {
                            console.error('Erreur watch position:', err);
                            console.log('Erreur watch position:', err);
                            return;
                        }
                        if (position) {
                            callback({
                                lat: position.coords.latitude,
                                lng: position.coords.longitude
                            });
                        }
                    }
                );
            } catch (err) {
                console.error('Erreur démarrage watch:', err);
                console.log('Erreur démarrage watch:', err);
            }
        };

        startWatch();

        return () => {
            if (watchId) {
                Geolocation.clearWatch({ id: watchId });
            }
        };
    }, []);

    return {
        ...state,
        getCurrentPosition,
        watchPosition,
        isNative: Capacitor.isNativePlatform()
    };
};
