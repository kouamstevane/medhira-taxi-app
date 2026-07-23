import { TextDecoder, TextEncoder } from 'util';

Object.assign(globalThis, { TextDecoder, TextEncoder });

jest.mock('../../validators/schemas.js', () => ({
  SubmitDriverApplicationRequestSchema: { parse: jest.fn() },
}), { virtual: true });

jest.mock('../../utils/rateLimiter.js', () => ({
  enforceRateLimit: jest.fn(),
}), { virtual: true });

const { DRIVER_SUBMIT_RATE_LIMIT } = require('../submitDriverApplication');

describe('submitDriverApplication rate limit', () => {
  it('uses a 10 minute window for final driver submissions', () => {
    expect(DRIVER_SUBMIT_RATE_LIMIT).toEqual({
      bucket: 'driver:submit',
      limit: 3,
      windowSec: 600,
      message: 'Trop de tentatives de soumission. Réessayez dans 10 minutes.',
    });
  });
});
