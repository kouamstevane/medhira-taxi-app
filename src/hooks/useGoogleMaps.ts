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
        setDirectionsService(new window.google.maps.DirectionsService());
        setAutocompleteService(new window.google.maps.places.AutocompleteService());
        setIsLoaded(true);
      } catch (err) {
        console.error('Erreur lors de l\'initialisation des services Google Maps:', err);
        setLoadError('Erreur d\'initialisation de Google Maps');
      }
    }
  }, []);

  useEffect(() => {
    // Vérifier si Google Maps est déjà chargé
    if (window.google && window.google.maps) {
      initializeServices();
      return;
    }

    // Vérifier si un script est déjà en cours de chargement
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      const checkLoaded = setInterval(() => {
        if (window.google && window.google.maps) {
          clearInterval(checkLoaded);
          initializeServices();
        }
      }, 100);
      return () => clearInterval(checkLoaded);
    }

    // Charger le script Google Maps
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setLoadError('Clé API Google Maps manquante');
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,routes&callback=initMap`;
    script.async = true;
    script.defer = true;

    window.initMap = () => {
      initializeServices();
    };

    script.onerror = () => {
      setLoadError('Erreur de chargement de Google Maps');
    };

    document.head.appendChild(script);

    return () => {
      // Nettoyage si nécessaire
      if ('initMap' in window) {
        window.initMap = undefined as any;
      }
    };
  }, [initializeServices]);

  return { isLoaded, loadError, directionsService, autocompleteService };
};
