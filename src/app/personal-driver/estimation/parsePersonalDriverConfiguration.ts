import type { PersonalDriverPlanId } from '@/types/personal-driver';
import type { PersonalDriverConfiguration } from '@/app/personal-driver/components/PersonalDriverConfigurator';

function isPlanId(value: unknown): value is PersonalDriverPlanId {
  return value === 'basic' || value === 'classic' || value === 'premium';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isWeekday(value: unknown): value is PersonalDriverConfiguration['weekdays'][number] {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}

export function parsePersonalDriverConfiguration(value: unknown): PersonalDriverConfiguration | null {
  if (!value || typeof value !== 'object') return null;
  const configuration = value as Partial<PersonalDriverConfiguration>;
  if (
    configuration.version !== 1
    || !isNonEmptyString(configuration.requestId)
    || !isPlanId(configuration.planId)
    || !isNonEmptyString(configuration.pickupAddress)
    || !isNonEmptyString(configuration.destinationAddress)
    || (configuration.tripType !== 'one_way' && configuration.tripType !== 'round_trip')
    || !Array.isArray(configuration.weekdays)
    || configuration.weekdays.length === 0
    || !configuration.weekdays.every(isWeekday)
    || !isNonEmptyString(configuration.departureTime)
    || !isNonEmptyString(configuration.startDate)
    || !isPositiveFiniteNumber(configuration.distanceKm)
    || !isPositiveFiniteNumber(configuration.distanceOneWayKm)
    || !isPositiveFiniteNumber(configuration.monthlyDistanceKm)
    || typeof configuration.passengerCount !== 'number'
    || !Number.isInteger(configuration.passengerCount)
    || configuration.passengerCount <= 0
  ) {
    return null;
  }

  if (configuration.tripType === 'round_trip') {
    if (!isNonEmptyString(configuration.returnTime) || !isPositiveFiniteNumber(configuration.distanceReturnKm)) {
      return null;
    }
  } else if (configuration.returnTime !== undefined && !isNonEmptyString(configuration.returnTime)) {
    return null;
  }

  if (configuration.notes !== undefined && typeof configuration.notes !== 'string') return null;
  return configuration as PersonalDriverConfiguration;
}
