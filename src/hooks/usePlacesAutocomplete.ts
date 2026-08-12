import { useState, useCallback, useRef, useEffect } from 'react';
import { PlaceSuggestion } from '@/types';
import { getDefaultCountryRestriction } from '@/utils/constants';

interface UsePlacesAutocompleteProps {
  autocompleteService: PlacesAutocompleteService | null;
  location?: { lat: number; lng: number } | null;
  countryRestriction?: string[];
}

export interface PlacesAutocompleteService {
  fetchAutocompleteSuggestions: (
    request: google.maps.places.AutocompleteRequest,
  ) => Promise<{ suggestions: google.maps.places.AutocompleteSuggestion[] }>;
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
  const requestIdRef = useRef(0);

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
    mountedRef.current = true;
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
    requestIdRef.current += 1;
    setLoading(false);
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

      const activeCountryRestriction = countryRestriction?.length
        ? countryRestriction
        : getDefaultCountryRestriction();

      // Cache mémoire : évite de refacturer les requêtes identiques dans la session
      const cacheKey = `${input.trim().toLowerCase()}|${activeCountryRestriction.join(',')}|${location ? `${location.lat.toFixed(3)},${location.lng.toFixed(3)}` : ''}`;
      const cached = predictionCacheRef.current.get(cacheKey);
      if (cached) {
        setLoading(false);
        setSuggestions(cached);
        return;
      }

      const requestId = ++requestIdRef.current;
      debounceRef.current = setTimeout(() => {
        setLoading(true);

        const request: google.maps.places.AutocompleteRequest = {
          input: input.trim(),
          sessionToken: getOrCreateSessionToken(),
          includedRegionCodes: activeCountryRestriction,
        };


        if (location) {
          request.locationBias = new google.maps.Circle({
            center: location,
            radius: 50000,
          });
        }

        void autocompleteService.fetchAutocompleteSuggestions(request)
          .then(({ suggestions: predictions }) => {
            if (!mountedRef.current || requestIdRef.current !== requestId) return;
            const mapped = predictions.flatMap((prediction) => {
              const placePrediction = prediction.placePrediction;
              if (!placePrediction) return [];
              return [{
                place_id: placePrediction.placeId,
                description: placePrediction.text.toString(),
              }];
            });
            predictionCacheRef.current.set(cacheKey, mapped);
            setLoading(false);
            setSuggestions(mapped);
          })
          .catch((error: unknown) => {
            if (!mountedRef.current || requestIdRef.current !== requestId) return;
            setLoading(false);
            setSuggestions([]);
            console.warn('[PlacesAutocomplete] Requête échouée:', error);
          });
      }, 250);
    },
    [autocompleteService, location, countryRestriction, getOrCreateSessionToken]
  );

  return { suggestions, loading, getSuggestions, clearSuggestions, resetSession };
};
