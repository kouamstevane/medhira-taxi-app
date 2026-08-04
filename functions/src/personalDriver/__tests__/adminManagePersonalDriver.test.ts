export {};

const mockSubRef = { id: 'sub_1' };
const mockTripRef = { id: 'trip_1' };
const mockDriverRef = { id: 'driver_1' };
const mockAdminRef = { get: jest.fn() };
const mockNotificationRef = { id: 'notification_1' };
const mockIsSubscriptionEntitled = jest.fn((subscription: Record<string, unknown>) => (
  subscription?.status === 'active' && subscription?.paymentStatus === 'succeeded'
));
const mockMarkExpiredSubscriptionInTransaction = jest.fn((
  transaction: { update: jest.Mock },
  subscriptionRef: unknown,
  subscription: Record<string, unknown>,
  now: Date,
) => {
  const periodEnd = subscription?.periodEndAtUtc instanceof Date ? subscription.periodEndAtUtc : null;
  if (subscription?.status === 'active' && periodEnd && now >= periodEnd) {
    transaction.update(subscriptionRef, { status: 'expired', expiredAt: 'EXPIRED' });
    return true;
  }
  return false;
});
const mockTransaction = {
  get: jest.fn(),
  update: jest.fn(),
  set: jest.fn(),
};
const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'admins') return { doc: jest.fn(() => mockAdminRef) };
    if (name === 'drivers') return { doc: jest.fn(() => mockDriverRef) };
    if (name === 'personal_driver_subscriptions') return { doc: jest.fn(() => mockSubRef) };
    if (name === 'personal_driver_trips') return { doc: jest.fn(() => mockTripRef) };
    if (name === 'notifications') return { doc: jest.fn(() => mockNotificationRef) };
    throw new Error(`Unexpected collection ${name}`);
  }),
  runTransaction: jest.fn((callback: (tx: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction)),
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

jest.mock('../entitlement', () => ({
  isSubscriptionEntitled: mockIsSubscriptionEntitled,
  markExpiredSubscriptionInTransaction: mockMarkExpiredSubscriptionInTransaction,
}));

function makeRequest(data: unknown, uid?: string) {
  return { data, auth: uid ? { uid } : undefined } as never;
}

describe('adminManagePersonalDriver', () => {
  let tripData: Record<string, unknown>;
  let subscriptionData: Record<string, unknown>;
  let driverData: Record<string, unknown>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminRef.get.mockResolvedValue({ exists: true });
    tripData = { userId: 'user_1', subscriptionId: 'sub_1', status: 'scheduled' };
    subscriptionData = {
      status: 'active',
      paymentStatus: 'succeeded',
      periodStartAtUtc: new Date('2026-01-01T00:00:00.000Z'),
      periodEndAtUtc: new Date('2027-01-01T00:00:00.000Z'),
    };
    driverData = { status: 'approved', isAvailable: true };
    mockTransaction.get.mockImplementation(async (ref: unknown) => {
      if (ref === mockTripRef) return { exists: true, data: () => tripData };
      if (ref === mockDriverRef) return { exists: true, data: () => driverData };
      return { exists: true, data: () => subscriptionData };
    });
    mockTransaction.update.mockImplementation((_ref: unknown, update: Record<string, unknown>) => {
      if (_ref === mockTripRef) Object.assign(tripData, update);
    });
  });

  it('rejects unauthenticated requests', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    await expect(adminManagePersonalDriver(makeRequest({ action: 'assignTrip', tripId: 'trip_1', driverId: 'driver_1', vehicleId: 'veh_1' })))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects manual subscription validation for admin users', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    await expect(adminManagePersonalDriver(makeRequest({ action: 'validateSubscription', subscriptionId: 'sub_1' }, 'admin_1')))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('assigns a driver only after reading trip, driver, and subscription in one transaction', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'assignTrip', tripId: 'trip_1', driverId: 'driver_1', vehicleId: 'veh_1',
    }, 'admin_1'))).resolves.toEqual({ success: true });

    expect(mockDb.runTransaction).toHaveBeenCalledTimes(1);
    expect(mockTransaction.get).toHaveBeenCalledWith(mockTripRef);
    expect(mockTransaction.get).toHaveBeenCalledWith(mockSubRef);
    expect(mockTransaction.get).toHaveBeenCalledWith(mockDriverRef);
    expect(mockTransaction.update).toHaveBeenCalledWith(mockTripRef, expect.objectContaining({
      assignedDriverId: 'driver_1',
      status: 'driver_assigned',
    }));
    expect(mockTransaction.set).toHaveBeenCalledWith(mockNotificationRef, expect.objectContaining({
      userId: 'driver_1',
      type: 'personal_driver_trip_assigned_driver',
    }));
  });

  it('rejects assignment when the transaction observes an unpaid package', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    subscriptionData.paymentStatus = 'pending';

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'assignTrip', tripId: 'trip_1', driverId: 'driver_1', vehicleId: 'veh_1',
    }, 'admin_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.update).not.toHaveBeenCalled();
  });

  it('rejects assignment to a driver that is unavailable in the transaction', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    driverData.isAvailable = false;

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'assignTrip', tripId: 'trip_1', driverId: 'driver_1', vehicleId: 'veh_1',
    }, 'admin_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.update).not.toHaveBeenCalled();
  });

  it('marks an expired subscription before rejecting assignment', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    subscriptionData.periodEndAtUtc = new Date('2026-08-01T00:00:00.000Z');

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'assignTrip', tripId: 'trip_1', driverId: 'driver_1', vehicleId: 'veh_1',
    }, 'admin_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubRef, expect.objectContaining({
      status: 'expired',
    }));
    expect(mockTransaction.update).not.toHaveBeenCalledWith(mockTripRef, expect.anything());
  });
});
