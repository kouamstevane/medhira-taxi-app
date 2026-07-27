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

function makeRequest(data: unknown, uid?: string) {
  return { data, auth: uid ? { uid } : undefined } as never;
}

describe('clientManagePersonalDriver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    mockTransaction.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'client_1',
        status: 'active',
        selectedPlanId: 'classic',
        specialTripsUsed: 1,
      }),
    });

    const result = await clientManagePersonalDriver(makeRequest({
      action: 'requestSpecialTrip',
      subscriptionId: 'sub_1',
      pickupAddress: 'Clinique',
      destinationAddress: 'Aeroport',
      scheduledAtIso: '2026-08-12T09:30:00',
      distanceKm: 18,
    }, 'client_1'));

    expect(result).toEqual({ success: true, tripId: 'special_1', specialTripsRemaining: 0 });
    expect(mockTransaction.set).toHaveBeenCalledWith(mockNewTripRef, expect.objectContaining({
      direction: 'special',
      isSpecialTrip: true,
      userId: 'client_1',
      planId: 'classic',
      status: 'scheduled',
    }));
    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      specialTripsUsed: { __increment: 1 },
    }));
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
      }),
    });

    await expect(clientManagePersonalDriver(makeRequest({
      action: 'requestSpecialTrip',
      subscriptionId: 'sub_1',
      pickupAddress: 'Clinique',
      destinationAddress: 'Aeroport',
      scheduledAtIso: '2026-08-12T09:30:00',
      distanceKm: 18,
    }, 'client_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
