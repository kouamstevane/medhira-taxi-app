import { cancelPersonalDriverTripByClient, requestSpecialTrip } from './subscription.service';
import { httpsCallable } from 'firebase/functions';

const mockCallable = jest.fn();

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => mockCallable),
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
});
