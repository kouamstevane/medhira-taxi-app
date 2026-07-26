export {};

const mockTripRef = {};
const mockTripData: Record<string, unknown> = {};

const mockTransaction = {
  get: jest.fn(),
  update: jest.fn(),
};

const mockDb = {
  collection: jest.fn(() => ({ doc: jest.fn(() => mockTripRef) })),
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

function makeRequest(data: unknown, uid?: string) {
  return { data, auth: uid ? { uid } : undefined } as never;
}

describe('driverUpdatePersonalDriverTrip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockTripData, {
      assignedDriverId: 'driver_1',
      status: 'driver_assigned',
      statusHistory: [],
    });
    mockTransaction.get.mockResolvedValue({
      exists: true,
      data: () => mockTripData,
    });
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
