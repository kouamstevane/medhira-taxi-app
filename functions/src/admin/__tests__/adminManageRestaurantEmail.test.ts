const restaurantRef = {
  get: jest.fn(),
  update: jest.fn(),
};
const userRef = {
  set: jest.fn(),
};
const db = {
  collection: jest.fn((name: string) => {
    if (name === 'restaurants') return { doc: jest.fn(() => restaurantRef) };
    if (name === 'users') return { doc: jest.fn(() => userRef) };
    throw new Error(`Unexpected collection ${name}`);
  }),
};
const firestore = Object.assign(jest.fn(() => db), {
  FieldValue: { serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP') },
});
const sendRestaurantStatusEmail = jest.fn();
const onCallOptions: { secrets?: unknown[] } = {};
const secret = { value: jest.fn(() => 'resend-test-key') };

jest.mock('firebase-admin', () => ({
  firestore,
  apps: [],
  initializeApp: jest.fn(),
}));

jest.mock('firebase-functions/v2/https', () => ({
  onCall: (options: { secrets?: unknown[] }, handler: unknown) => {
    Object.assign(onCallOptions, options);
    return handler;
  },
  HttpsError: class HttpsError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: jest.fn(() => secret),
}));

jest.mock('../_shared.js', () => ({
  requireAdmin: jest.fn().mockResolvedValue('admin-1'),
}));

jest.mock('../../utils/rateLimiter.js', () => ({
  enforceRateLimit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../email-service.js', () => ({
  sendRestaurantStatusEmail,
}));

function makeRequest(data: unknown) {
  return { data, auth: { uid: 'admin-1' } } as never;
}

describe('adminManageRestaurant approval email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    restaurantRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        ownerId: 'owner-1',
        ownerEmail: 'owner@example.com',
        name: 'Billion Food',
      }),
    });
    restaurantRef.update.mockResolvedValue(undefined);
    userRef.set.mockResolvedValue(undefined);
    sendRestaurantStatusEmail.mockResolvedValue({ messageId: 'email-1' });
  });

  it('sends the approval email after approving the restaurant', async () => {
    const { adminManageRestaurant } = await import('../adminManageRestaurant.js');
    const handler = adminManageRestaurant as unknown as (request: unknown) => Promise<unknown>;

    await expect(handler(makeRequest({
      action: 'approve',
      restaurantId: 'restaurant-1',
      reason: null,
    }))).resolves.toEqual({
      success: true,
      message: 'Restaurant approuvé avec succès',
    });

    expect(sendRestaurantStatusEmail).toHaveBeenCalledWith({
      to: 'owner@example.com',
      restaurantName: 'Billion Food',
      type: 'approval',
      apiKey: 'resend-test-key',
    });
    expect(onCallOptions.secrets).toEqual(expect.arrayContaining([secret]));
  });
});
