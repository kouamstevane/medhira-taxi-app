import {
  cancelPersonalDriverTripByClient,
  getPersonalDriverSubscriptionById,
  requestSpecialTrip,
} from './subscription.service';
import { httpsCallable } from 'firebase/functions';
import { doc } from 'firebase/firestore';

const mockCallable = jest.fn();
const mockGetDoc = jest.fn();

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => mockCallable),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn((_db, collectionName: string, documentId: string) => ({ collectionName, documentId })),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: jest.fn(),
  limit: jest.fn(),
  orderBy: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({
  db: {},
  functions: { region: 'europe-west1' },
}));

describe('Personal Driver subscription client actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCallable.mockResolvedValue({ data: { success: true, tripId: 'trip_special', specialTripsRemaining: 1 } });
  });

  it('cancels trips through the secure callable', async () => {
    await cancelPersonalDriverTripByClient('trip_1');

    expect(httpsCallable).toHaveBeenCalledWith({ region: 'europe-west1' }, 'clientManagePersonalDriver');
    expect(mockCallable).toHaveBeenCalledWith({ action: 'cancelTrip', tripId: 'trip_1' });
  });

  it('requests special trips through the secure callable', async () => {
    await requestSpecialTrip(
      'sub_1',
      'client_1',
      'classic',
      'Clinique',
      'Aeroport',
      '2026-08-12T09:30:00',
      18,
    );

    expect(mockCallable).toHaveBeenCalledWith({
      action: 'requestSpecialTrip',
      subscriptionId: 'sub_1',
      pickupAddress: 'Clinique',
      destinationAddress: 'Aeroport',
      scheduledAtIso: '2026-08-12T09:30:00',
      distanceKm: 18,
    });
  });

  it('reads one subscription by its document ID', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'sub_1',
      data: () => ({
        userId: 'client_1',
        activationStatus: 'activating',
        activationError: null,
      }),
    });

    await expect(getPersonalDriverSubscriptionById('sub_1')).resolves.toEqual({
      id: 'sub_1',
      userId: 'client_1',
      activationStatus: 'activating',
      activationError: null,
    });
    expect(doc).toHaveBeenCalledWith({}, 'personal_driver_subscriptions', 'sub_1');
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
  });
});
