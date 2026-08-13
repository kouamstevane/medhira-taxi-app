export {};

const mockCallableOptions: unknown[] = [];

jest.mock('firebase-functions/v2/https', () => ({
  onCall: (options: unknown, handler: unknown) => {
    mockCallableOptions.push(options);
    return handler;
  },
  HttpsError: class HttpsError extends Error {},
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ name, value: () => 'google_maps_test_key' }),
}));

jest.mock('../../utils/rateLimiter', () => ({
  enforceRateLimit: jest.fn(),
}));

describe('reverseGeocode deployment configuration', () => {
  it('allows browser callable requests through CORS', () => {
    require('../reverseGeocode');

    const options = mockCallableOptions[0] as { cors?: boolean; region?: string };
    expect(options.cors).toBe(true);
    expect(options.region).toBe('europe-west1');
  });
});
