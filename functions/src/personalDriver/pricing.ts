export type PersonalDriverPlanId = 'basic' | 'classic' | 'premium';
export type PersonalDriverWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface PersonalDriverPlan {
  pricePerKm: number;
  minimumBillableKm: number;
  minimumAmount: number;
  allowedWeekdays: PersonalDriverWeekday[];
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

const PLAN_ORDER: PersonalDriverPlanId[] = ['basic', 'classic', 'premium'];

const PLANS: Record<PersonalDriverPlanId, PersonalDriverPlan> = {
  basic: {
    pricePerKm: 1.5,
    minimumBillableKm: 200,
    minimumAmount: 300,
    allowedWeekdays: [1, 2, 3, 4, 5],
  },
  classic: {
    pricePerKm: 1.25,
    minimumBillableKm: 360,
    minimumAmount: 450,
    allowedWeekdays: [1, 2, 3, 4, 5, 6],
  },
  premium: {
    pricePerKm: 1.1,
    minimumBillableKm: 591,
    minimumAmount: 650,
    allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
  },
};

export function calculatePersonalDriverPrices(input: {
  monthlyDistanceKm: number;
  requestedWeekdays: PersonalDriverWeekday[];
}): PersonalDriverPriceComparison {
  const plans = PLAN_ORDER.reduce((result, planId) => {
    const plan = PLANS[planId];
    const distanceAmount = input.monthlyDistanceKm * plan.pricePerKm;
    const isBelowMinimumBillableDistance = input.monthlyDistanceKm < plan.minimumBillableKm;
    const totalBeforeTax = isBelowMinimumBillableDistance
      ? plan.minimumAmount
      : Math.max(distanceAmount, plan.minimumAmount);

    result[planId] = {
      planId,
      isEligible: input.requestedWeekdays.every((weekday) => plan.allowedWeekdays.includes(weekday)),
      pricePerKm: plan.pricePerKm,
      minimumAmount: plan.minimumAmount,
      minimumBillableKm: plan.minimumBillableKm,
      distanceAmount,
      totalBeforeTax,
      minimumApplied: isBelowMinimumBillableDistance || distanceAmount <= plan.minimumAmount,
      savingsComparedToBasic: 0,
    };
    return result;
  }, {} as Record<PersonalDriverPlanId, PersonalDriverPlanPrice>);

  PLAN_ORDER.forEach((planId) => {
    plans[planId].savingsComparedToBasic = plans.basic.totalBeforeTax - plans[planId].totalBeforeTax;
  });

  const eligiblePlans = PLAN_ORDER.filter((planId) => plans[planId].isEligible);
  if (eligiblePlans.length === 0) {
    throw new Error('No personal driver plan is eligible for the requested weekdays');
  }

  const recommendedPlanId = eligiblePlans.reduce((best, current) => {
    if (plans[current].totalBeforeTax < plans[best].totalBeforeTax) return current;
    if (plans[current].totalBeforeTax > plans[best].totalBeforeTax) return best;
    return PLAN_ORDER.indexOf(current) > PLAN_ORDER.indexOf(best) ? current : best;
  });

  return {
    monthlyDistanceKm: input.monthlyDistanceKm,
    plans,
    recommendedPlanId,
    recommendationReasons: [`${recommendedPlanId} offers the best price for the requested schedule.`],
  };
}
