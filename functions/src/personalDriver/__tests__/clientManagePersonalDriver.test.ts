export {};

const mockTripRef = { id: 'trip_1' };
const mockSubscriptionRef = { id: 'sub_1' };
const mockNewTripRef = { id: 'special_1' };
const mockTransaction = {
  get: jest.fn(),
  update: jest.fn(),
  set: jest.fn(),
};
const mockDb = {
  collection: jest.fn((name: string) => ({
    doc: jest.fn((id?: string) => {
      if (name === 'personal_driver_subscriptions') return mockSubscriptionRef;
      if (id === 'trip_1') return mockTripRef;
      return mockNewTripRef;
    }),
  })),
  runTransaction: jest.fn((callback: (tx: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction)),
};
const mockCalculateServerRoute = jest.fn();
const mockResolveAddressCoordinates = jest.fn();

jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(() => mockDb), {
    FieldValue: {
      increment: jest.fn((value: number) => ({ __increment: value })),
      serverTimestamp: jest.fn(() => ({ __ts: true })),
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

jest.mock('../routeDistance', () => ({
  calculateServerRoute: mockCalculateServerRoute,
}));

jest.mock('../locationTimeZone', () => ({
  resolveAddressCoordinates: mockResolveAddressCoordinates,
  localDateTimeToUtc: (date: string, time: string) => new Date(`${date}T${time}:00.000Z`),
}));

function makeRequest(data: unknown, uid?: string) {
  return { data, auth: uid ? { uid } : undefined } as never;
}

describe('clientManagePersonalDriver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCalculateServerRoute.mockResolvedValue({ distanceKm: 18, durationMinutes: 30 });
    mockResolveAddressCoordinates.mockResolvedValue({ latitude: 45.5, longitude: -73.5 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects unauthenticated requests', async () => {
    const { clientManagePersonalDriver } = require('../clientManagePersonalDriver');

    await expect(clientManagePersonalDriver(makeRequest({ action: 'cancelTrip', tripId: 'trip_1' })))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('lets the owner cancel a scheduled trip through Admin SDK', async () => {
    const { clientManagePersonalDriver } = require('../clientManagePersonalDriver');
    mockTransaction.get.mockResolvedValue({
      exists: true,
      data: () => ({ userId: 'client_1', status: 'scheduled' }),
    });

    const result = await clientManagePersonalDriver(makeRequest({ action: 'cancelTrip', tripId: 'trip_1' }, 'client_1'));

    expect(result).toEqual({ success: true });
    expect(mockTransaction.update).toHaveBeenCalledWith(mockTripRef, expect.objectContaining({
      status: 'cancelled',
      cancelledBy: 'client',
      clientCancelledLostKm: true,
    }));
  });

  it('clears an assigned trip before completing the client cancellation reconciliation', async () => {
    const { clientManagePersonalDriver } = require('../clientManagePersonalDriver');
    mockTransaction.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'client_1',
        status: 'assigned',
        assignedDriverId: 'driver_1',
        assignedVehicleId: 'vehicle_1',
      }),
    });

    await expect(clientManagePersonalDriver(makeRequest({ action: 'cancelTrip', tripId: 'trip_1' }, 'client_1')))
      .resolves.toEqual({ success: true });

    expect(mockTransaction.update).toHaveBeenCalledWith(mockTripRef, expect.objectContaining({
      status: 'cancelled',
      assignedDriverId: null,
      assignedVehicleId: null,
    }));
  });

  it('rejects cancellation by a different client', async () => {
    const { clientManagePersonalDriver } = require('../clientManagePersonalDriver');
    mockTransaction.get.mockResolvedValue({
      exists: true,
      data: () => ({ userId: 'client_2', status: 'scheduled' }),
    });

    await expect(clientManagePersonalDriver(makeRequest({ action: 'cancelTrip', tripId: 'trip_1' }, 'client_1')))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('creates a special trip only when quota remains', async () => {
    const { clientManagePersonalDriver } = require('../clientManagePersonalDriver');
    mockCalculateServerRoute.mockResolvedValue({ distanceKm: 8.2, durationMinutes: 30 });
    mockTransaction.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'client_1',
        status: 'active',
        selectedPlanId: 'classic',
        includedSpecialTrips: 2,
        specialTripsUsed: 1,
        paymentStatus: 'succeeded',
        periodStartAtUtc: new Date('2026-08-01T00:00:00.000Z'),
        periodEndAtUtc: new Date('2026-09-01T00:00:00.000Z'),
        serviceTimeZone: 'America/Toronto',
        monthlyDistanceKm: 50,
        monthlyDistanceKmRemaining: 50,
        specialTripsDistanceUsedKm: 0,
      }),
    });

    const result = await clientManagePersonalDriver(makeRequest({
      action: 'requestSpecialTrip',
      subscriptionId: 'sub_1',
      pickupAddress: 'Clinique',
      destinationAddress: 'Aeroport',
      scheduledAtIso: '2026-08-12T09:30:00',
      distanceKm: 999,
    }, 'client_1'));

    expect(result).toEqual(expect.objectContaining({
      success: true,
      tripId: 'special_1',
      specialTripsRemaining: 0,
      officialDistanceKm: 8.2,
      monthlyDistanceKmRemaining: 41.8,
    }));
    expect(mockTransaction.set).toHaveBeenCalledWith(mockNewTripRef, expect.objectContaining({
      direction: 'special',
      isSpecialTrip: true,
      userId: 'client_1',
      planId: 'classic',
      status: 'scheduled',
    }));
    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      specialTripsUsed: { __increment: 1 },
      specialTripsDistanceUsedKm: { __increment: 8.2 },
      monthlyDistanceKmRemaining: 41.8,
    }));
  });

  it('rejects a special trip that is already in the past on the fixed service clock', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-03T12:00:00.000Z'));
    const { clientManagePersonalDriver } = require('../clientManagePersonalDriver');
    mockTransaction.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'client_1',
        status: 'active',
        selectedPlanId: 'classic',
        includedSpecialTrips: 2,
        specialTripsUsed: 0,
        paymentStatus: 'succeeded',
        periodStartAtUtc: new Date('2026-08-01T00:00:00.000Z'),
        periodEndAtUtc: new Date('2026-09-01T00:00:00.000Z'),
        serviceTimeZone: 'America/Toronto',
        monthlyDistanceKm: 50,
        monthlyDistanceKmRemaining: 50,
        specialTripsDistanceUsedKm: 0,
      }),
    });

    await expect(clientManagePersonalDriver(makeRequest({
      action: 'requestSpecialTrip',
      subscriptionId: 'sub_1',
      pickupAddress: 'Clinique',
      destinationAddress: 'Aeroport',
      scheduledAtIso: '2026-08-02T09:30:00',
      distanceKm: 8.2,
    }, 'client_1'))).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mockTransaction.set).not.toHaveBeenCalled();
  });

  it('rejects a special trip that exceeds remaining monthly kilometers', async () => {
    const { clientManagePersonalDriver } = require('../clientManagePersonalDriver');
    mockTransaction.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'client_1',
        status: 'active',
        selectedPlanId: 'classic',
        specialTripsUsed: 0,
        paymentStatus: 'succeeded',
        periodStartAtUtc: new Date('2026-08-01T00:00:00.000Z'),
        periodEndAtUtc: new Date('2026-09-01T00:00:00.000Z'),
        serviceTimeZone: 'America/Toronto',
        monthlyDistanceKm: 20,
        monthlyDistanceKmRemaining: 15,
        specialTripsDistanceUsedKm: 5,
      }),
    });

    await expect(clientManagePersonalDriver(makeRequest({
      action: 'requestSpecialTrip',
      subscriptionId: 'sub_1',
      pickupAddress: 'Clinique',
      destinationAddress: 'Aeroport',
      scheduledAtIso: '2026-08-12T09:30:00',
      distanceKm: 1,
    }, 'client_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects special trips after the plan quota is exhausted', async () => {
    const { clientManagePersonalDriver } = require('../clientManagePersonalDriver');
    mockTransaction.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'client_1',
        status: 'active',
        selectedPlanId: 'classic',
        specialTripsUsed: 2,
        paymentStatus: 'succeeded',
        periodStartAtUtc: new Date('2026-08-01T00:00:00.000Z'),
        periodEndAtUtc: new Date('2026-09-01T00:00:00.000Z'),
        serviceTimeZone: 'America/Toronto',
        monthlyDistanceKm: 100,
        monthlyDistanceKmRemaining: 100,
      }),
    });

    await expect(clientManagePersonalDriver(makeRequest({
      action: 'requestSpecialTrip',
      subscriptionId: 'sub_1',
      pickupAddress: 'Clinique',
      destinationAddress: 'Aeroport',
      scheduledAtIso: '2026-08-12T09:30:00',
      distanceKm: 1,
    }, 'client_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects a special trip when authoritative quota fields are incomplete', async () => {
    const { clientManagePersonalDriver } = require('../clientManagePersonalDriver');
    mockTransaction.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'client_1',
        status: 'active',
        selectedPlanId: 'classic',
        paymentStatus: 'succeeded',
        periodStartAtUtc: new Date('2026-08-01T00:00:00.000Z'),
        periodEndAtUtc: new Date('2026-09-01T00:00:00.000Z'),
        serviceTimeZone: 'America/Toronto',
        monthlyDistanceKm: 100,
        monthlyDistanceKmRemaining: 100,
        specialTripsDistanceUsedKm: 0,
      }),
    });

    await expect(clientManagePersonalDriver(makeRequest({
      action: 'requestSpecialTrip',
      subscriptionId: 'sub_1',
      pickupAddress: 'Clinique',
      destinationAddress: 'Aeroport',
      scheduledAtIso: '2026-08-12T09:30:00',
    }, 'client_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.set).not.toHaveBeenCalled();
    expect(mockTransaction.update).not.toHaveBeenCalled();
  });

  it('rejects a special trip when the total kilometer quota is missing', async () => {
    const { clientManagePersonalDriver } = require('../clientManagePersonalDriver');
    mockTransaction.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'client_1',
        status: 'active',
        selectedPlanId: 'classic',
        includedSpecialTrips: 2,
        specialTripsUsed: 0,
        paymentStatus: 'succeeded',
        periodStartAtUtc: new Date('2026-08-01T00:00:00.000Z'),
        periodEndAtUtc: new Date('2026-09-01T00:00:00.000Z'),
        serviceTimeZone: 'America/Toronto',
        monthlyDistanceKmRemaining: 100,
        specialTripsDistanceUsedKm: 0,
      }),
    });

    await expect(clientManagePersonalDriver(makeRequest({
      action: 'requestSpecialTrip',
      subscriptionId: 'sub_1',
      pickupAddress: 'Clinique',
      destinationAddress: 'Aeroport',
      scheduledAtIso: '2026-08-12T09:30:00',
    }, 'client_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.set).not.toHaveBeenCalled();
    expect(mockTransaction.update).not.toHaveBeenCalled();
  });

  it('marks an expired subscription before rejecting a special trip request', async () => {
    const { clientManagePersonalDriver } = require('../clientManagePersonalDriver');
    mockTransaction.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'client_1',
        status: 'active',
        selectedPlanId: 'classic',
        paymentStatus: 'succeeded',
        periodStartAtUtc: new Date('2026-07-01T00:00:00.000Z'),
        periodEndAtUtc: new Date('2026-08-01T00:00:00.000Z'),
      }),
    });

    await expect(clientManagePersonalDriver(makeRequest({
      action: 'requestSpecialTrip',
      subscriptionId: 'sub_1',
      pickupAddress: 'Clinique',
      destinationAddress: 'Aeroport',
      scheduledAtIso: '2026-08-12T09:30:00',
    }, 'client_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      status: 'expired',
    }));
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });
});
