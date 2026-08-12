import { act, renderHook } from '@testing-library/react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { useCapacitorGeolocation } from '@/hooks/useCapacitorGeolocation';

jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: jest.fn(),
  },
}));

jest.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    checkPermissions: jest.fn(),
    requestPermissions: jest.fn(),
    getCurrentPosition: jest.fn(),
    clearWatch: jest.fn(),
  },
}));

jest.mock('@/services/secureStorage.service', () => ({
  secureStorage: {
    setLastKnownPosition: jest.fn(),
    getLastKnownPosition: jest.fn(),
  },
}));

describe('useCapacitorGeolocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(false);
    (Geolocation.checkPermissions as jest.Mock).mockResolvedValue({ location: 'granted' });
    (Geolocation.getCurrentPosition as jest.Mock).mockRejectedValue(new Error('Capacitor indisponible sur web'));
  });

  it('n’utilise pas l’API Capacitor après un échec de géolocalisation navigateur', async () => {
    const browserGeolocation = {
      watchPosition: jest.fn((_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 1, message: 'Position refusée' } as GeolocationPositionError);
        return 1;
      }),
      clearWatch: jest.fn(),
    };
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: browserGeolocation,
    });

    const { result } = renderHook(() => useCapacitorGeolocation());

    await act(async () => {
      await expect(result.current.getCurrentPosition()).rejects.toThrow();
    });

    expect(Geolocation.checkPermissions).not.toHaveBeenCalled();
    expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Position refusée');
  });
});
