import { renderHook, act, waitFor } from '@testing-library/react';
import { useCountryDetection } from '@/hooks/useCountryDetection';

jest.mock('@/services/secureStorage.service', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/utils/distance', () => ({
  haversineKm: jest.fn((a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const R = 6371;
    const toRad = (deg: number) => deg * (Math.PI / 180);
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }),
}));

import { secureStorage } from '@/services/secureStorage.service';
import { haversineKm } from '@/utils/distance';

const mockGeocoder = {
  geocode: jest.fn(),
};

const originalWindowGoogle = (globalThis.window as Record<string, unknown>)?.google as unknown;

function mockGoogleMapsGeocoder() {
  (globalThis.window as Record<string, unknown>).google = {
    maps: {
      Geocoder: jest.fn(() => mockGeocoder),
    },
  };
}

function unmockGoogleMaps() {
  (globalThis.window as Record<string, unknown>).google = originalWindowGoogle;
}

beforeEach(() => {
  jest.clearAllMocks();
  (secureStorage.getItem as jest.Mock).mockResolvedValue(null);
  (secureStorage.setItem as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  unmockGoogleMaps();
});

describe('useCountryDetection', () => {
  it('retourne country=null et loading=false quand location=null', () => {
    const { result } = renderHook(() =>
      useCountryDetection({ location: null, enabled: true })
    );
    expect(result.current.country).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.isSupported).toBe(false);
  });

  it('retourne country=null quand enabled=false', () => {
    const { result } = renderHook(() =>
      useCountryDetection({ location: { lat: 4.05, lng: 9.77 }, enabled: false })
    );
    expect(result.current.country).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('utilise le cache SecureStorage si valide et <1km', async () => {
    const cached = {
      country: 'CM',
      lat: 4.05,
      lng: 9.77,
      timestamp: Date.now(),
    };
    (secureStorage.getItem as jest.Mock).mockResolvedValue(cached);

    const { result } = renderHook(() =>
      useCountryDetection({ location: { lat: 4.05, lng: 9.77 }, enabled: true })
    );

    await waitFor(() => {
      expect(result.current.country).toBe('CM');
      expect(result.current.isSupported).toBe(true);
      expect(result.current.loading).toBe(false);
    });
  });

  it('invalide le cache si >1km', async () => {
    const cached = {
      country: 'CM',
      lat: 4.05,
      lng: 9.77,
      timestamp: Date.now(),
    };
    (secureStorage.getItem as jest.Mock).mockResolvedValue(cached);

    mockGoogleMapsGeocoder();
    mockGeocoder.geocode.mockImplementation((_req: unknown, cb: (results: unknown[], status: string) => void) => {
      cb(
        [{ address_components: [{ types: ['country'], short_name: 'FR' }] }] as unknown[],
        'OK'
      );
    });

    const { result } = renderHook(() =>
      useCountryDetection({ location: { lat: 48.86, lng: 2.35 }, enabled: true })
    );

    await waitFor(() => {
      expect(result.current.country).toBe('FR');
    });
  });

  it('invalide le cache si TTL expiré (>30min)', async () => {
    const cached = {
      country: 'CM',
      lat: 4.05,
      lng: 9.77,
      timestamp: Date.now() - 31 * 60 * 1000,
    };
    (secureStorage.getItem as jest.Mock).mockResolvedValue(cached);

    mockGoogleMapsGeocoder();
    mockGeocoder.geocode.mockImplementation((_req: unknown, cb: (results: unknown[], status: string) => void) => {
      cb(
        [{ address_components: [{ types: ['country'], short_name: 'CM' }] }] as unknown[],
        'OK'
      );
    });

    const { result } = renderHook(() =>
      useCountryDetection({ location: { lat: 4.05, lng: 9.77 }, enabled: true })
    );

    await waitFor(() => {
      expect(result.current.country).toBe('CM');
      expect(mockGeocoder.geocode).toHaveBeenCalled();
    });
  });

  it('fast-path bounding box retourne CM pour Douala', async () => {
    mockGoogleMapsGeocoder();
    mockGeocoder.geocode.mockImplementation((_req: unknown, cb: (results: unknown[], status: string) => void) => {
      cb(
        [{ address_components: [{ types: ['country'], short_name: 'CM' }] }] as unknown[],
        'OK'
      );
    });

    const { result } = renderHook(() =>
      useCountryDetection({ location: { lat: 4.05, lng: 9.77 }, enabled: true })
    );

    await waitFor(() => {
      expect(result.current.country).toBe('CM');
      expect(result.current.isSupported).toBe(true);
    });
  });

  it('slow-path Geocoder retourne CA pour Montréal', async () => {
    mockGoogleMapsGeocoder();
    mockGeocoder.geocode.mockImplementation((_req: unknown, cb: (results: unknown[], status: string) => void) => {
      cb(
        [{ address_components: [{ types: ['country'], short_name: 'CA' }] }] as unknown[],
        'OK'
      );
    });

    const { result } = renderHook(() =>
      useCountryDetection({ location: { lat: 45.50, lng: -73.57 }, enabled: true })
    );

    await waitFor(() => {
      expect(result.current.country).toBe('CA');
    });
  });

  it('retourne country=null pour pays non supporté (US)', async () => {
    mockGoogleMapsGeocoder();
    mockGeocoder.geocode.mockImplementation((_req: unknown, cb: (results: unknown[], status: string) => void) => {
      cb(
        [{ address_components: [{ types: ['country'], short_name: 'US' }] }] as unknown[],
        'OK'
      );
    });

    const { result } = renderHook(() =>
      useCountryDetection({ location: { lat: 40.71, lng: -74.01 }, enabled: true })
    );

    await waitFor(() => {
      expect(result.current.country).toBeNull();
      expect(result.current.isSupported).toBe(false);
    });
  });

  it('retourne le résultat du fast-path si slow-path timeout', async () => {
    mockGoogleMapsGeocoder();
    mockGeocoder.geocode.mockImplementation(() => {
      // Ne jamais appeler le callback = timeout
    });

    jest.useFakeTimers();

    const { result } = renderHook(() =>
      useCountryDetection({ location: { lat: 4.05, lng: 9.77 }, enabled: true })
    );

    await act(async () => {
      jest.advanceTimersByTime(4000);
    });

    await waitFor(() => {
      expect(result.current.country).toBe('CM');
      expect(result.current.loading).toBe(false);
    });

    jest.useRealTimers();
  });

  it('ne déclenche pas de re-detection pour un nouvel objet même lat/lng', async () => {
    mockGoogleMapsGeocoder();
    mockGeocoder.geocode.mockImplementation((_req: unknown, cb: (results: unknown[], status: string) => void) => {
      cb(
        [{ address_components: [{ types: ['country'], short_name: 'CM' }] }] as unknown[],
        'OK'
      );
    });

    const { result, rerender } = renderHook(
      ({ location }: { location: { lat: number; lng: number } }) =>
        useCountryDetection({ location, enabled: true }),
      { initialProps: { location: { lat: 4.05, lng: 9.77 } } }
    );

    await waitFor(() => {
      expect(result.current.country).toBe('CM');
    });

    const callCount = mockGeocoder.geocode.mock.calls.length;

    rerender({ location: { lat: 4.05, lng: 9.77 } });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(mockGeocoder.geocode.mock.calls.length).toBe(callCount);
  });

  it('utilise le fallback mémoire si SecureStorage échoue', async () => {
    (secureStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage unavailable'));

    mockGoogleMapsGeocoder();
    mockGeocoder.geocode.mockImplementation((_req: unknown, cb: (results: unknown[], status: string) => void) => {
      cb(
        [{ address_components: [{ types: ['country'], short_name: 'FR' }] }] as unknown[],
        'OK'
      );
    });

    const { result } = renderHook(() =>
      useCountryDetection({ location: { lat: 48.86, lng: 2.35 }, enabled: true })
    );

    await waitFor(() => {
      expect(result.current.country).toBe('FR');
    });
  });
});
