export type PersonalDriverPlanId = 'basic' | 'classic' | 'premium';
export type PersonalDriverTripType = 'one_way' | 'round_trip';
export type PersonalDriverWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type PersonalDriverSubscriptionStatus =
  | 'pending_payment'
  | 'pending_validation'
  | 'active'
  | 'cancelled'
  | 'expired';
export type PersonalDriverTripStatus =
  | 'scheduled'
  | 'driver_assigned'
  | 'driver_en_route'
  | 'driver_arrived'
  | 'passenger_picked_up'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface PersonalDriverPlan {
  id: PersonalDriverPlanId;
  name: string;
  badge?: string;
  promise: string;
  pricePerKm: number;
  minimumBillableKm: number;
  minimumAmount: number;
  allowedWeekdays: PersonalDriverWeekday[];
  includedRegularWaitMinutes: number;
  includedSpecialTrips: number;
  benefits: string[];
}

export interface PersonalDriverPriceInput {
  monthlyDistanceKm: number;
  requestedWeekdays: PersonalDriverWeekday[];
}

export interface PersonalDriverPlanPrice {
  planId: PersonalDriverPlanId;
  isEligible: boolean;
  pricePerKm: number;
  minimumAmount: number;
  minimumBillableKm: number;
  distanceAmount: number;
  totalBeforeTax: number;
  minimumApplied: boolean;
  savingsComparedToBasic: number;
}

export interface PersonalDriverPriceComparison {
  monthlyDistanceKm: number;
  plans: Record<PersonalDriverPlanId, PersonalDriverPlanPrice>;
  recommendedPlanId: PersonalDriverPlanId;
  recommendationReasons: string[];
}
