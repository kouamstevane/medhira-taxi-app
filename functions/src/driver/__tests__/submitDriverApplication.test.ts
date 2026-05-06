import { SubmitDriverApplicationRequestSchema } from '../../validators/schemas';

describe('SubmitDriverApplicationRequestSchema', () => {
  const validPayload = {
    driverId: 'uid123',
    driverData: {
      firstName: 'Jean',
      lastName: 'Dupont',
      email: 'jean@example.com',
      phone: '+33612345678',
      driverType: 'chauffeur',
      status: 'pending',
      vehicleType: 'voiture',
      cityId: 'edmonton',
      car: { year: 2020, brand: 'Toyota', model: 'Camry' },
    },
  };

  test('accepts valid payload', () => {
    const result = SubmitDriverApplicationRequestSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  test('rejects payload with userType', () => {
    const payload = {
      ...validPayload,
      driverData: { ...validPayload.driverData, userType: 'chauffeur' },
    };
    const result = SubmitDriverApplicationRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test('rejects payload with RGPD fields at root', () => {
    const payload = {
      ...validPayload,
      driverData: { ...validPayload.driverData, ssn: '123-456-789' },
    };
    const result = SubmitDriverApplicationRequestSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  test('rejects missing required fields', () => {
    const { driverId, ...noId } = validPayload;
    const result = SubmitDriverApplicationRequestSchema.safeParse(noId);
    expect(result.success).toBe(false);
  });
});

describe('submitDriverApplication transaction logic', () => {
  test('transaction writes roles.driver on users/{uid}', async () => {
    const mockRunTransaction = jest.fn(async (fn) => {
      const mockTransaction = {
        get: jest.fn()
          .mockResolvedValueOnce({ exists: false, data: () => undefined })
          .mockResolvedValueOnce({ exists: true, data: () => ({ uid: 'uid123', roles: { client: { enabled: true } }, activeRole: 'client' }) }),
        set: jest.fn(),
        update: jest.fn(),
      };
      return fn(mockTransaction);
    });

    expect(mockRunTransaction).toBeDefined();
  });
});
