export {};

const mockSubRef = { get: jest.fn(), update: jest.fn() };
const mockTripRef = { get: jest.fn(), update: jest.fn() };
const mockAdminRef = { get: jest.fn() };
const mockNotificationRef = {};
const mockBatch = {
  update: jest.fn(),
  set: jest.fn(),
  commit: jest.fn(),
};

const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'admins') return { doc: jest.fn(() => mockAdminRef) };
    if (name === 'personal_driver_subscriptions') return { doc: jest.fn(() => mockSubRef) };
    if (name === 'personal_driver_trips') return { doc: jest.fn(() => mockTripRef) };
    if (name === 'notifications') return { doc: jest.fn(() => mockNotificationRef) };
    throw new Error(`Unexpected collection ${name}`);
  }),
  batch: jest.fn(() => mockBatch),
};

jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(() => mockDb), {
    FieldValue: { serverTimestamp: jest.fn(() => ({ __ts: true })) },
  }),
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

function makeRequest(data: unknown, uid?: string) {
  return { data, auth: uid ? { uid } : undefined } as never;
}

describe('adminManagePersonalDriver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBatch.commit.mockResolvedValue(undefined);
  });

  it('rejects unauthenticated requests', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    await expect(
      adminManagePersonalDriver(makeRequest({ action: 'validateSubscription', subscriptionId: 'sub_1' })),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects non-admin users', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    mockAdminRef.get.mockResolvedValue({ exists: false });

    await expect(
      adminManagePersonalDriver(makeRequest({ action: 'validateSubscription', subscriptionId: 'sub_1' }, 'user_1')),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('validates a subscription for admin users', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    mockAdminRef.get.mockResolvedValue({ exists: true });
    mockSubRef.get.mockResolvedValue({ exists: true, data: () => ({ userId: 'user_1' }) });

    const result = await adminManagePersonalDriver(
      makeRequest({ action: 'validateSubscription', subscriptionId: 'sub_1' }, 'admin_1'),
    );

    expect(result).toEqual({ success: true });
    expect(mockBatch.update).toHaveBeenCalledWith(
      mockSubRef,
      expect.objectContaining({ status: 'active', validatedBy: 'admin_1' }),
    );
    expect(mockBatch.set).toHaveBeenCalledWith(
      mockNotificationRef,
      expect.objectContaining({ userId: 'user_1', type: 'personal_driver_subscription_validated' }),
    );
  });

  it('assigns driver and vehicle to a trip', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    mockAdminRef.get.mockResolvedValue({ exists: true });
    mockTripRef.get.mockResolvedValue({ exists: true, data: () => ({ userId: 'user_1' }) });

    const result = await adminManagePersonalDriver(
      makeRequest(
        { action: 'assignTrip', tripId: 'trip_1', driverId: 'driver_1', vehicleId: 'veh_1' },
        'admin_1',
      ),
    );

    expect(result).toEqual({ success: true });
    expect(mockBatch.update).toHaveBeenCalledWith(
      mockTripRef,
      expect.objectContaining({
        assignedDriverId: 'driver_1',
        assignedVehicleId: 'veh_1',
        status: 'driver_assigned',
      }),
    );
    expect(mockBatch.set).toHaveBeenCalledWith(
      mockNotificationRef,
      expect.objectContaining({ userId: 'driver_1', type: 'personal_driver_trip_assigned_driver' }),
    );
  });
});
