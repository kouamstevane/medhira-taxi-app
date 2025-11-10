/**
 * Hook usePlacesAutocomplete
 * 
 * Hook personnalisé pour gérer l'autocomplétion d'adresses avec Google Places API.
 * 
 * @hook
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PlaceSuggestion } from '@/types';

interface UsePlacesAutocompleteOptions {
  autocompleteService: google.maps.places.AutocompleteService | null;
  location?: { lat: number; lng: number } | null;
  debounceMs?: number;
}

interface UsePlacesAutocompleteReturn {
  suggestions: PlaceSuggestion[];
  loading: boolean;
  error: string | null;
  getSuggestions: (input: string) => void;
  clearSuggestions: () => void;
}

/**
 * Hook pour gérer l'autocomplétion d'adresses Google Places
 * 
 * @param options - Options de configuration
 * @returns État et fonctions pour l'autocomplétion
 * 
 * @example
 * const { suggestions, loading, getSuggestions, clearSuggestions } = usePlacesAutocomplete({
 *   autocompleteService,
 *   location: currentLocation
 * });
 */
export const usePlacesAutocomplete = (
  options: UsePlacesAutocompleteOptions
): UsePlacesAutocompleteReturn => {
  const { autocompleteService, location, debounceMs = 300 } = options;
  
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const getSuggestions = useCallback((input: string) => {
    // Nettoyer le timer précédent
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Vider les suggestions si l'input est trop court
    if (!input || input.length < 3) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Si le service n'est pas disponible, ne pas afficher d'erreur mais attendre
    if (!autocompleteService) {
      setLoading(false);
      setSuggestions([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    // Debounce pour éviter trop de requêtes
    debounceTimer.current = setTimeout(() => {
      // Vérifier à nouveau que le service est disponible (peut avoir changé pendant le debounce)
      if (!autocompleteService) {
        setLoading(false);
        setSuggestions([]);
        setError(null);
        return;
      }

      try {
        const request: google.maps.places.AutocompletionRequest = {
          input,
        };

        // Ajouter location et radius seulement si location est disponible
        if (location && window.google?.maps?.LatLng) {
          request.location = new window.google.maps.LatLng(location.lat, location.lng);
          request.radius = 20000; // 20km de rayon
        }

        autocompleteService.getPlacePredictions(request, (predictions, status) => {
          setLoading(false);

          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
            const formattedSuggestions: PlaceSuggestion[] = predictions.map(pred => ({
              description: pred.description,
              place_id: pred.place_id,
            }));
            setSuggestions(formattedSuggestions);
            setError(null);
          } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            setSuggestions([]);
            setError(null);
          } else {
            // Ne pas afficher d'erreur pour les statuts non critiques
            setSuggestions([]);
            setError(null);
          }
        });
      } catch (err: any) {
        console.error('Erreur lors de l\'appel à getPlacePredictions:', err);
        setLoading(false);
        setSuggestions([]);
        setError(null);
      }
    }, debounceMs);
  }, [autocompleteService, location, debounceMs]);

  const clearSuggestions = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    setSuggestions([]);
    setLoading(false);
    setError(null);
  }, []);

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return {
    suggestions,
    loading,
    error,
    getSuggestions,
    clearSuggestions,
  };
};

