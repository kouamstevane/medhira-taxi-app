'use client';

import { createContext, useContext } from 'react';
import type { PersonalDriverPlan, PersonalDriverPlanId } from '@/types/personal-driver';
import { PERSONAL_DRIVER_PLAN_IDS, PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';

export type PersonalDriverPlanMap = Record<PersonalDriverPlanId, PersonalDriverPlan>;

export interface PersonalDriverPlansContextValue {
  plans: PersonalDriverPlanMap;
  isLoading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

export function clonePersonalDriverPlanMap(plans: PersonalDriverPlanMap = PERSONAL_DRIVER_PLANS): PersonalDriverPlanMap {
  return PERSONAL_DRIVER_PLAN_IDS.reduce((result, planId) => {
    const plan = plans[planId];
    result[planId] = {
      ...plan,
      allowedWeekdays: [...plan.allowedWeekdays],
      benefits: [...plan.benefits],
    };
    return result;
  }, {} as PersonalDriverPlanMap);
}

const defaultPersonalDriverPlansContext: PersonalDriverPlansContextValue = {
  plans: clonePersonalDriverPlanMap(),
  isLoading: false,
  error: null,
  reload: async () => undefined,
};

export const PersonalDriverPlansContext = createContext<PersonalDriverPlansContextValue>(defaultPersonalDriverPlansContext);

export function usePersonalDriverPlans(): PersonalDriverPlansContextValue {
  return useContext(PersonalDriverPlansContext);
}
