import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Step2Identity from '../Step2Identity';

jest.mock('@capacitor/camera', () => ({
  Camera: { getPhoto: jest.fn() },
  CameraResultType: { DataUrl: 'DataUrl' },
  CameraSource: { Camera: 'Camera' },
}));

jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: jest.fn(() => false) },
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    showError: jest.fn(),
  }),
}));

jest.mock('@/hooks/useGoogleMaps', () => ({
  useGoogleMaps: () => ({
    autocompleteService: null,
  }),
}));

jest.mock('@/app/taxi/components/AddressInput', () => ({
  AddressInput: ({ label, error }: { label?: string; error?: string }) => (
    <div>
      <label>{label}</label>
      {error ? <p>{error}</p> : null}
    </div>
  ),
}));

describe('Step2Identity', () => {
  it('updates the phone helper text when the user manually changes the dial code', async () => {
    render(
      <Step2Identity
        onNext={jest.fn()}
        onBack={jest.fn()}
        initialData={{
          firstName: 'Jean',
          lastName: 'Dupont',
          dob: '1990-01-01',
          phone: '+237 655 744 484',
          address: 'Yaounde',
          city: 'Yaounde',
          zipCode: '1000',
          province: 'Centre',
          country: 'Cameroun',
        }}
      />
    );

    expect(screen.getByText(/Format international requis, ex\. \+237/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Numéro de Téléphone/i), {
      target: { value: '+33 6 12 34 56 78' },
    });

    await waitFor(() => {
      expect(screen.getByText(/Format international requis, ex\. \+33/i)).toBeInTheDocument();
    });
  });
});
