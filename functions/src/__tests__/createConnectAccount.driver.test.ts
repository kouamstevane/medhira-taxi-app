const mockPrivateDocRef = {
  get: jest.fn(),
};

const mockDriverDocRef = {
  get: jest.fn(),
  update: jest.fn(),
  collection: jest.fn(() => ({
    doc: jest.fn(() => mockPrivateDocRef),
  })),
};
const mockRateLimitDocRef = {};
const mockRateLimitTransaction = {
  get: jest.fn().mockResolvedValue({ exists: false }),
  set: jest.fn(),
  update: jest.fn(),
};

const mockFirestoreInstance = {
  collection: jest.fn((name: string) => ({
    doc: jest.fn(() => name === 'rateLimits' ? mockRateLimitDocRef : mockDriverDocRef),
  })),
  runTransaction: jest.fn(async (callback: (transaction: typeof mockRateLimitTransaction) => Promise<unknown>) => (
    callback(mockRateLimitTransaction)
  )),
};

var mockFieldValue = {
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  increment: jest.fn((value: number) => ({ increment: value })),
};
var firestoreFn = jest.fn(() => mockFirestoreInstance) as any;
firestoreFn.FieldValue = mockFieldValue;
firestoreFn.Timestamp = { fromMillis: jest.fn((value: number) => value) };
var mockEnforceRateLimit = jest.fn();
var mockCreateStripeClient = jest.fn(() => mockStripeInstance);

jest.mock('firebase-admin', () => ({
  firestore: firestoreFn,
  apps: [],
  initializeApp: jest.fn(),
  FieldValue: mockFieldValue,
}));

jest.mock('../config/stripe.js', () => ({
  DRIVER_SHARE_RATE: 0.7,
  PLATFORM_COMMISSION_RATE: 0.3,
}), { virtual: true });

jest.mock('../stripe/stripe-client.js', () => ({
  createStripeClient: mockCreateStripeClient,
}), { virtual: true });

const mockStripeInstance = {
  accounts: {
    create: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn(),
  },
  accountLinks: { create: jest.fn() },
};

jest.mock('stripe', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockStripeInstance),
  };
});

jest.mock('../utils/rateLimiter.js', () => ({
  enforceRateLimit: mockEnforceRateLimit,
}), { virtual: true });

jest.mock('firebase-functions/v2/https', () => ({
  onRequest: (_opts: any, fn: any) => fn,
  onCall: (_opts: any, fn: any) => fn,
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, msg: string) {
      super(msg);
      this.code = code;
      this.name = 'HttpsError';
    }
  },
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'test-secret' }),
}));

jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function makeRequest(data: unknown, auth?: { uid: string; token?: { email?: string; email_verified?: boolean } }) {
  return {
    data,
    auth: auth
      ? {
          uid: auth.uid,
          token: {
            email: auth.token?.email ?? 'driver@example.com',
            email_verified: auth.token?.email_verified ?? true,
          },
        }
      : undefined,
  } as any;
}

describe('createConnectAccount driver flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnforceRateLimit.mockResolvedValue(undefined);
    mockCreateStripeClient.mockReturnValue(mockStripeInstance);
  });

  it('uses Firebase driver data to build the Stripe payload, including postal address', async () => {
    mockDriverDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        driverType: 'chauffeur',
        firstName: 'Ste',
        lastName: 'Jgf',
        phone: '15245369852',
        city: 'Montreal',
        zipCode: 'H2X 1Y4',
      }),
    });

    mockPrivateDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        dob: '2000-04-30',
        address: '123 Rue Principale',
        province: 'Quebec',
      }),
    });

    mockStripeInstance.accounts.create.mockResolvedValue({ id: 'acct_123' });

    const { createConnectAccount } = await import('../stripe/index.js');
    const result = await createConnectAccount(
      makeRequest({ country: 'CA' }, { uid: 'driver-1', token: { email: 'driver@example.com', email_verified: true } }),
      undefined as any
    );

    expect(result).toEqual({ accountId: 'acct_123', status: 'pending' });
    expect(mockStripeInstance.accounts.create).toHaveBeenCalledTimes(1);
    expect(mockStripeInstance.accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        country: 'CA',
        email: 'driver@example.com',
        business_type: 'individual',
        individual: expect.objectContaining({
          first_name: 'Ste',
          last_name: 'Jgf',
          phone: '+15245369852',
          dob: { day: 30, month: 4, year: 2000 },
          address: {
            line1: '123 Rue Principale',
            city: 'Montreal',
            postal_code: 'H2X 1Y4',
            state: 'Quebec',
            country: 'CA',
          },
          relationship: {
            title: 'Chauffeur professionnel',
          },
          email: 'driver@example.com',
        }),
      }),
      expect.objectContaining({
        idempotencyKey: 'account_driver-1_v1',
      })
    );
    expect(mockDriverDocRef.update).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeAccountId: 'acct_123',
        stripeAccountStatus: 'pending',
      })
    );
  });

  it('keeps the driver business profile synchronized after KYC submission', async () => {
    mockDriverDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        driverType: 'chauffeur',
        stripeAccountId: 'acct_existing',
      }),
    });
    mockPrivateDocRef.get.mockResolvedValue({ exists: false });
    mockStripeInstance.accounts.retrieve.mockResolvedValue({ details_submitted: true });

    const { createConnectAccount } = await import('../stripe/index.js');
    const result = await createConnectAccount(
      makeRequest({ country: 'CA' }, { uid: 'driver-1', token: { email: 'driver@example.com', email_verified: true } }),
      undefined as any
    );

    expect(result).toEqual({ accountId: 'acct_existing', status: 'existing' });
    expect(mockStripeInstance.accounts.update).toHaveBeenCalledWith(
      'acct_existing',
      expect.objectContaining({
        business_profile: expect.objectContaining({
          mcc: '4121',
          url: 'https://medjira-service.firebaseapp.com',
          product_description: 'Service de transport de personnes via l’application Medjira.',
        }),
      })
    );
    expect(mockStripeInstance.accounts.update.mock.calls[0][1]).not.toHaveProperty('individual');
  });
});
export {};
