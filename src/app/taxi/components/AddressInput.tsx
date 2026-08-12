'use client';

import { useState, useRef, useEffect, useId, useCallback, useMemo } from 'react';
import { PlaceSuggestion } from '@/types';
import { usePlacesAutocomplete } from '@/hooks/usePlacesAutocomplete';
import type { PlacesAutocompleteService } from '@/hooks/usePlacesAutocomplete';
import { useCapacitorGeolocation } from '@/hooks/useCapacitorGeolocation';
import { useCountryDetection } from '@/hooks/useCountryDetection';
import { getDefaultCountryRestriction } from '@/utils/constants';
import { reverseGeocodeAddress } from '@/services/reverseGeocode.service';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import {
  driverFieldClassName,
  driverFieldErrorClassName,
  driverFieldLabelClassName,
} from '@/app/driver/register/components/driverOnboardingStyles';
import { cn } from '@/lib/utils';

export interface AddressInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: PlaceSuggestion) => void;
  placeholder?: string;
  autocompleteService: PlacesAutocompleteService | null;
  location?: { lat: number; lng: number } | null;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  errorId?: string;
  helperText?: string;
  externalLoading?: boolean;
  countryRestriction?: string[];
  enableLocationButton?: boolean;
  onLocationResolved?: (location: { lat: number; lng: number; accuracy?: number }, address: string) => void;
  locationButtonLabel?: string;
}

