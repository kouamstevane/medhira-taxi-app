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

jest.mock('../../personalDriver/routeDistance', () => ({
  calculateServerRoute: jest.fn(),
}));

describe('distanceCalculate deployment configuration', () => {
  it('declares the Google Maps secret for deployment', () => {
    require('../distanceCalculate');

    const options = mockCallableOptions[0] as { secrets?: Array<{ name: string }> };
    expect(options.secrets?.map((secret) => secret.name)).toEqual(['GOOGLE_MAPS_API_KEY']);
  });
});
