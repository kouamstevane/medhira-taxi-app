import {
  DEFAULT_PERSONAL_DRIVER_PLANS,
  type PersonalDriverPlanConfig,
  type PersonalDriverPlanId,
  type PersonalDriverPlans,
  type PersonalDriverWeekday,
} from './planConfig.js';

export type {
  PersonalDriverPlanConfig,
  PersonalDriverPlanId,
  PersonalDriverPlans,
  PersonalDriverWeekday,
} from './planConfig.js';

export interface PersonalDriverPlanPrice {
  planId: PersonalDriverPlanId;
  isEligible: boolean;
  pricePerKm: number;
  minimumAmount: number;
  minimumBillableKm: number;
  includedSpecialTrips: number;
  distanceAmount: number;
  totalBeforeTax: number;
  minimumApplied: boolean;
  savingsComparedToBasic: number;
}

export interface PersonalDriverPriceComparison {
  monthlyDistanceKm: number;
  plans: Record<PersonalDriverPlanId, PersonalDriverPlanPrice>;
  recommendedPlanId: PersonalDriverPlanId;
}

const PLAN_ORDER: PersonalDriverPlanId[] = ['basic', 'classic', 'premium'];

export const SPECIAL_TRIP_LIMITS: Record<PersonalDriverPlanId, number> = PLAN_ORDER.reduce((result, planId) => {
  result[planId] = DEFAULT_PERSONAL_DRIVER_PLANS[planId].includedSpecialTrips;
  return result;
}, {} as Record<PersonalDriverPlanId, number>);

export function calculatePersonalDriverPrices(input: {
  monthlyDistanceKm: number;
  requestedWeekdays: PersonalDriverWeekday[];
}, configuredPlans: PersonalDriverPlans = DEFAULT_PERSONAL_DRIVER_PLANS): PersonalDriverPriceComparison {
  const { monthlyDistanceKm } = input;
  const planPrices = PLAN_ORDER.reduce((result, planId) => {
    const plan: PersonalDriverPlanConfig = configuredPlans[planId];
    const {
      minimumAmount,
      pricePerKm,
    } = plan;
    const distanceAmount = monthlyDistanceKm * pricePerKm;
    const totalBeforeTax = Math.max(minimumAmount, monthlyDistanceKm * pricePerKm);

    result[planId] = {
      planId,
      isEligible: input.requestedWeekdays.every((weekday) => plan.allowedWeekdays.includes(weekday)),
      pricePerKm,
      minimumAmount,
      minimumBillableKm: plan.minimumBillableKm,
      includedSpecialTrips: plan.includedSpecialTrips,
      distanceAmount,
      totalBeforeTax,
      minimumApplied: distanceAmount <= minimumAmount,
      savingsComparedToBasic: 0,
    };
    return result;
  }, {} as Record<PersonalDriverPlanId, PersonalDriverPlanPrice>);

  PLAN_ORDER.forEach((planId) => {
    planPrices[planId].savingsComparedToBasic = planPrices.basic.totalBeforeTax - planPrices[planId].totalBeforeTax;
  });

  const eligiblePlans = PLAN_ORDER.filter((planId) => planPrices[planId].isEligible);
  if (eligiblePlans.length === 0) {
    throw new Error('No personal driver plan is eligible for the requested weekdays');
  }

  const recommendedPlanId = eligiblePlans.reduce((best, current) => {
    if (planPrices[current].totalBeforeTax < planPrices[best].totalBeforeTax) return current;
    if (planPrices[current].totalBeforeTax > planPrices[best].totalBeforeTax) return best;
    return PLAN_ORDER.indexOf(current) > PLAN_ORDER.indexOf(best) ? current : best;
  });

  return {
    monthlyDistanceKm,
    plans: planPrices,
    recommendedPlanId,
  };
}