export const AddressInput = ({
  label,
  value,
  onChange,
  onSelect,
  placeholder,
  autocompleteService,
  location,
  disabled = false,
  required = false,
  error,
  errorId,
  helperText,
  externalLoading = false,
  countryRestriction,
  enableLocationButton = false,
  onLocationResolved,
  locationButtonLabel,
}: AddressInputProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const [internalGeoLoading, setInternalGeoLoading] = useState(false);
  const [geoErrorMessage, setGeoErrorMessage] = useState<string | null>(null);
  const [userDismissedGeoError, setUserDismissedGeoError] = useState(false);
  const { getCurrentPosition, loading: geoLoading, error: geoError } = useCapacitorGeolocation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [internalLocation, setInternalLocation] = useState<{ lat: number; lng: number } | null>(null);

  const effectiveLocation = location ?? internalLocation;

  const { country: detectedCountry } = useCountryDetection({
    location: effectiveLocation,
    enabled: !countryRestriction,
  });

  const effectiveCountryRestriction = useMemo(() => {
    return countryRestriction?.length
      ? countryRestriction
      : getDefaultCountryRestriction(detectedCountry);
  }, [countryRestriction, detectedCountry]);

  const { suggestions, loading, getSuggestions, clearSuggestions, resetSession } = usePlacesAutocomplete({
    autocompleteService,
    location: effectiveLocation,
    countryRestriction: effectiveCountryRestriction,
  });


  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleUseCurrentLocation = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch (err) {
        console.warn('Haptic feedback non disponible:', err);
      }
    }

    if (!isMounted.current) return;
    setInternalGeoLoading(true);
    setGeoErrorMessage(null);
    setUserDismissedGeoError(false);

    try {
      const position = await getCurrentPosition('booking');
      if (!isMounted.current) return;

      if (position) {
        setInternalLocation({ lat: position.lat, lng: position.lng });
        const locationObj = { lat: position.lat, lng: position.lng, accuracy: position.accuracy };
        let finalAddress = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;

        try {
          const address = await reverseGeocodeAddress(position.lat, position.lng);
          if (address) {
            finalAddress = address;
          }
        } catch (e) {
          console.warn('Reverse geocoding failed', e);
        }

        if (!isMounted.current) return;

        onSelect({
          place_id: '',
          description: finalAddress,
        });
        onChange(finalAddress);
        if (onLocationResolved) {
          onLocationResolved(locationObj, finalAddress);
        }
      }
    } catch (err: unknown) {
      if (!isMounted.current) return;
      const msg = err instanceof Error ? err.message : 'Impossible de récupérer votre position';
      setGeoErrorMessage(msg);
    } finally {
      if (isMounted.current) {
        setInternalGeoLoading(false);
      }
    }
  }, [getCurrentPosition, onChange, onSelect, onLocationResolved]);

  // Réessayer l'autocomplétion si le service devient disponible et qu'il y a déjà du texte
  useEffect(() => {
    if (autocompleteService && isFocused && value.length >= 3) {
      getSuggestions(value);
    }
  }, [autocompleteService, isFocused, value, getSuggestions]);

  // Fermer les suggestions quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        clearSuggestions();
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [clearSuggestions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setGeoErrorMessage(null);
    setUserDismissedGeoError(true);
    onChange(newValue);
    // Toujours appeler getSuggestions - le hook gère lui-même la vérification du service
    if (newValue.length >= 3) {
      getSuggestions(newValue);
    } else {
      clearSuggestions();
    }
  };

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    onChange(suggestion.description);
    onSelect(suggestion);
    clearSuggestions();
    // Clôture la session Places (nouveau token pour la prochaine recherche)
    resetSession();
    setIsFocused(false);
    inputRef.current?.blur();
  };

  const handleFocus = () => {
    setIsFocused(true);
    // Réessayer l'autocomplétion si on a déjà du texte
    if (value.length >= 3) {
      getSuggestions(value);
    }
  };

  const isLocationLoading = geoLoading || internalGeoLoading || externalLoading;
  const activeGeoError = !userDismissedGeoError && (geoErrorMessage || geoError);

  return (
    <div ref={containerRef} className="relative w-full">
      <label htmlFor={inputId} className={driverFieldLabelClassName}>
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      <div className="relative">
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete="off"
          aria-describedby={error && errorId ? errorId : undefined}
          className={cn(
            driverFieldClassName,
            error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-white/[0.08]'
          )}
          style={{ fontSize: '16px' }} // Évite le zoom automatique sur iOS
        />

        {(loading || externalLoading) && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-[#f29200]"></div>
          </div>
        )}
      </div>

      {error ? (
        <p id={errorId} className={driverFieldErrorClassName}>{error}</p>
      ) : helperText ? (
        <p className="mt-1 text-xs text-slate-400">{helperText}</p>
      ) : null}

      {/* Bouton Utiliser ma position */}
      {enableLocationButton && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex justify-start">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={disabled || isLocationLoading}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08] active:scale-95 touch-manipulation disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLocationLoading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                  Détection en cours
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5 text-[#f29200]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 21s6-4.35 6-10a6 6 0 10-12 0c0 5.65 6 10 6 10z" />
                    <circle cx="12" cy="11" r="2.25" />
                  </svg>
                  {locationButtonLabel || 'Utiliser ma position'}
                </>
              )}
            </button>
          </div>

          {activeGeoError && (
            <div role="alert" aria-live="polite" className="bg-[#f29200]/10 border-l-4 border-orange-400 p-3 rounded-lg text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 text-[#f29200]">
                  <p className="font-medium">Impossible de détecter votre position</p>
                  <p className="mt-0.5 text-slate-400">Vérifiez que le GPS est activé et réessayez.</p>
                </div>
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-3 py-1 rounded bg-[#f29200]/20 hover:bg-[#f29200]/30 text-[#f29200] font-medium transition-colors touch-manipulation"
                >
                  Réessayer
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Liste des suggestions */}
      {isFocused && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-[#1A1A1A] border border-white/[0.08] rounded-lg shadow-lg max-h-60 overflow-auto overscroll-contain">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.place_id}
              onClick={() => handleSelectSuggestion(suggestion)}
              onTouchStart={(e) => e.currentTarget.classList.add('bg-[#f29200]', 'text-white')}
              onTouchEnd={(e) => e.currentTarget.classList.remove('bg-[#f29200]', 'text-white')}
              className="p-3 active:bg-[#f29200] active:text-white hover:bg-white/5 hover:text-white cursor-pointer transition-colors border-b border-white/[0.06] last:border-b-0 text-white touch-manipulation"
              style={{ minHeight: '48px' }}
            >
              <div className="flex items-start">
                <svg className="w-5 h-5 mr-2 mt-0.5 text-[#4B5563] hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm font-medium">{suggestion.description}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};


