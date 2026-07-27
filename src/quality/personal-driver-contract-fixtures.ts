import type { CreatePersonalDriverSubscriptionPaymentInput } from '@/services/personal-driver/subscription.service';

export const personalDriverContractFixture: CreatePersonalDriverSubscriptionPaymentInput = {
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
};

export const personalDriverSpecialTripFixture = {
  subscriptionId: 'subscription-contract-001',
  pickupAddress: '100 rue Principale, Montreal',
  destinationAddress: 'Aeroport YUL, Montreal',
  scheduledAtIso: '2026-08-12T09:30:00',
  distanceKm: 22,
};
