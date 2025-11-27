/**
 * Composant AddressInput
 * 
 * Champ de saisie avec autocomplétion d'adresses Google Places
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { PlaceSuggestion } from '@/types';
import { usePlacesAutocomplete } from '@/hooks/usePlacesAutocomplete';

interface AddressInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: PlaceSuggestion) => void;
  placeholder?: string;
  autocompleteService: google.maps.places.AutocompleteService | null;
  location?: { lat: number; lng: number } | null;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  externalLoading?: boolean;
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
  externalLoading = false,
}: AddressInputProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { suggestions, loading, getSuggestions, clearSuggestions } = usePlacesAutocomplete({
    autocompleteService,
    location,
  });

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

  return (
    <div ref={containerRef} className="relative w-full">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete="off"
          className={`w-full p-3 sm:p-3.5 border rounded-lg text-[#101010] placeholder-gray-400 bg-white focus:ring-2 focus:ring-[#f29200] focus:border-transparent ${error ? 'border-red-500' : 'border-gray-300'
            } ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
          style={{ fontSize: '16px' }} // Évite le zoom automatique sur iOS
        />

        {(loading || externalLoading) && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-[#f29200]"></div>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}

      {/* Liste des suggestions */}
      {isFocused && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto overscroll-contain">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.place_id}
              onClick={() => handleSelectSuggestion(suggestion)}
              onTouchStart={(e) => e.currentTarget.classList.add('bg-[#f29200]', 'text-white')}
              onTouchEnd={(e) => e.currentTarget.classList.remove('bg-[#f29200]', 'text-white')}
              className="p-3 active:bg-[#f29200] active:text-white hover:bg-[#f29200] hover:text-white cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 text-gray-900 touch-manipulation"
              style={{ minHeight: '48px' }}
            >
              <div className="flex items-start">
                <svg className="w-5 h-5 mr-2 mt-0.5 text-gray-600 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

