import { useState, useCallback, useRef, useEffect } from 'react';
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

  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const clearSuggestions = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setSuggestions([]);
  }, []);

  const getSuggestions = useCallback(
    (input: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!autocompleteService || !input) {
        return;
      }

      debounceRef.current = setTimeout(() => {
        setLoading(true);

        const request: google.maps.places.AutocompletionRequest = {
          input,
        };

        if (location) {
          request.locationBias = new google.maps.Circle({
            center: location,
            radius: 50000,
          });
        }

        autocompleteService.getPlacePredictions(
          request,
          (predictions, status) => {
            if (!mountedRef.current) return;
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
      }, 250);
    },
    [autocompleteService, location]
  );

  return { suggestions, loading, getSuggestions, clearSuggestions };
};
