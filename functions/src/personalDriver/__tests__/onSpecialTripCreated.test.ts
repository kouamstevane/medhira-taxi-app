export {};

const mockBatch = {
  set: jest.fn(),
  update: jest.fn(),
  commit: jest.fn().mockResolvedValue(undefined),
};

const mockAdminDocs = [
  { id: 'admin_1', data: () => ({ email: 'admin1@test.com' }) },
  { id: 'admin_2', data: () => ({ email: 'admin2@test.com' }) },
];

const mockDriverDocs = [
  {
    id: 'driver_1',
    data: () => ({
      status: 'approved',
      isAvailable: true,
      vehicleId: 'vehicle_1',
    }),
  },
];

const mockPersonalDriverTripsQuery = {
  where: jest.fn().mockReturnThis(),
  get: jest.fn().mockResolvedValue({ docs: [] }),
};

const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'admins') {
      return {
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: mockAdminDocs,
        }),
      };
    }
    if (name === 'drivers') {
      return {
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: mockDriverDocs,
        }),
      };
    }
    if (name === 'personal_driver_trips') {
      return {
        doc: jest.fn((id?: string) => ({ id: id ?? 'trip_special_1' })),
        where: jest.fn().mockReturnValue(mockPersonalDriverTripsQuery),
      };
    }
    if (name === 'vehicles') {
      return {
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              empty: false,
              docs: [{ id: 'vehicle_1' }],
            }),
          }),
        }),
      };
    }
    if (name === 'notifications') {
      return {
        doc: jest.fn(() => ({ id: 'notif_gen_' + Math.random().toString(36).substring(7) })),
      };
    }
    throw new Error(`Unexpected collection ${name}`);
  }),
  batch: jest.fn(() => mockBatch),
};

jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(() => mockDb), {
    FieldValue: {
      serverTimestamp: jest.fn(() => ({ __ts: true })),
    },
  }),
}));

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_options: unknown, handler: unknown) => handler,
}));

function makeFirestoreEvent(tripData: Record<string, unknown> | null, tripId = 'trip_special_1') {
  return {
    data: tripData ? { exists: true, data: () => tripData } : null,
    params: { tripId },
  } as never;
}

describe('onSpecialTripCreated', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ignores event if event data does not exist or trip is not special', async () => {
    const { onSpecialTripCreated } = require('../onSpecialTripCreated');

    await onSpecialTripCreated(makeFirestoreEvent(null));
    expect(mockDb.batch).not.toHaveBeenCalled();

    await onSpecialTripCreated(makeFirestoreEvent({ isSpecialTrip: false, direction: 'one_way' }));
    expect(mockDb.batch).not.toHaveBeenCalled();
  });

  it('notifies admins and automatically assigns eligible driver on special trip creation', async () => {
    const { onSpecialTripCreated } = require('../onSpecialTripCreated');

    const futureDateIso = new Date(Date.now() + 10 * 3600 * 1000).toISOString();

    await onSpecialTripCreated(makeFirestoreEvent({
      isSpecialTrip: true,
      direction: 'special',
      status: 'scheduled',
      assignedDriverId: null,
      scheduledAtIso: futureDateIso,
      userId: 'client_123',
      subscriptionId: 'sub_456',
    }, 'trip_special_1'));

    expect(mockDb.batch).toHaveBeenCalled();
    expect(mockBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'trip_special_1' }),
      expect.objectContaining({
        assignedDriverId: 'driver_1',
        assignedVehicleId: 'vehicle_1',
        status: 'driver_assigned',
        assignedBy: 'system_auto_assignment',
      }),
    );
    expect(mockBatch.commit).toHaveBeenCalled();
  });
});
