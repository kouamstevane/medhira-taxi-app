export {};

jest.mock('firebase-functions/params', () => ({
  defineInt: jest.fn((name: string) => ({
    value: jest.fn(() => name === 'PERSONAL_DRIVER_ARRIVAL_MAX_DISTANCE_METERS' ? 250 : 100),
  })),
}));

const mockTripRef = {};
const mockSubscriptionRef = {};
const mockDriverRef = {};
const mockTripData: Record<string, unknown> = {};
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
};

const mockDb = {
  collection: jest.fn((collectionName: string) => ({
    doc: jest.fn(() => (
      collectionName === 'drivers' ? mockDriverRef
        : collectionName === 'personal_driver_subscriptions' ? mockSubscriptionRef
          : mockTripRef
    )),
  })),
  runTransaction: jest.fn((callback: (tx: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction)),
};

jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(() => mockDb), {
    FieldValue: {
      serverTimestamp: jest.fn(() => ({ __ts: true })),
      delete: jest.fn(() => ({ __delete: true })),
    },
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

describe('driverUpdatePersonalDriverTrip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockTripData, {
      assignedDriverId: 'driver_1',
      subscriptionId: 'sub_1',
      status: 'driver_assigned',
      statusHistory: [],
    });
    mockTransaction.get.mockImplementation((ref: unknown) => Promise.resolve(
      ref === mockSubscriptionRef
        ? { exists: true, data: () => ({ status: 'active', paymentStatus: 'succeeded' }) }
        : { exists: true, data: () => mockTripData },
    ));
  });

  it('rejects unauthenticated requests', async () => {
    const { driverUpdatePersonalDriverTrip } = require('../driverUpdatePersonalDriverTrip');
    await expect(
      driverUpdatePersonalDriverTrip(makeRequest({ tripId: 'trip_1', status: 'driver_en_route' })),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects requests from unassigned drivers', async () => {
    const { driverUpdatePersonalDriverTrip } = require('../driverUpdatePersonalDriverTrip');
    await expect(
      driverUpdatePersonalDriverTrip(
        makeRequest({ tripId: 'trip_1', status: 'driver_en_route' }, 'other_driver'),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('allows valid status transition driver_assigned -> driver_en_route', async () => {
    const { driverUpdatePersonalDriverTrip } = require('../driverUpdatePersonalDriverTrip');

    const result = await driverUpdatePersonalDriverTrip(
      makeRequest({ tripId: 'trip_1', status: 'driver_en_route' }, 'driver_1'),
    );

    expect(result).toEqual({ success: true, status: 'driver_en_route' });
    expect(mockTransaction.update).toHaveBeenCalledWith(
      mockTripRef,
      expect.objectContaining({ status: 'driver_en_route' }),
    );
    expect(mockTransaction.update).toHaveBeenCalledWith(
      mockDriverRef,
      expect.objectContaining({
        isAvailable: false,
        availabilityStatus: 'busy_personal_driver',
        activePersonalDriverTripId: 'trip_1',
      }),
    );
  });

  it('marks the driver available after completing the trip', async () => {
    Object.assign(mockTripData, {
      assignedDriverId: 'driver_1',
      status: 'in_progress',
      statusHistory: [],
    });
    const { driverUpdatePersonalDriverTrip } = require('../driverUpdatePersonalDriverTrip');

    const result = await driverUpdatePersonalDriverTrip(
      makeRequest({ tripId: 'trip_1', status: 'completed' }, 'driver_1'),
    );

    expect(result).toEqual({ success: true, status: 'completed' });
    expect(mockTransaction.update).toHaveBeenCalledWith(
      mockDriverRef,
      expect.objectContaining({
        isAvailable: true,
        availabilityStatus: 'available',
        activePersonalDriverTripId: null,
      }),
    );
  });

  it('requires accurate GPS proximity before marking the driver arrived', async () => {
    Object.assign(mockTripData, {
      status: 'driver_en_route',
      pickupLocation: { latitude: 45.5017, longitude: -73.5673 },
    });
    const { driverUpdatePersonalDriverTrip } = require('../driverUpdatePersonalDriverTrip');

    const result = await driverUpdatePersonalDriverTrip(
      makeRequest({
        tripId: 'trip_1',
        status: 'driver_arrived',
        lat: 45.5017,
        lng: -73.5673,
        accuracy: 20,
      }, 'driver_1'),
    );

    expect(result).toEqual({ success: true, status: 'driver_arrived' });
    expect(mockTransaction.update).toHaveBeenCalledWith(
      mockTripRef,
      expect.objectContaining({
        status: 'driver_arrived',
        waitStartedAt: expect.anything(),
      }),
    );
  });

  it('writes the server wait end timestamp when the passenger is picked up', async () => {
    Object.assign(mockTripData, {
      status: 'driver_arrived',
      waitStartedAt: { __ts: true },
    });
    const { driverUpdatePersonalDriverTrip } = require('../driverUpdatePersonalDriverTrip');

    await expect(driverUpdatePersonalDriverTrip(makeRequest({
      tripId: 'trip_1',
      status: 'passenger_picked_up',
    }, 'driver_1'))).resolves.toEqual({ success: true, status: 'passenger_picked_up' });
    expect(mockTransaction.update).toHaveBeenCalledWith(
      mockTripRef,
      expect.objectContaining({
        status: 'passenger_picked_up',
        waitEndedAt: expect.anything(),
      }),
    );
  });

  it('rejects arrival without GPS data', async () => {
    Object.assign(mockTripData, {
      status: 'driver_en_route',
      pickupLocation: { latitude: 45.5017, longitude: -73.5673 },
    });
    const { driverUpdatePersonalDriverTrip } = require('../driverUpdatePersonalDriverTrip');

    await expect(driverUpdatePersonalDriverTrip(makeRequest({
      tripId: 'trip_1',
      status: 'driver_arrived',
    }, 'driver_1'))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(mockTransaction.update).toHaveBeenCalledWith(mockTripRef, expect.objectContaining({
      operationalReviewRequired: true,
      operationalReviewReason: 'driver_arrival_gps_missing',
      operationalReviewEvidence: {
        driverLocation: { latitude: null, longitude: null },
        pickupLocation: { latitude: 45.5017, longitude: -73.5673 },
        accuracyMeters: null,
      },
    }));
  });

  it('rejects arrival outside the pickup radius', async () => {
    Object.assign(mockTripData, {
      status: 'driver_en_route',
      pickupLocation: { latitude: 45.5017, longitude: -73.5673 },
    });
    const { driverUpdatePersonalDriverTrip } = require('../driverUpdatePersonalDriverTrip');

    await expect(driverUpdatePersonalDriverTrip(makeRequest({
      tripId: 'trip_1',
      status: 'driver_arrived',
      lat: 45.51,
      lng: -73.5673,
      accuracy: 20,
    }, 'driver_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.update).toHaveBeenCalledWith(mockTripRef, expect.objectContaining({
      operationalReviewRequired: true,
      operationalReviewReason: 'driver_arrival_gps_mismatch',
    }));
  });

  it('marks an expired subscription before rejecting a status update', async () => {
    Object.assign(mockTripData, { status: 'driver_assigned' });
    mockTransaction.get.mockImplementation((ref: unknown) => Promise.resolve(
      ref === mockSubscriptionRef
        ? {
            exists: true,
            data: () => ({
              status: 'active',
              paymentStatus: 'succeeded',
              periodStartAtUtc: new Date('2026-08-01T00:00:00.000Z'),
              periodEndAtUtc: new Date('2026-08-02T00:00:00.000Z'),
            }),
          }
        : { exists: true, data: () => mockTripData },
    ));

    const { driverUpdatePersonalDriverTrip } = require('../driverUpdatePersonalDriverTrip');
    await expect(driverUpdatePersonalDriverTrip(
      makeRequest({ tripId: 'trip_1', status: 'driver_en_route' }, 'driver_1'),
    )).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      status: 'expired',
    }));
    expect(mockTransaction.update.mock.calls.some(([ref]) => ref === mockTripRef)).toBe(false);
  });

  it('rejects invalid status transition driver_assigned -> completed', async () => {
    const { driverUpdatePersonalDriverTrip } = require('../driverUpdatePersonalDriverTrip');

    await expect(
      driverUpdatePersonalDriverTrip(
        makeRequest({ tripId: 'trip_1', status: 'completed' }, 'driver_1'),
      ),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
