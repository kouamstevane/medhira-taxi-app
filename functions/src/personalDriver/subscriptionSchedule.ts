import { getLocalCalendarDate } from './locationTimeZone.js';

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function assertCalendarDate(value: string): void {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) throw new Error('Invalid subscription start date');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() !== Number(match[2]) - 1
    || date.getUTCDate() !== Number(match[3])
  ) {
    throw new Error('Invalid subscription start date');
  }
}

function assertTime(value: string, name: string): void {
  if (!TIME_PATTERN.test(value)) throw new Error(`Invalid subscription ${name}`);
}

export function assertValidSubscriptionSchedule(input: {
  startDate: string;
  departureTime: string;
  returnTime?: string | null;
  tripType: 'one_way' | 'round_trip';
  serviceTimeZone: string;
  now: Date;
}): void {
  assertCalendarDate(input.startDate);
  assertTime(input.departureTime, 'departure time');
  const serviceDate = getLocalCalendarDate(input.now, input.serviceTimeZone);
  if (input.startDate < serviceDate) {
    throw new Error('Subscription start date cannot be before the pickup service date');
  }
  if (input.tripType === 'round_trip') {
    if (!input.returnTime) throw new Error('Subscription return time is required');
    assertTime(input.returnTime, 'return time');
    if (input.returnTime <= input.departureTime) {
      throw new Error('Subscription return time must be after departure time');
    }
  }
}

export function assertFutureSpecialTrip(scheduledAtUtc: Date, now: Date): void {
  if (
    !Number.isFinite(scheduledAtUtc.getTime())
    || !Number.isFinite(now.getTime())
    || scheduledAtUtc <= now
  ) {
    throw new Error('Special trip must be scheduled in the future');
  }
}
