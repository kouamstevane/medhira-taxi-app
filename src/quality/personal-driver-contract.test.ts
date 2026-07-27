import { httpsCallable } from 'firebase/functions';
import {
  cancelPersonalDriverTripByClient,
  createPersonalDriverSubscriptionPayment,
  requestSpecialTrip,
} from '@/services/personal-driver/subscription.service';
import {
  personalDriverContractFixture,
  personalDriverSpecialTripFixture,
} from './personal-driver-contract-fixtures';

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({
  db: {},
  functions: { region: 'europe-west1' },
}));

describe('Personal Driver frontend/backend callable contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (httpsCallable as jest.Mock).mockReturnValue(jest.fn().mockResolvedValue({
      data: {
        subscriptionId: 'sub_contract',
        paymentIntentId: 'pi_contract',
        clientSecret: 'pi_contract_secret',
        amount: 650,
        currency: 'cad',
      },
    }));
  });

  it('sends the subscription payment payload expected by the backend schema', async () => {
    await createPersonalDriverSubscriptionPayment(personalDriverContractFixture);

    expect(httpsCallable).toHaveBeenCalledWith(
      { region: 'europe-west1' },
      'createPersonalDriverSubscriptionPayment',
    );
    const callable = (httpsCallable as jest.Mock).mock.results[0].value;
    expect(callable).toHaveBeenCalledWith({
      selectedPlanId: 'classic',
      requestId: 'contract-request-001',
      pickupAddress: '100 rue Principale, Montreal',
      destinationAddress: '500 rue Universite, Montreal',
      tripType: 'round_trip',
      selectedWeekdays: [1, 2, 3, 4, 5],
      departureTime: '07:30',
      returnTime: '17:30',
      startDate: '2026-08-03',
      distanceOneWayKm: 12.4,
      distanceReturnKm: 12.4,
      monthlyDistanceKm: 620,
      passengerCount: 1,
      notes: 'Fixture contrat Personal Driver',
    });
    expect(callable.mock.calls[0][0]).not.toHaveProperty('planId');
    expect(callable.mock.calls[0][0]).not.toHaveProperty('weekdays');
  });

  it('routes client cancellation through clientManagePersonalDriver', async () => {
    await cancelPersonalDriverTripByClient('trip_contract_001');

    expect(httpsCallable).toHaveBeenCalledWith(
      { region: 'europe-west1' },
      'clientManagePersonalDriver',
    );
    const callable = (httpsCallable as jest.Mock).mock.results[0].value;
    expect(callable).toHaveBeenCalledWith({
      action: 'cancelTrip',
      tripId: 'trip_contract_001',
    });
  });

  it('routes special trip requests through clientManagePersonalDriver with quota fields', async () => {
    await requestSpecialTrip(
      personalDriverSpecialTripFixture.subscriptionId,
      'client_contract_001',
      'classic',
      personalDriverSpecialTripFixture.pickupAddress,
      personalDriverSpecialTripFixture.destinationAddress,
      personalDriverSpecialTripFixture.scheduledAtIso,
      personalDriverSpecialTripFixture.distanceKm,
    );

    expect(httpsCallable).toHaveBeenCalledWith(
      { region: 'europe-west1' },
      'clientManagePersonalDriver',
    );
    const callable = (httpsCallable as jest.Mock).mock.results[0].value;
    expect(callable).toHaveBeenCalledWith({
      action: 'requestSpecialTrip',
      subscriptionId: 'subscription-contract-001',
      pickupAddress: '100 rue Principale, Montreal',
      destinationAddress: 'Aeroport YUL, Montreal',
      scheduledAtIso: '2026-08-12T09:30:00',
      distanceKm: 22,
    });
  });
});
