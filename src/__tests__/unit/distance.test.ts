import { getDeliveryDistance } from '@/utils/distance';

let mockFetch: jest.Mock;

beforeEach(() => {
  mockFetch = jest.fn();
  global.fetch = mockFetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchResponse(body: object, ok = true, status = 200): void {
  mockFetch.mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
  } as Response);
}

describe('getDeliveryDistance', () => {
  describe('Appels API réussis', () => {
    it('retourne la distance et durée pour des adresses en chaîne', async () => {
      mockFetchResponse({
        status: 'OK',
        rows: [{
          elements: [{
            status: 'OK',
            distance: { value: 15000 },
            duration: { value: 1200 },
          }],
        }],
      });

      const result = await getDeliveryDistance('Montréal, QC', 'Québec, QC');

      expect(result).toEqual({
        distanceKm: 15,
        durationMinutes: 20,
        isEstimate: false,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/distance?origin=Montr%C3%A9al%2C%20QC&destination=Qu%C3%A9bec%2C%20QC'
      );
    });

    it('retourne la distance et durée pour des coordonnées lat/lng', async () => {
      mockFetchResponse({
        status: 'OK',
        rows: [{
          elements: [{
            status: 'OK',
            distance: { value: 8500 },
            duration: { value: 540 },
          }],
        }],
      });

      const result = await getDeliveryDistance(
        { lat: 45.5017, lng: -73.5673 },
        { lat: 46.8139, lng: -71.2080 }
      );

      expect(result).toEqual({
        distanceKm: 8.5,
        durationMinutes: 9,
        isEstimate: false,
      });
    });

    it('convertit correctement les mètres en km et les secondes en minutes (ceil)', async () => {
      mockFetchResponse({
        status: 'OK',
        rows: [{
          elements: [{
            status: 'OK',
            distance: { value: 12345 },
            duration: { value: 901 },
          }],
        }],
      });

      const result = await getDeliveryDistance('A', 'B');

      expect(result.distanceKm).toBe(12.345);
      expect(result.durationMinutes).toBe(16);
      expect(result.isEstimate).toBe(false);
    });
  });

  describe('Fallback vers estimation', () => {
    it('retourne le fallback si l\'API retourne un statut HTTP non-OK', async () => {
      mockFetchResponse({}, false, 500);

      const result = await getDeliveryDistance('A', 'B');

      expect(result).toEqual({
        distanceKm: 3.5,
        durationMinutes: 15,
        isEstimate: true,
      });
    });

    it('retourne le fallback si fetch lève une erreur', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const result = await getDeliveryDistance('A', 'B');

      expect(result).toEqual({
        distanceKm: 3.5,
        durationMinutes: 15,
        isEstimate: true,
      });
    });

    it('retourne le fallback si le statut de l\'élément n\'est pas OK', async () => {
      mockFetchResponse({
        status: 'OK',
        rows: [{
          elements: [{
            status: 'NOT_FOUND',
          }],
        }],
      });

      const result = await getDeliveryDistance('A', 'B');

      expect(result).toEqual({
        distanceKm: 3.5,
        durationMinutes: 15,
        isEstimate: true,
      });
    });

    it('retourne le fallback si le statut global n\'est pas OK', async () => {
      mockFetchResponse({
        status: 'REQUEST_DENIED',
        rows: [],
      });

      const result = await getDeliveryDistance('A', 'B');

      expect(result).toEqual({
        distanceKm: 3.5,
        durationMinutes: 15,
        isEstimate: true,
      });
    });
  });
});
