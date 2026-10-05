import type { PersonalDriverPlan, PersonalDriverPlanId } from '@/types/personal-driver';
import type { TranslationKey, TranslationParams } from '@/locales';
import { PERSONAL_DRIVER_PLANS } from './plans';

type Translator = (key: TranslationKey, params?: TranslationParams) => string;

type LocalizablePlan = Pick<PersonalDriverPlan, 'promise' | 'benefits' | 'badge'>;

const BADGE_KEYS: Partial<Record<PersonalDriverPlanId, TranslationKey>> = {
  basic: 'personalDriver.standardFormula',
  classic: 'personalDriver.mostPopular',
  premium: 'personalDriver.priorityService',
};

const PROMISE_KEYS: Record<PersonalDriverPlanId, TranslationKey> = {
  basic: 'personalDriver.planBasicPromise',
  classic: 'personalDriver.planClassicPromise',
  premium: 'personalDriver.planPremiumPromise',
};

const BENEFIT_KEYS: Record<PersonalDriverPlanId, TranslationKey[]> = {
  basic: [
    'personalDriver.benefitMonFri',
    'personalDriver.benefitWait3',
    'personalDriver.benefitFixedHours',
  ],
  classic: [
    'personalDriver.benefitWeekAndWeekend',
    'personalDriver.benefitWait5',
    'personalDriver.benefitSpecialTrips2',
    'personalDriver.benefitHigherPriority',
  ],
  premium: [
    'personalDriver.benefit7On7',
    'personalDriver.benefitWait10',
    'personalDriver.benefitSpecialTrips4',
    'personalDriver.benefitMaxPriority',
  ],
};

export function getLocalizedPlanContent(
  planId: PersonalDriverPlanId,
  plan: Partial<LocalizablePlan>,
  t: Translator,
): { badge: string | undefined; promise: string; benefits: string[] } {
  const defaultPlan = PERSONAL_DRIVER_PLANS[planId];

  const isDefaultPromise = !plan.promise || plan.promise === defaultPlan?.promise;
  const promise = isDefaultPromise ? t(PROMISE_KEYS[planId]) : plan.promise!;

  const isDefaultBenefits = !plan.benefits || JSON.stringify(plan.benefits) === JSON.stringify(defaultPlan?.benefits);
  const benefits = isDefaultBenefits ? BENEFIT_KEYS[planId].map((key) => t(key)) : plan.benefits!;

  const isDefaultBadge = !plan.badge || plan.badge === defaultPlan?.badge;
  const badgeKey = BADGE_KEYS[planId];
  const badge = isDefaultBadge ? (badgeKey ? t(badgeKey) : undefined) : plan.badge;

  return { badge, promise, benefits };
}
