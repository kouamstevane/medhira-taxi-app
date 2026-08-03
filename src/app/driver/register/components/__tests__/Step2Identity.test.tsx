import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Capacitor } from '@capacitor/core';
import { LocationSettings } from '@/plugins/location-settings';
import Step2Identity from '../Step2Identity';

jest.mock('@capacitor/camera', () => ({
  Camera: { getPhoto: jest.fn() },
  CameraResultType: { DataUrl: 'DataUrl' },
  CameraSource: { Camera: 'Camera' },
}));

jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: jest.fn(() => false),
    getPlatform: jest.fn(() => 'web'),
  },
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

var mockGetCurrentPosition = jest.fn();

jest.mock('@/hooks/useCapacitorGeolocation', () => ({
  useCapacitorGeolocation: () => ({
    getCurrentPosition: mockGetCurrentPosition,
  }),
}));

jest.mock('@/plugins/location-settings', () => ({
  LocationSettings: {
    open: jest.fn(),
  },
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
    mockGetCurrentPosition.mockReset();
    (LocationSettings.open as jest.Mock).mockReset();
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(false);
    (Capacitor.getPlatform as jest.Mock).mockReturnValue('web');
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
    mockGetCurrentPosition.mockResolvedValue({
      lat: 4.0511,
      lng: 9.7679,
      accuracy: 1,
      timestamp: Date.now(),
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
      expect(screen.getByDisplayValue('Douala')).toBeInTheDocument();
    });
  });

  it('uses the shared Capacitor geolocation service for the current location', async () => {
    const browserPosition = {
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
    } as GeolocationPosition;
    const nativeLocation = {
      lat: browserPosition.coords.latitude,
      lng: browserPosition.coords.longitude,
      accuracy: browserPosition.coords.accuracy,
      timestamp: browserPosition.timestamp,
    };
    mockGetCurrentPosition.mockResolvedValue(nativeLocation);

    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: jest.fn(),
      },
    });

    render(<Step2Identity onNext={jest.fn()} onBack={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /utiliser ma position/i }));

    await waitFor(() => {
      expect(mockGetCurrentPosition).toHaveBeenCalledWith('booking', false);
    });
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('explains when Android location services are disabled and opens their settings', async () => {
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(true);
    (Capacitor.getPlatform as jest.Mock).mockReturnValue('android');
    mockGetCurrentPosition.mockRejectedValue(new Error('Location services are not enabled.'));

    render(<Step2Identity onNext={jest.fn()} onBack={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /utiliser ma position/i }));

    const settingsButton = await screen.findByRole('button', { name: /activer la localisation/i });
    expect(screen.getByText(/services de localisation sont désactivés/i)).toBeInTheDocument();

    fireEvent.click(settingsButton);

    await waitFor(() => {
      expect(LocationSettings.open).toHaveBeenCalledTimes(1);
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
