jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP') },
  }),
}));

import { generatePersonalDriverTrips } from '../tripGeneration.js';
import type { PersonalDriverPlanId, PersonalDriverWeekday } from '../pricing.js';

describe('personal driver trip generation', () => {
  const existingIds = new Set<string>();
  const transaction = {
    get: jest.fn(async (ref: { id: string }) => ({ exists: existingIds.has(ref.id) })),
    create: jest.fn((ref: { id: string }) => existingIds.add(ref.id)),
  };
  const mockRunTransaction = jest.fn(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction));
  const mockDb = {
    collection: jest.fn(() => ({ doc: (id: string) => ({ id }) })),
    runTransaction: mockRunTransaction,
  } as unknown as FirebaseFirestore.Firestore;
  const activeSubscription = {
    id: 'sub_1',
    userId: 'user_1',
    status: 'active',
    paymentStatus: 'succeeded',
    periodStartDate: '2026-07-27',
    periodEndDateExclusive: '2026-08-26',
    serviceTimeZone: 'America/Toronto',
    selectedWeekdays: [1] as PersonalDriverWeekday[],
    tripType: 'one_way' as const,
    departureTime: '08:00',
    pickupAddress: 'A',
    destinationAddress: 'B',
    pickupLocation: { latitude: 45.5, longitude: -73.5 },
    selectedPlanId: 'basic' as PersonalDriverPlanId,
    distanceOneWayKm: 12.5,
    distanceReturnKm: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    existingIds.clear();
  });

  it('creates deterministic UTC drafts and does not duplicate them on replay', async () => {
    await generatePersonalDriverTrips(mockDb, activeSubscription);
    await generatePersonalDriverTrips(mockDb, activeSubscription);

    expect(transaction.create).toHaveBeenCalledTimes(5);
    expect(transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sub_1_0' }),
      expect.objectContaining({
        subscriptionId: 'sub_1',
        scheduledAtIso: '2026-07-27T12:00:00.000Z',
        distanceKm: 12.5,
      }),
    );
  });

  it('does not generate drafts before confirmed payment and activation', async () => {
    await generatePersonalDriverTrips(mockDb, {
      ...activeSubscription,
      status: 'pending_payment',
      paymentStatus: 'pending',
    });

    expect(mockRunTransaction).not.toHaveBeenCalled();
  });
});
