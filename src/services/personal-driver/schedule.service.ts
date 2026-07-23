import type {
  PersonalDriverPlanId,
  PersonalDriverTripStatus,
  PersonalDriverTripType,
  PersonalDriverWeekday,
} from '@/types/personal-driver';

interface PersonalDriverTripDraftInput {
  subscriptionId: string;
  userId: string;
  startDate: string;
  selectedWeekdays: PersonalDriverWeekday[];
  tripType: PersonalDriverTripType;
  departureTime: string;
  returnTime?: string;
  pickupAddress: string;
  destinationAddress: string;
  planId: PersonalDriverPlanId;
}

export interface PersonalDriverTripDraft {
  subscriptionId: string;
  userId: string;
  planId: PersonalDriverPlanId;
  direction: 'outbound' | 'return';
  status: PersonalDriverTripStatus;
  scheduledAtIso: string;
  pickupAddress: string;
  destinationAddress: string;
  assignedDriverId: null;
  assignedVehicleId: null;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function createTripDraft(
  input: PersonalDriverTripDraftInput,
  date: string,
  direction: 'outbound' | 'return',
  time: string,
): PersonalDriverTripDraft {
  const isReturn = direction === 'return';

  return {
    subscriptionId: input.subscriptionId,
    userId: input.userId,
    planId: input.planId,
    direction,
    status: 'scheduled',
    scheduledAtIso: `${date}T${time}:00`,
    pickupAddress: isReturn ? input.destinationAddress : input.pickupAddress,
    destinationAddress: isReturn ? input.pickupAddress : input.destinationAddress,
    assignedDriverId: null,
    assignedVehicleId: null,
  };
}

export function buildPersonalDriverTripDrafts(
  input: PersonalDriverTripDraftInput,
): PersonalDriverTripDraft[] {
  const [year, month, day] = input.startDate.split('-').map(Number);
  const startDate = new Date(year, month - 1, day);
  const selectedWeekdays = new Set(input.selectedWeekdays);
  const trips: PersonalDriverTripDraft[] = [];

  for (let offset = 0; offset < 30; offset += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + offset);

    if (!selectedWeekdays.has(date.getDay() as PersonalDriverWeekday)) continue;

    const dateString = formatDate(date);
    trips.push(createTripDraft(input, dateString, 'outbound', input.departureTime));

    if (input.tripType === 'round_trip') {
      trips.push(createTripDraft(input, dateString, 'return', input.returnTime ?? ''));
    }
  }

  return trips;
}
