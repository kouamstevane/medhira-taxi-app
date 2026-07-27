import type { PersonalDriverPlanId, PersonalDriverTrip } from '@/types/personal-driver';

export interface WaitTimeFeeRate {
  includedMinutes: number;
  ratePerMinuteAfter: number;
}

export const WAIT_TIME_RULES: Record<
  PersonalDriverPlanId,
  { regular: WaitTimeFeeRate; special: WaitTimeFeeRate }
> = {
  basic: {
    regular: { includedMinutes: 3, ratePerMinuteAfter: 0.8 },
    special: { includedMinutes: 0, ratePerMinuteAfter: 0.8 },
  },
  classic: {
    regular: { includedMinutes: 5, ratePerMinuteAfter: 0.5 },
    special: { includedMinutes: 15, ratePerMinuteAfter: 0.4 },
  },
  premium: {
    regular: { includedMinutes: 10, ratePerMinuteAfter: 0.4 },
    special: { includedMinutes: 30, ratePerMinuteAfter: 0.3 },
  },
};

export interface CalculateWaitTimeResult {
  totalElapsedMinutes: number;
  includedMinutes: number;
  overageMinutes: number;
  feeAmount: number;
}

export function calculateTripWaitTimeFee(
  planId: PersonalDriverPlanId,
  elapsedMinutes: number,
  isSpecialTrip = false,
): CalculateWaitTimeResult {
  const rules = isSpecialTrip
    ? WAIT_TIME_RULES[planId].special
    : WAIT_TIME_RULES[planId].regular;

  const totalElapsed = Math.max(0, Math.floor(elapsedMinutes));
  const overageMinutes = Math.max(0, totalElapsed - rules.includedMinutes);
  const feeAmount = Math.round(overageMinutes * rules.ratePerMinuteAfter * 100) / 100;

  return {
    totalElapsedMinutes: totalElapsed,
    includedMinutes: rules.includedMinutes,
    overageMinutes,
    feeAmount,
  };
}

export function cancelTripByClient(trip: PersonalDriverTrip): PersonalDriverTrip {
  return {
    ...trip,
    status: 'cancelled',
    cancelledBy: 'client',
    clientCancelledLostKm: true,
  };
}
