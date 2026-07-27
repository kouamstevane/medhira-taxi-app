export const personalDriverConfigSessionKey = 'medjira.personalDriver.config.v1';
export const personalDriverEstimateSessionKey = 'medjira.personalDriver.estimate.v1';

export const personalDriverClassicConfiguration = {
  version: 1,
  requestId: 'e2e-personal-driver-classic-001',
  planId: 'classic',
  pickupAddress: '100 rue Principale, Montreal',
  destinationAddress: '500 rue Universite, Montreal',
  tripType: 'round_trip',
  weekdays: [1, 2, 3, 4, 5],
  departureTime: '07:30',
  returnTime: '17:30',
  startDate: '2026-08-03',
  passengerCount: 1,
  notes: 'Fixture E2E Personal Driver',
  distanceKm: 12.4,
  distanceOneWayKm: 12.4,
  distanceReturnKm: 12.4,
  monthlyDistanceKm: 620,
} as const;

export const personalDriverClassicPrice = {
  planId: 'classic',
  isEligible: true,
  pricePerKm: 1.25,
  minimumAmount: 450,
  minimumBillableKm: 360,
  distanceAmount: 775,
  totalBeforeTax: 775,
  minimumApplied: false,
  savingsComparedToBasic: 155,
} as const;

export const personalDriverEstimateSession = {
  version: 1,
  requestId: personalDriverClassicConfiguration.requestId,
  selectedPlanId: 'classic',
  recommendedPlanId: 'classic',
  monthlyDistanceKm: 620,
  selectedPlan: personalDriverClassicPrice,
  comparison: {
    monthlyDistanceKm: 620,
    recommendedPlanId: 'classic',
    recommendationReasons: ['Classic est recommandé pour vos trajets réguliers en semaine.'],
    plans: {
      basic: {
        planId: 'basic',
        isEligible: true,
        pricePerKm: 1.5,
        minimumAmount: 300,
        minimumBillableKm: 200,
        distanceAmount: 930,
        totalBeforeTax: 930,
        minimumApplied: false,
        savingsComparedToBasic: 0,
      },
      classic: personalDriverClassicPrice,
      premium: {
        planId: 'premium',
        isEligible: true,
        pricePerKm: 1.1,
        minimumAmount: 650,
        minimumBillableKm: 591,
        distanceAmount: 682,
        totalBeforeTax: 682,
        minimumApplied: false,
        savingsComparedToBasic: 248,
      },
    },
  },
  configuration: personalDriverClassicConfiguration,
} as const;
