const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCoordinate(value: unknown): value is { latitude: number; longitude: number } {
  if (!value || typeof value !== 'object') return false;
  const coordinate = value as Record<string, unknown>;
  return isFiniteNumber(coordinate.latitude)
    && coordinate.latitude >= -90
    && coordinate.latitude <= 90
    && isFiniteNumber(coordinate.longitude)
    && coordinate.longitude >= -180
    && coordinate.longitude <= 180;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isValidWeekdays(value: unknown): boolean {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= 7
    && new Set(value).size === value.length
    && value.every((weekday) => typeof weekday === 'number' && Number.isInteger(weekday) && weekday >= 0 && weekday <= 6);
}

function isValidNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function isPersonalDriverSubscriptionReadyForActivation(
  subscription: FirebaseFirestore.DocumentData | undefined,
): boolean {
  if (!subscription || typeof subscription.userId !== 'string' || !subscription.userId.trim()) return false;
  if (!['basic', 'classic', 'premium'].includes(subscription.selectedPlanId)) return false;
  if (!['one_way', 'round_trip'].includes(subscription.tripType)) return false;
  if (!isCalendarDate(subscription.periodStartDate) || !isCalendarDate(subscription.periodEndDateExclusive)) return false;
  const periodStartAtUtc = toDate(subscription.periodStartAtUtc);
  const periodEndAtUtc = toDate(subscription.periodEndAtUtc);
  if (!periodStartAtUtc || !periodEndAtUtc || periodEndAtUtc <= periodStartAtUtc) return false;
  if (!isValidTimeZone(subscription.serviceTimeZone)) return false;
  if (typeof subscription.pickupAddress !== 'string' || !subscription.pickupAddress.trim()) return false;
  if (typeof subscription.destinationAddress !== 'string' || !subscription.destinationAddress.trim()) return false;
  if (!isCoordinate(subscription.pickupLocation) || !isCoordinate(subscription.destinationLocation)) return false;
  if (!isValidWeekdays(subscription.selectedWeekdays)) return false;
  if (typeof subscription.departureTime !== 'string' || !TIME_PATTERN.test(subscription.departureTime)) return false;
  if (subscription.tripType === 'round_trip') {
    if (typeof subscription.returnTime !== 'string' || !TIME_PATTERN.test(subscription.returnTime)) return false;
  } else if (subscription.returnTime !== null && subscription.returnTime !== undefined) {
    return false;
  }
  if (!isFiniteNumber(subscription.distanceOneWayKm) || subscription.distanceOneWayKm <= 0) return false;
  if (!isFiniteNumber(subscription.distanceReturnKm) || subscription.distanceReturnKm < 0) return false;
  if (subscription.tripType === 'round_trip' && subscription.distanceReturnKm <= 0) return false;
  if (!isFiniteNumber(subscription.monthlyDistanceKm) || subscription.monthlyDistanceKm <= 0) return false;
  if (!isFiniteNumber(subscription.monthlyDistanceKmRemaining) || subscription.monthlyDistanceKmRemaining < 0) return false;
  if (!isValidNonNegativeInteger(subscription.includedSpecialTrips)) return false;
  if (!isValidNonNegativeInteger(subscription.specialTripsUsed)
    || subscription.specialTripsUsed > subscription.includedSpecialTrips) return false;
  if (!isFiniteNumber(subscription.specialTripsDistanceUsedKm) || subscription.specialTripsDistanceUsedKm < 0) return false;
  if (subscription.taxStatus !== 'pending_confirmation' || subscription.taxAmount !== 0) return false;
  if (!isFiniteNumber(subscription.totalAmount) || subscription.totalAmount < 0) return false;
  if (typeof subscription.currency !== 'string' || !subscription.currency.trim()) return false;
  const selectedPlanPrice = subscription.selectedPlanPrice;
  if (!selectedPlanPrice || selectedPlanPrice.planId !== subscription.selectedPlanId
    || !isFiniteNumber(selectedPlanPrice.totalBeforeTax)) return false;
  if (Math.abs(selectedPlanPrice.totalBeforeTax - subscription.totalAmount) > 0.001) return false;
  return true;
}

export function isPersonalDriverSubscriptionReadyForPaymentConfirmation(
  subscription: FirebaseFirestore.DocumentData | undefined,
): boolean {
  if (!isPersonalDriverSubscriptionReadyForActivation(subscription)) return false;
  if (subscription?.status !== 'pending_payment') return false;
  if (!['creating', 'pending', 'requires_action'].includes(subscription.paymentStatus)) return false;
  return subscription.monthlyDistanceKmRemaining === subscription.monthlyDistanceKm
    && subscription.specialTripsUsed === 0
    && subscription.specialTripsDistanceUsedKm === 0;
}
