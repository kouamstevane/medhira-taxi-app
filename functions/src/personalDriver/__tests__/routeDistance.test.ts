jest.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'google-test-key' }),
}));

import {
  calculateAuthoritativeMonthlyDistanceKm,
  calculateServerRoute,
} from '../routeDistance.js';

describe('personal driver server route distance', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the Google road distance and duration', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        rows: [{ elements: [{
          status: 'OK',
          distance: { value: 12500 },
          duration: { value: 2700 },
        }] }],
      }),
    } as Response);

    await expect(calculateServerRoute({
      origin: 'A',
      destination: 'B',
    })).resolves.toEqual({ distanceKm: 12.5, durationMinutes: 45 });

    expect(String(fetchMock.mock.calls[0][0])).toContain('origins=A');
    expect(String(fetchMock.mock.calls[0][0])).toContain('destinations=B');
  });

  it('fails closed when Google has no valid route', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ZERO_RESULTS' }),
    } as Response);

    await expect(calculateServerRoute({ origin: 'A', destination: 'B' })).rejects.toThrow();
  });

  it('aggregates authoritative route distance across the exact weekday occurrences', () => {
    expect(calculateAuthoritativeMonthlyDistanceKm({
      outboundKm: 12.34,
      returnKm: 12.34,
      tripType: 'round_trip',
      occurrences: 22,
    })).toBe(543);

    expect(calculateAuthoritativeMonthlyDistanceKm({
      outboundKm: 12.34,
      returnKm: 0,
      tripType: 'one_way',
      occurrences: 22,
    })).toBe(271.5);
  });
});
