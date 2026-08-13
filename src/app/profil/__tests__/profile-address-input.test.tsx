import { render, screen } from '@testing-library/react';
import { ProfileAddressField } from '../ProfileAddressField';

jest.mock('@/app/taxi/components/AddressInput', () => ({
  AddressInput: ({
    label,
    enableLocationButton,
    locationButtonLabel,
  }: {
    label: string;
    enableLocationButton?: boolean;
    locationButtonLabel?: string;
  }) => (
    <div>
      <span>{label}</span>
      {enableLocationButton && <button>{locationButtonLabel}</button>}
    </div>
  ),
}));

describe('ProfileAddressField', () => {
  it('enables autocomplete-compatible location entry for the profile address', () => {
    render(
      <ProfileAddressField
        value=""
        onChange={() => undefined}
        onSelect={() => undefined}
        autocompleteService={null}
      />
    );

    expect(screen.getByText('Adresse')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Utiliser ma position' })).toBeInTheDocument();
  });
});
