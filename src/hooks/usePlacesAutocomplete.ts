import { useState, useCallback, useRef, useEffect } from 'react';
import { PlaceSuggestion } from '@/types';

interface UsePlacesAutocompleteProps {
  autocompleteService: google.maps.places.AutocompleteService | null;
  location?: { lat: number; lng: number } | null;
  countryRestriction?: string[];
}

interface UsePlacesAutocompleteReturn {
  suggestions: PlaceSuggestion[];
  loading: boolean;
  getSuggestions: (input: string) => void;
  /** Vide la liste de suggestions affichées. Ne clôture PAS la session Places en cours. */
  clearSuggestions: () => void;
  /**
   * Clôture la session Places (= nouveau token). À appeler après une sélection
   * utilisateur effective, pas sur un simple effacement de l'input — sinon on
   * facture plusieurs sessions là où une seule devrait suffire.
   */
  resetSession: () => void;
}

export const usePlacesAutocomplete = ({
  autocompleteService,
  location,
  countryRestriction,
}: UsePlacesAutocompleteProps): UsePlacesAutocompleteReturn => {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const predictionCacheRef = useRef<Map<string, PlaceSuggestion[]>>(new Map());

  // Crée/réutilise un session token. Un token = 1 session facturée Places à $2.83/1000
  // au lieu de $17/1000 par requête. Il est renouvelé après chaque sélection (via
  // clearSuggestions) pour démarrer une nouvelle session.
  const getOrCreateSessionToken = useCallback((): google.maps.places.AutocompleteSessionToken | undefined => {
    if (typeof window === 'undefined' || !window.google?.maps?.places?.AutocompleteSessionToken) {
      return undefined;
    }
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
    return sessionTokenRef.current;
  }, []);

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
    // NE PAS renouveler le token ici : l'utilisateur peut effacer / retaper sans
    // que ce soit une nouvelle session de recherche. Le token n'est renouvelé
    // que via resetSession() (appelé après une sélection effective).
  }, []);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = null;
  }, []);

  const getSuggestions = useCallback(
    (input: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!autocompleteService || !input) {
        return;
      }

      // Cache mémoire : évite de refacturer les requêtes identiques dans la session
      const cacheKey = `${input.trim().toLowerCase()}|${countryRestriction?.join(',') ?? ''}|${location ? `${location.lat.toFixed(3)},${location.lng.toFixed(3)}` : ''}`;
      const cached = predictionCacheRef.current.get(cacheKey);
      if (cached) {
        setSuggestions(cached);
        return;
      }

      debounceRef.current = setTimeout(() => {
        setLoading(true);

        const request: google.maps.places.AutocompletionRequest = {
          input,
          sessionToken: getOrCreateSessionToken(),
          componentRestrictions: countryRestriction?.length
            ? { country: countryRestriction }
            : undefined,
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
              const mapped = predictions.map((prediction) => ({
                place_id: prediction.place_id,
                description: prediction.description,
              }));
              predictionCacheRef.current.set(cacheKey, mapped);
              setSuggestions(mapped);
            } else {
              setSuggestions([]);
            }
          }
        );
      }, 250);
    },
    [autocompleteService, location, countryRestriction, getOrCreateSessionToken]
  );

  return { suggestions, loading, getSuggestions, clearSuggestions, resetSession };
};
