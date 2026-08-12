const restaurantRef = {
  get: jest.fn(),
  update: jest.fn(),
};
const userRef = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
};
const transaction = {
  update: jest.fn(),
};
const db = {
  collection: jest.fn((name: string) => {
    if (name === 'restaurants') return { doc: jest.fn(() => restaurantRef) };
    if (name === 'users') return { doc: jest.fn(() => userRef) };
    throw new Error(`Unexpected collection ${name}`);
  }),
  runTransaction: jest.fn(),
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
    userRef.update.mockResolvedValue(undefined);
    transaction.update.mockReset();
    db.runTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction));
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
      emailSent: true,
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

  it('falls back to the user email when the restaurant email is missing', async () => {
    restaurantRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        ownerId: 'owner-1',
        name: 'Billion Food',
      }),
    });
    userRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ email: 'owner-from-user@example.com' }),
    });

    const { adminManageRestaurant } = await import('../adminManageRestaurant.js');
    const handler = adminManageRestaurant as unknown as (request: unknown) => Promise<unknown>;

    await handler(makeRequest({
      action: 'approve',
      restaurantId: 'restaurant-1',
      reason: null,
    }));

    expect(sendRestaurantStatusEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner-from-user@example.com',
    }));
  });

  it('reports when approval succeeds but the notification email fails', async () => {
    sendRestaurantStatusEmail.mockRejectedValueOnce(new Error('Resend unavailable'));

    const { adminManageRestaurant } = await import('../adminManageRestaurant.js');
    const handler = adminManageRestaurant as unknown as (request: unknown) => Promise<unknown>;

    await expect(handler(makeRequest({
      action: 'approve',
      restaurantId: 'restaurant-1',
      reason: null,
    }))).resolves.toMatchObject({
      success: true,
      emailSent: false,
    });
  });

  it('updates only the restaurant role without replacing other user roles', async () => {
    const { adminManageRestaurant } = await import('../adminManageRestaurant.js');
    const handler = adminManageRestaurant as unknown as (request: unknown) => Promise<unknown>;

    await handler(makeRequest({
      action: 'approve',
      restaurantId: 'restaurant-1',
      reason: null,
    }));

    expect(db.runTransaction).toHaveBeenCalled();
    expect(transaction.update).toHaveBeenNthCalledWith(1, restaurantRef, expect.objectContaining({
      status: 'approved',
    }));
    expect(transaction.update).toHaveBeenNthCalledWith(2, userRef, {
      'roles.restaurant': {
        restaurantId: 'restaurant-1',
        joinedAt: 'SERVER_TIMESTAMP',
      },
      activeRole: 'restaurant',
      lastActiveRole: 'restaurant',
      updatedAt: 'SERVER_TIMESTAMP',
    });
    expect(userRef.update).not.toHaveBeenCalled();
    expect(userRef.set).not.toHaveBeenCalled();
  });

  it('fails approval when the owner role cannot be updated', async () => {
    transaction.update.mockImplementation((ref: object) => {
      if (ref === userRef) throw new Error('Firestore unavailable');
    });

    const { adminManageRestaurant } = await import('../adminManageRestaurant.js');
    const handler = adminManageRestaurant as unknown as (request: unknown) => Promise<unknown>;

    await expect(handler(makeRequest({
      action: 'approve',
      restaurantId: 'restaurant-1',
      reason: null,
    }))).rejects.toMatchObject({ code: 'internal' });
    expect(restaurantRef.update).not.toHaveBeenCalled();
  });
});
