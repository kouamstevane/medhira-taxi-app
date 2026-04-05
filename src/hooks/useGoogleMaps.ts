/**
 * Hook useGoogleMaps
 * 
 * Hook personnalisé pour charger et gérer Google Maps API.
 * Gère le chargement du script, l'initialisation des services, et l'état de chargement.
 * 
 * @hook
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

interface UseGoogleMapsReturn {
  isLoaded: boolean;
  loadError: string | null;
  directionsService: google.maps.DirectionsService | null;
  autocompleteService: google.maps.places.AutocompleteService | null;
}

/**
 * Hook pour charger Google Maps API et initialiser les services
 * 
 * @returns {UseGoogleMapsReturn} État de chargement de Google Maps
 * 
 * @example
 * const { isLoaded, directionsService, autocompleteService } = useGoogleMaps();
 */
export const useGoogleMaps = (): UseGoogleMapsReturn => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
  const [autocompleteService, setAutocompleteService] = useState<google.maps.places.AutocompleteService | null>(null);

  const initializeServices = useCallback(() => {
    if (window.google && window.google.maps) {
      try {
        // Vérifier que DirectionsService est disponible
        if (!window.google.maps.DirectionsService) {
          throw new Error('DirectionsService non disponible. Vérifiez que Google Maps API est chargée.');
        }

        // Vérifier que la bibliothèque places est disponible (peut prendre un peu de temps)
        if (!window.google.maps.places) {
          // Attendre un peu et réessayer
          setTimeout(() => {
            if (window.google?.maps?.places) {
              try {
                setDirectionsService(new window.google.maps.DirectionsService());
                setAutocompleteService(new window.google.maps.places.AutocompleteService());
                setIsLoaded(true);
                setLoadError(null);
              } catch (err: unknown) {
                console.error('Erreur lors de l\'initialisation des services Google Maps:', err);
                setLoadError((err as Error).message || 'Erreur d\'initialisation de Google Maps');
              }
            } else {
              setLoadError('La bibliothèque "places" n\'est pas disponible. Vérifiez que l\'API Places est activée.');
            }
          }, 500);
          return;
        }

        // Initialiser les services
        setDirectionsService(new window.google.maps.DirectionsService());
        setAutocompleteService(new window.google.maps.places.AutocompleteService());
        setIsLoaded(true);
        setLoadError(null);
      } catch (err: unknown) {
        console.error('Erreur lors de l\'initialisation des services Google Maps:', err);
        setLoadError((err as Error).message || 'Erreur d\'initialisation de Google Maps');
      }
    }
  }, []);

  useEffect(() => {
    // Vérifier si Google Maps est déjà chargé
    if (window.google && window.google.maps) {
      // Attendre que places soit disponible si ce n'est pas déjà le cas
      if (window.google.maps.places) {
        initializeServices();
      } else {
        // Attendre un peu pour que places se charge
        const checkPlaces = setInterval(() => {
          if (window.google?.maps?.places) {
            clearInterval(checkPlaces);
            initializeServices();
          }
        }, 50); // Optimisé pour Android

        const placesTimeout = setTimeout(() => {
          clearInterval(checkPlaces);
          if (!window.google?.maps?.places) {
            setLoadError('La bibliothèque "places" n\'est pas disponible. Vérifiez que l\'API Places est activée.');
          }
        }, 5000);

        return () => {
          clearInterval(checkPlaces);
          clearTimeout(placesTimeout);
        };
      }
      return;
    }

    // Vérifier si un script est déjà en cours de chargement
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      const checkLoaded = setInterval(() => {
        if (window.google && window.google.maps && window.google.maps.places) {
          clearInterval(checkLoaded);
          initializeServices();
        }
      }, 50); // Optimisé pour vérification rapide

      // Timeout après 5 secondes (optimisé)
      const loadTimeout = setTimeout(() => {
        clearInterval(checkLoaded);
        if (!window.google?.maps?.places) {
          setLoadError('Timeout: La bibliothèque "places" n\'a pas pu être chargée. Vérifiez que l\'API Places est activée.');
        }
      }, 5000);

      return () => {
        clearInterval(checkLoaded);
        clearTimeout(loadTimeout);
      };
    }

    // Charger le script Google Maps
    // Utiliser la clé spécifique à la plateforme
    let apiKey: string | undefined;

    // Pour le SDK JavaScript Google Maps, on doit TOUJOURS utiliser une clé avec restrictions HTTP (Referrer)
    // ou sans restriction. Les clés restreintes par application Android (SHA-1) NE FONCTIONNENT PAS
    // avec le SDK JavaScript, même dans une WebView Android.
    // On utilise donc toujours la clé "Browser" / "Web".
    apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    // Debug: Afficher quelle clé est utilisée
    console.log('🔑 [useGoogleMaps] Clé depuis .env:', apiKey ? apiKey.substring(0, 20) + '...' : 'NON DÉFINIE');

    if (!apiKey) {
      setLoadError('Clé API Google Maps manquante.');
      return;
    }

    // Vérifier que la clé API a le bon format
    if (!apiKey.startsWith('AIza')) {
      setLoadError('Format de clé API invalide. La clé doit commencer par "AIza"');
      return;
    }

    const script = document.createElement('script');
    const callbackName = `__googleMapsReady_${Date.now()}`;
    (window as unknown as Record<string, () => void>)[callbackName] = () => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
      initializeServices();
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;

    // Gérer les erreurs de chargement du script
    script.onerror = () => {
      setLoadError('Erreur de chargement de Google Maps. Vérifiez votre clé API dans Google Cloud Console.');
    };

    // Écouter les erreurs globales de Google Maps
    const errorHandler = (event: ErrorEvent) => {
      if (event.message && event.message.includes('ApiProjectMapError')) {
        setLoadError('Erreur de configuration de la clé API. Vérifiez que les APIs sont activées dans Google Cloud Console et que les restrictions autorisent localhost:3000');
        window.removeEventListener('error', errorHandler);
      }
    };

    window.addEventListener('error', errorHandler);

    document.head.appendChild(script);

    return () => {
      window.removeEventListener('error', errorHandler);
    };
  }, [initializeServices]);

  return { isLoaded, loadError, directionsService, autocompleteService };
};
