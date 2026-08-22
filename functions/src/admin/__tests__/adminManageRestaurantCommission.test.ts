const restaurantRef = {
  get: jest.fn(),
  update: jest.fn(),
};
const db = {
  collection: jest.fn((name: string) => {
    if (name === 'restaurants') return { doc: jest.fn(() => restaurantRef) };
    throw new Error(`Unexpected collection ${name}`);
  }),
};
const firestore = Object.assign(jest.fn(() => db), {
  FieldValue: { serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP') },
});

jest.mock('firebase-admin', () => ({
  firestore,
  apps: [],
  initializeApp: jest.fn(),
}));

jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: jest.fn(() => ({ value: jest.fn() })),
}));

jest.mock('../_shared.js', () => ({
  requireAdmin: jest.fn().mockResolvedValue('admin-1'),
}));

jest.mock('../../utils/rateLimiter.js', () => ({
  enforceRateLimit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../email-service.js', () => ({
  sendRestaurantStatusEmail: jest.fn(),
}));

const requireAdmin = jest.requireMock('../_shared.js').requireAdmin as jest.Mock;

function makeRequest(data: unknown) {
  return { data, auth: { uid: 'admin-1' } } as never;
}

describe('adminManageRestaurant commission action', () => {
  let handler: (request: unknown) => Promise<unknown>;

  beforeEach(async () => {
    jest.clearAllMocks();
    requireAdmin.mockResolvedValue('admin-1');
    restaurantRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ name: 'Restaurant A' }),
    });
    restaurantRef.update.mockResolvedValue(undefined);
    const loadedModule = await import('../adminManageRestaurant.js');
    handler = loadedModule.adminManageRestaurant as unknown as typeof handler;
  });

  it('stores the requested rate and audit fields', async () => {
    await expect(handler(makeRequest({
      action: 'set_commission_rate',
      restaurantId: 'restaurant-1',
      commissionRate: 15,
    }))).resolves.toEqual({
      success: true,
      commissionRate: 15,
      message: 'Commission du restaurant mise à jour',
    });

    expect(restaurantRef.update).toHaveBeenCalledWith({
      commissionRate: 15,
      commissionRateUpdatedAt: 'SERVER_TIMESTAMP',
      commissionRateUpdatedBy: 'admin-1',
      updatedAt: 'SERVER_TIMESTAMP',
    });
  });

  it('rejects an invalid rate without updating Firestore', async () => {
    await expect(handler(makeRequest({
      action: 'set_commission_rate',
      restaurantId: 'restaurant-1',
      commissionRate: 101,
    }))).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(restaurantRef.update).not.toHaveBeenCalled();
  });

  it('rejects a missing restaurant', async () => {
    restaurantRef.get.mockResolvedValue({ exists: false });

    await expect(handler(makeRequest({
      action: 'set_commission_rate',
      restaurantId: 'missing',
      commissionRate: 5,
    }))).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects non-admin callers before reading the restaurant', async () => {
    requireAdmin.mockRejectedValueOnce(new Error('permission-denied'));

    await expect(handler(makeRequest({
      action: 'set_commission_rate',
      restaurantId: 'restaurant-1',
      commissionRate: 5,
    }))).rejects.toMatchObject({ message: 'permission-denied' });

    expect(restaurantRef.get).not.toHaveBeenCalled();
    expect(restaurantRef.update).not.toHaveBeenCalled();
  });
});
