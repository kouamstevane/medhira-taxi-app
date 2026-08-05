export {};

const mockTripRef = { id: 'trip_1' };
const mockNewTripRef = { id: 'special_1' };
const mockDriverRef = { id: 'driver_1' };
const mockAssignedTripsQuery: { where: jest.Mock } = { where: jest.fn() };
mockAssignedTripsQuery.where.mockReturnValue(mockAssignedTripsQuery);
const mockCustomerCancellationNotificationRef = { id: 'personal_driver_trip_cancelled_trip_1_customer' };
const mockDriverCancellationNotificationRef = { id: 'personal_driver_trip_cancelled_trip_1_driver' };
const mockNotificationDoc = jest.fn((id?: string) => {
  if (id === mockCustomerCancellationNotificationRef.id) return mockCustomerCancellationNotificationRef;
  if (id === mockDriverCancellationNotificationRef.id) return mockDriverCancellationNotificationRef;
  return { id: id ?? 'notification_1' };
});
const mockTransaction = {
  get: jest.fn(),
  update: jest.fn(),
  set: jest.fn(),
};
const mockSubscriptionRef = { id: 'sub_1', get: jest.fn(() => mockTransaction.get()) };
const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'personal_driver_subscriptions') return { doc: jest.fn(() => mockSubscriptionRef) };
    if (name === 'personal_driver_trips') {
      return {
        doc: jest.fn((id?: string) => id === 'trip_1' ? mockTripRef : mockNewTripRef),
        where: jest.fn(() => mockAssignedTripsQuery),
      };
    }
    if (name === 'drivers') return { doc: jest.fn(() => mockDriverRef) };
    if (name === 'notifications') return { doc: mockNotificationDoc };
    throw new Error(`Unexpected collection ${name}`);
  }),
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
    const trip = {
      userId: 'client_1',
      status: 'driver_assigned',
      assignedDriverId: 'driver_1',
      assignedVehicleId: 'vehicle_1',
    };
    const driver = {
      isAvailable: false,
      availabilityStatus: 'busy_personal_driver',
      activePersonalDriverTripId: 'trip_1',
    };
    mockTransaction.get.mockImplementation(async (ref: unknown) => {
      if (ref === mockTripRef) return { exists: true, data: () => trip };
      if (ref === mockDriverRef) return { exists: true, data: () => driver };
      if (ref === mockAssignedTripsQuery) return { docs: [{ id: 'trip_1' }] };
      throw new Error('Unexpected transaction read');
    });
    mockTransaction.update.mockImplementation((ref: unknown, update: Record<string, unknown>) => {
      if (ref === mockTripRef) Object.assign(trip, update);
    });

    await expect(clientManagePersonalDriver(makeRequest({ action: 'cancelTrip', tripId: 'trip_1' }, 'client_1')))
      .resolves.toEqual({ success: true });
    await expect(clientManagePersonalDriver(makeRequest({ action: 'cancelTrip', tripId: 'trip_1' }, 'client_1')))
      .resolves.toEqual({ success: true });

    expect(mockTransaction.update).toHaveBeenCalledWith(mockTripRef, expect.objectContaining({
      status: 'cancelled',
      assignedDriverId: null,
      assignedVehicleId: null,
    }));
    expect(mockTransaction.update).toHaveBeenCalledWith(mockDriverRef, expect.objectContaining({
      isAvailable: true,
      availabilityStatus: 'available',
      activePersonalDriverTripId: null,
    }));
    expect(mockTransaction.set).toHaveBeenCalledTimes(2);
    expect(mockTransaction.set).toHaveBeenCalledWith(
      mockCustomerCancellationNotificationRef,
      expect.objectContaining({
        userId: 'client_1',
        type: 'personal_driver_trip_cancelled',
        idempotencyKey: 'personal_driver_trip_cancelled_trip_1_customer',
      }),
    );
    expect(mockTransaction.set).toHaveBeenCalledWith(
      mockDriverCancellationNotificationRef,
      expect.objectContaining({
        userId: 'driver_1',
        type: 'personal_driver_trip_cancelled_driver',
        idempotencyKey: 'personal_driver_trip_cancelled_trip_1_driver',
      }),
    );
  });

  it('keeps the driver unavailable when another nonterminal trip remains assigned', async () => {
    const { clientManagePersonalDriver } = require('../clientManagePersonalDriver');
    const trip = {
      userId: 'client_1',
      status: 'driver_en_route',
      assignedDriverId: 'driver_1',
      assignedVehicleId: 'vehicle_1',
    };
    mockTransaction.get.mockImplementation(async (ref: unknown) => {
      if (ref === mockTripRef) return { exists: true, data: () => trip };
      if (ref === mockDriverRef) {
        return {
          exists: true,
          data: () => ({
            isAvailable: false,
            availabilityStatus: 'busy_personal_driver',
            activePersonalDriverTripId: 'trip_1',
          }),
        };
      }
      if (ref === mockAssignedTripsQuery) return { docs: [{ id: 'trip_1' }, { id: 'trip_2' }] };
      throw new Error('Unexpected transaction read');
    });

    await expect(clientManagePersonalDriver(makeRequest({ action: 'cancelTrip', tripId: 'trip_1' }, 'client_1')))
      .resolves.toEqual({ success: true });

    expect(mockTransaction.update).toHaveBeenCalledWith(mockTripRef, expect.objectContaining({
      status: 'cancelled',
      assignedDriverId: null,
      assignedVehicleId: null,
    }));
    expect(mockTransaction.update).not.toHaveBeenCalledWith(mockDriverRef, expect.anything());
  });

  it('still cancels the trip when its assigned driver document no longer exists', async () => {
    const { clientManagePersonalDriver } = require('../clientManagePersonalDriver');
    const trip = {
      userId: 'client_1',
      status: 'driver_assigned',
      assignedDriverId: 'driver_1',
      assignedVehicleId: 'vehicle_1',
    };
    mockTransaction.get.mockImplementation(async (ref: unknown) => {
      if (ref === mockTripRef) return { exists: true, data: () => trip };
      if (ref === mockDriverRef) return { exists: false, data: () => undefined };
      if (ref === mockAssignedTripsQuery) return { docs: [{ id: 'trip_1' }] };
      throw new Error('Unexpected transaction read');
    });

    await expect(clientManagePersonalDriver(makeRequest({ action: 'cancelTrip', tripId: 'trip_1' }, 'client_1')))
      .resolves.toEqual({ success: true });

    expect(mockTransaction.update).toHaveBeenCalledWith(mockTripRef, expect.objectContaining({
      status: 'cancelled',
    }));
    expect(mockTransaction.update).not.toHaveBeenCalledWith(mockDriverRef, expect.anything());
  });

  it('does not expose a driver whose availability belongs to another service', async () => {
    const { clientManagePersonalDriver } = require('../clientManagePersonalDriver');
    const trip = {
      userId: 'client_1',
      status: 'driver_assigned',
      assignedDriverId: 'driver_1',
      assignedVehicleId: 'vehicle_1',
    };
    mockTransaction.get.mockImplementation(async (ref: unknown) => {
      if (ref === mockTripRef) return { exists: true, data: () => trip };
      if (ref === mockDriverRef) {
        return {
          exists: true,
          data: () => ({
            isAvailable: false,
            availabilityStatus: 'busy_taxi',
            activePersonalDriverTripId: 'trip_1',
            activeBookingId: 'booking_1',
          }),
        };
      }
      if (ref === mockAssignedTripsQuery) return { docs: [{ id: 'trip_1' }] };
      throw new Error('Unexpected transaction read');
    });

    await expect(clientManagePersonalDriver(makeRequest({ action: 'cancelTrip', tripId: 'trip_1' }, 'client_1')))
      .resolves.toEqual({ success: true });

    expect(mockTransaction.update).not.toHaveBeenCalledWith(mockDriverRef, expect.anything());
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
    jest.useFakeTimers().setSystemTime(Date.parse('2026-08-03T12:00:00.000Z'));
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
      specialTripDistanceUsage: {
        policy: 'monthly_distance_allowance',
        officialDistanceKm: 8.2,
        monthlyDistanceKmRemainingBefore: 50,
        monthlyDistanceKmRemainingAfter: 41.8,
      },
    }));
    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      specialTripsUsed: { __increment: 1 },
      specialTripsDistanceUsedKm: { __increment: 8.2 },
      monthlyDistanceKmRemaining: 41.8,
    }));
  });

  it('rejects a special trip that is already in the past on the fixed service clock', async () => {
    jest.useFakeTimers().setSystemTime(Date.parse('2026-08-03T12:00:00.000Z'));
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

    expect(mockDb.runTransaction).not.toHaveBeenCalled();
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
