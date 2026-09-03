import type {
  PersonalDriverPlanId,
  PersonalDriverPlan,
  PersonalDriverPlanPrice,
  PersonalDriverPriceComparison,
  PersonalDriverPriceInput,
} from '@/types/personal-driver';
import { CURRENCY_CODE, CURRENCY_MAP, DEFAULT_LOCALE } from '@/utils/constants';
import { PERSONAL_DRIVER_PLANS } from './plans';

const PLAN_ORDER: PersonalDriverPlanId[] = ['basic', 'classic', 'premium'];
type PersonalDriverPlanMap = Record<PersonalDriverPlanId, PersonalDriverPlan>;

export function formatPersonalDriverCurrency(
  amount: number,
  currency = CURRENCY_CODE,
): string {
  const isoCurrency = CURRENCY_MAP[currency.toUpperCase()] || currency.toUpperCase();
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'currency',
    currency: isoCurrency,
  }).format(amount);
}

function isPlanEligible(
  planId: PersonalDriverPlanId,
  requestedWeekdays: PersonalDriverPriceInput['requestedWeekdays'],
  plans: PersonalDriverPlanMap,
): boolean {
  const allowedWeekdays = plans[planId].allowedWeekdays;
  return requestedWeekdays.every((weekday) => allowedWeekdays.includes(weekday));
}

function calculatePlanPrice(
  planId: PersonalDriverPlanId,
  input: PersonalDriverPriceInput,
  plans: PersonalDriverPlanMap,
): PersonalDriverPlanPrice {
  const plan = plans[planId];
  const distanceAmount = input.monthlyDistanceKm * plan.pricePerKm;
  const totalBeforeTax = Math.max(distanceAmount, plan.minimumAmount);
  const minimumApplied = distanceAmount < plan.minimumAmount;

  return {
    planId,
    isEligible: isPlanEligible(planId, input.requestedWeekdays, plans),
    pricePerKm: plan.pricePerKm,
    minimumAmount: plan.minimumAmount,
    minimumBillableKm: plan.minimumBillableKm,
    distanceAmount,
    totalBeforeTax,
    minimumApplied,
    savingsComparedToBasic: 0,
  };
}

export function calculatePersonalDriverPrices(
  input: PersonalDriverPriceInput,
  plansCatalogue: PersonalDriverPlanMap = PERSONAL_DRIVER_PLANS,
): PersonalDriverPriceComparison {
  const plans = PLAN_ORDER.reduce((result, planId) => {
    result[planId] = calculatePlanPrice(planId, input, plansCatalogue);
    return result;
  }, {} as Record<PersonalDriverPlanId, PersonalDriverPlanPrice>);

  PLAN_ORDER.forEach((planId) => {
    plans[planId].savingsComparedToBasic = plans.basic.totalBeforeTax - plans[planId].totalBeforeTax;
  });

  const eligiblePlans = PLAN_ORDER.filter((planId) => plans[planId].isEligible).map((planId) => plans[planId]);
  if (eligiblePlans.length === 0) {
    throw new Error('No personal driver plan is eligible for the requested weekdays');
  }

  const recommendedPlan = eligiblePlans.reduce((best, current) => {
    if (current.totalBeforeTax < best.totalBeforeTax) return current;
    if (current.totalBeforeTax > best.totalBeforeTax) return best;
    return PLAN_ORDER.indexOf(current.planId) > PLAN_ORDER.indexOf(best.planId) ? current : best;
  });

  return {
    monthlyDistanceKm: input.monthlyDistanceKm,
    plans,
    recommendedPlanId: recommendedPlan.planId,
    recommendationReasons: [`${plansCatalogue[recommendedPlan.planId].name} offre le meilleur tarif pour votre besoin.`],
  };
}

export function getRecommendedPersonalDriverPlan(
  comparison: PersonalDriverPriceComparison,
): PersonalDriverPlanPrice {
  return comparison.plans[comparison.recommendedPlanId];
}
