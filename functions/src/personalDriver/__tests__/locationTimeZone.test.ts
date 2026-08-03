jest.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'google-test-key' }),
}));

import {
  getLocalCalendarDate,
  localDateTimeToUtc,
  resolvePickupLocationAndTimeZone,
} from '../locationTimeZone.js';

describe('personal driver location timezone resolution', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves server geocoded pickup coordinates and its IANA timezone', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [{
            geometry: { location: { lat: 45.5017, lng: -73.5673 } },
          }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          timeZoneId: 'America/Toronto',
        }),
      } as Response);

    await expect(resolvePickupLocationAndTimeZone(
      '100 rue Sainte-Catherine, Montréal',
      new Date('2026-07-27T12:00:00.000Z'),
    )).resolves.toEqual({
      latitude: 45.5017,
      longitude: -73.5673,
      serviceTimeZone: 'America/Toronto',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('location=45.5017%2C-73.5673');
    expect(String(fetchMock.mock.calls[1][0])).toContain('timestamp=');
  });

  it('fails closed when the address or timezone cannot be resolved', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ZERO_RESULTS' }),
    } as Response);

    await expect(resolvePickupLocationAndTimeZone(
      'Adresse inconnue',
      new Date('2026-07-27T12:00:00.000Z'),
    )).rejects.toThrow();
  });

  it('converts local midnight using IANA daylight-saving rules', () => {
    expect(localDateTimeToUtc('2026-03-09', '00:00', 'America/Toronto').toISOString())
      .toBe('2026-03-09T04:00:00.000Z');
  });

  it('formats the server instant as a local service calendar date', () => {
    expect(getLocalCalendarDate(new Date('2026-08-03T03:00:00.000Z'), 'America/Toronto')).toBe('2026-08-02');
    expect(getLocalCalendarDate(new Date('2026-08-03T04:00:00.000Z'), 'America/Toronto')).toBe('2026-08-03');
  });
});
