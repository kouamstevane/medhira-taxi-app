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
  const originalGeolocation = global.navigator.geolocation;
  const originalGoogle = global.window.google;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => 'blob:test-photo');
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: originalGeolocation,
    });
    Object.defineProperty(global.window, 'google', {
      configurable: true,
      value: originalGoogle,
    });
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL ?? jest.fn();
  });

  it('keeps navigation actions on the shared CTA contracts', () => {
    render(<Step2Identity onNext={jest.fn()} onBack={jest.fn()} />);

    expect(screen.getByText('Identité').parentElement).toHaveClass('rounded-xl');
    expect(screen.getByRole('button', { name: /retour/i })).toHaveClass('border-white/10');
    expect(screen.getByRole('button', { name: /continuer/i })).toHaveClass('from-[#f29200]');
  });

  it('keeps date inputs on the shared driver input chrome', () => {
    render(<Step2Identity onNext={jest.fn()} onBack={jest.fn()} />);

    for (const input of [
      screen.getByLabelText(/Jour de naissance/i),
      screen.getByLabelText(/Mois de naissance/i),
      screen.getByLabelText(/Ann.e de naissance/i),
    ]) {
      expect(input).toHaveClass('h-14');
      expect(input).toHaveClass('border-white/[0.08]');
      expect(input).toHaveClass('focus:ring-2');
      expect(input).toHaveClass('focus:ring-[#f29200]');
      expect(input).toHaveClass('focus:border-[#f29200]');
      expect(input).not.toHaveClass('focus:border-primary');
    }
  });

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

  it('does not show a success text after using current location', async () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: (position: GeolocationPosition) => void) =>
          success({
            coords: {
              latitude: 4.0511,
              longitude: 9.7679,
              accuracy: 1,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition),
      },
    });

    Object.defineProperty(global.window, 'google', {
      configurable: true,
      value: {
        maps: {
          Geocoder: function MockGeocoder() {
            return {
              geocode: (
                _request: unknown,
                callback: (results: Array<{ address_components: Array<{ long_name: string; short_name: string; types: string[] }>; formatted_address: string }>, status: string) => void
              ) => callback([
                {
                  formatted_address: '3P3C+J6G, Douala, Cameroun',
                  address_components: [
                    { long_name: 'Douala', short_name: 'Douala', types: ['locality'] },
                    { long_name: 'Région du Littoral', short_name: 'LT', types: ['administrative_area_level_1'] },
                    { long_name: 'Cameroun', short_name: 'CM', types: ['country'] },
                  ],
                },
              ], 'OK'),
            };
          },
        },
      },
    });

    render(<Step2Identity onNext={jest.fn()} onBack={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /utiliser ma position/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Position détectée et adresse remplie automatiquement/i)).not.toBeInTheDocument();
    });
  });
  it('submits the form even when the detected address has no zip code', async () => {
    const onNext = jest.fn();
    const photo = new File(['photo'], 'biometric.jpg', { type: 'image/jpeg' });

    render(
      <Step2Identity
        onNext={onNext}
        onBack={jest.fn()}
        initialPhoto={photo}
        initialData={{
          firstName: 'Olive',
          lastName: 'Steve',
          dob: '1992-05-30',
          phone: '+237682821031',
          address: '3P3C+J6G, Douala, Cameroun',
          city: 'Douala',
          zipCode: '',
          province: 'Région du Littoral',
          country: 'Cameroun',
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));

    await waitFor(() => {
      expect(onNext).toHaveBeenCalledWith(
        expect.objectContaining({
          city: 'Douala',
          zipCode: '',
          province: 'Région du Littoral',
          country: 'Cameroun',
        }),
        photo
      );
    });
  });
});
