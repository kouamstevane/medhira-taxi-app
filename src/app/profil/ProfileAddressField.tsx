'use client';

import { AddressInput } from '@/app/taxi/components/AddressInput';
import { useTranslation } from '@/hooks/useTranslation';
import type { PlacesAutocompleteService } from '@/hooks/usePlacesAutocomplete';
import type { PlaceSuggestion } from '@/types';

interface ProfileAddressFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSelect: (suggestion: PlaceSuggestion) => void;
  readonly autocompleteService: PlacesAutocompleteService | null;
}

export function ProfileAddressField({
  value,
  onChange,
  onSelect,
  autocompleteService,
}: ProfileAddressFieldProps) {
  const { t } = useTranslation();

  return (
    <AddressInput
      label={t('profile.address')}
      value={value}
      onChange={onChange}
      onSelect={onSelect}
      placeholder={t('profile.currentAddressPlaceholder')}
      autocompleteService={autocompleteService}
      enableLocationButton
      locationButtonLabel={t('profile.useMyLocation')}
    />
  );
}
