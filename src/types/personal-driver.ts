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

export interface PersonalDriverSubscription {
  id: string;
  userId: string;
  planId?: PersonalDriverPlanId;
  selectedPlanId: PersonalDriverPlanId;
  status: PersonalDriverSubscriptionStatus;
  startDate: string;
  endDate: string;
  monthlyDistanceKm: number;
  monthlyDistanceKmRemaining?: number;
  specialTripsDistanceUsedKm?: number;
  totalPriceBeforeTax?: number;
  totalPriceWithTax?: number;
  totalAmount: number;
  currency: string;
  includedSpecialTrips: number;
  specialTripsUsed: number;
  specialTripsRemaining?: number;
  pickupAddress: string;
  destinationAddress: string;
  tripType: PersonalDriverTripType;
  selectedWeekdays: PersonalDriverWeekday[];
  departureTime: string;
  returnTime?: string;
  passengerCount: number;
  notes?: string;
  createdAt: string | Date | { toDate: () => Date };
}

export interface PersonalDriverTrip {
  id: string;
  subscriptionId: string;
  userId: string;
  planId: PersonalDriverPlanId;
  direction: 'outbound' | 'return' | 'special';
  isSpecialTrip?: boolean;
  distanceKm?: number;
  status: PersonalDriverTripStatus;
  scheduledAtIso: string;
  pickupAddress: string;
  destinationAddress: string;
  assignedDriverId: string | null;
  assignedDriverName?: string;
  assignedVehicleId: string | null;
  driverArrivedAtIso?: string;
  waitTimeMinutes?: number;
  overageWaitMinutes?: number;
  overageWaitFeeAmount?: number;
  overageWaitBilled?: boolean;
  cancelledBy?: 'client' | 'driver' | 'admin';
  clientCancelledLostKm?: boolean;
  driverAlertFlagged?: boolean;
  driverAlertReason?: string;
}
