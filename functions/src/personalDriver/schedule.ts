import type { PersonalDriverPlanId, PersonalDriverWeekday } from './pricing.js';
import { localDateTimeToUtc } from './locationTimeZone.js';

export interface PersonalDriverTripDraft {
  subscriptionId: string;
  userId: string;
  planId: PersonalDriverPlanId;
  direction: 'outbound' | 'return';
  status: 'scheduled';
  scheduledAtIso: string;
  pickupAddress: string;
  destinationAddress: string;
  assignedDriverId: null;
  assignedVehicleId: null;
  distanceKm: number;
}

export function buildPersonalDriverTripDrafts(input: {
  subscriptionId: string;
  userId: string;
  periodStartDate: string;
  periodEndDateExclusive: string;
  serviceTimeZone: string;
  selectedWeekdays: PersonalDriverWeekday[];
  tripType: 'one_way' | 'round_trip';
  departureTime: string;
  returnTime?: string;
  pickupAddress: string;
  destinationAddress: string;
  planId: PersonalDriverPlanId;
  distanceOneWayKm: number;
  distanceReturnKm: number;
}): PersonalDriverTripDraft[] {
  if (input.tripType === 'round_trip' && !input.returnTime?.trim()) {
    throw new Error('returnTime is required for round_trip subscriptions');
  }

  const [year, month, day] = input.periodStartDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = input.periodEndDateExclusive.split('-').map(Number);
  const startDate = new Date(Date.UTC(year, month - 1, day));
  const endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
    throw new Error('Invalid personal driver period');
  }
  const selectedWeekdays = new Set(input.selectedWeekdays);
  const trips: PersonalDriverTripDraft[] = [];

  for (const date = new Date(startDate); date < endDate; date.setUTCDate(date.getUTCDate() + 1)) {
    if (!selectedWeekdays.has(date.getUTCDay() as PersonalDriverWeekday)) continue;

    const dateString = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
    trips.push({
      subscriptionId: input.subscriptionId,
      userId: input.userId,
      planId: input.planId,
      direction: 'outbound',
      status: 'scheduled',
      scheduledAtIso: localDateTimeToUtc(dateString, input.departureTime, input.serviceTimeZone).toISOString(),
      pickupAddress: input.pickupAddress,
      destinationAddress: input.destinationAddress,
      assignedDriverId: null,
      assignedVehicleId: null,
      distanceKm: input.distanceOneWayKm,
    });

    if (input.tripType === 'round_trip') {
      trips.push({
        subscriptionId: input.subscriptionId,
        userId: input.userId,
        planId: input.planId,
        direction: 'return',
        status: 'scheduled',
        scheduledAtIso: localDateTimeToUtc(dateString, input.returnTime!, input.serviceTimeZone).toISOString(),
        pickupAddress: input.destinationAddress,
        destinationAddress: input.pickupAddress,
        assignedDriverId: null,
        assignedVehicleId: null,
        distanceKm: input.distanceReturnKm,
      });
    }
  }

  return trips;
}
