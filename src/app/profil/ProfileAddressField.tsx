'use client';

import { AddressInput } from '@/app/taxi/components/AddressInput';
import type { PlacesAutocompleteService } from '@/hooks/usePlacesAutocomplete';
import type { PlaceSuggestion } from '@/types';

interface ProfileAddressFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: PlaceSuggestion) => void;
  autocompleteService: PlacesAutocompleteService | null;
}

export function ProfileAddressField({
  value,
  onChange,
  onSelect,
  autocompleteService,
}: ProfileAddressFieldProps) {
  return (
    <AddressInput
      label="Adresse"
      value={value}
      onChange={onChange}
      onSelect={onSelect}
      placeholder="Votre adresse actuelle"
      autocompleteService={autocompleteService}
      enableLocationButton
      locationButtonLabel="Utiliser ma position"
    />
  );
}
