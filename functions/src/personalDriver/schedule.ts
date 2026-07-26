import type { PersonalDriverPlanId, PersonalDriverWeekday } from './pricing.js';

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
}

export function buildPersonalDriverTripDrafts(input: {
  subscriptionId: string;
  userId: string;
  startDate: string;
  selectedWeekdays: PersonalDriverWeekday[];
  tripType: 'one_way' | 'round_trip';
  departureTime: string;
  returnTime?: string;
  pickupAddress: string;
  destinationAddress: string;
  planId: PersonalDriverPlanId;
}): PersonalDriverTripDraft[] {
  if (input.tripType === 'round_trip' && !input.returnTime?.trim()) {
    throw new Error('returnTime is required for round_trip subscriptions');
  }

  const [year, month, day] = input.startDate.split('-').map(Number);
  const startDate = new Date(year, month - 1, day);
  const selectedWeekdays = new Set(input.selectedWeekdays);
  const trips: PersonalDriverTripDraft[] = [];

  for (let offset = 0; offset < 30; offset += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + offset);
    if (!selectedWeekdays.has(date.getDay() as PersonalDriverWeekday)) continue;

    const dateString = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    trips.push({
      subscriptionId: input.subscriptionId,
      userId: input.userId,
      planId: input.planId,
      direction: 'outbound',
      status: 'scheduled',
      scheduledAtIso: `${dateString}T${input.departureTime}:00`,
      pickupAddress: input.pickupAddress,
      destinationAddress: input.destinationAddress,
      assignedDriverId: null,
      assignedVehicleId: null,
    });

    if (input.tripType === 'round_trip') {
      trips.push({
        subscriptionId: input.subscriptionId,
        userId: input.userId,
        planId: input.planId,
        direction: 'return',
        status: 'scheduled',
        scheduledAtIso: `${dateString}T${input.returnTime}:00`,
        pickupAddress: input.destinationAddress,
        destinationAddress: input.pickupAddress,
        assignedDriverId: null,
        assignedVehicleId: null,
      });
    }
  }

  return trips;
}
