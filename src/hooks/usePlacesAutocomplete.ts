import { useState, useCallback } from 'react';
import { PlaceSuggestion } from '@/types';

interface UsePlacesAutocompleteProps {
  autocompleteService: google.maps.places.AutocompleteService | null;
  location?: { lat: number; lng: number } | null;
}

interface UsePlacesAutocompleteReturn {
  suggestions: PlaceSuggestion[];
  loading: boolean;
  getSuggestions: (input: string) => void;
  clearSuggestions: () => void;
}

export const usePlacesAutocomplete = ({
  autocompleteService,
  location,
}: UsePlacesAutocompleteProps): UsePlacesAutocompleteReturn => {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
  }, []);

  const getSuggestions = useCallback(
    (input: string) => {
      if (!autocompleteService || !input) {
        return;
      }

      setLoading(true);

      const request: google.maps.places.AutocompletionRequest = {
        input,
        // Pas de restriction de pays par défaut pour permettre une utilisation internationale
        // ou basée sur la localisation de l'utilisateur
      };

      if (location) {
        request.locationBias = new google.maps.Circle({
          center: location,
          radius: 50000, // 50km bias
        });
      }

      autocompleteService.getPlacePredictions(
        request,
        (predictions, status) => {
          setLoading(false);
          if (
            status === google.maps.places.PlacesServiceStatus.OK &&
            predictions
          ) {
            setSuggestions(
              predictions.map((prediction) => ({
                place_id: prediction.place_id,
                description: prediction.description,
              }))
            );
          } else {
            setSuggestions([]);
          }
        }
      );
    },
    [autocompleteService, location]
  );

  return { suggestions, loading, getSuggestions, clearSuggestions };
};
