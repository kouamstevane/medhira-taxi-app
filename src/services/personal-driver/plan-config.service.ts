import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
  PersonalDriverPlanAudit,
  PersonalDriverPlan,
  PersonalDriverPlanDocument,
  PersonalDriverPlanId,
  PersonalDriverPlansResult,
  PersonalDriverWeekday,
} from '@/types/personal-driver';
import { PERSONAL_DRIVER_PLAN_IDS, PERSONAL_DRIVER_PLANS } from './plans';

const PERSONAL_DRIVER_PLANS_COLLECTION = 'personal_driver_plans';

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNonNegativeNumber(value) && value >= min && value <= max;
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isValidWeekdays(value: unknown): value is PersonalDriverWeekday[] {
  if (!Array.isArray(value)) return false;

  if (value.length < 1 || value.length > 7) return false;

  const seen = new Set<number>();
  for (const weekday of value) {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || seen.has(weekday)) {
      return false;
    }
    seen.add(weekday);
  }

  return true;
}

function isValidBenefits(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length >= 1
    && value.length <= 12
    && value.every((benefit) => isNonEmptyText(benefit) && benefit.trim().length <= 200);
}

function normalizeText(value: string): string {
  return value.trim();
}

function clonePersonalDriverPlan(plan: PersonalDriverPlan): PersonalDriverPlan {
  return {
    ...plan,
    allowedWeekdays: [...plan.allowedWeekdays],
    benefits: [...plan.benefits],
  };
}

function clonePersonalDriverPlans(plans: Record<PersonalDriverPlanId, PersonalDriverPlan>): Record<PersonalDriverPlanId, PersonalDriverPlan> {
  return PERSONAL_DRIVER_PLAN_IDS.reduce((result, planId) => {
    result[planId] = clonePersonalDriverPlan(plans[planId]);
    return result;
  }, {} as Record<PersonalDriverPlanId, PersonalDriverPlan>);
}

function readPlanAudit(raw: PersonalDriverPlanDocument | undefined): PersonalDriverPlanAudit | undefined {
  if (!raw) return undefined;

  const audit: PersonalDriverPlanAudit = {};
  if ('updatedAt' in raw) audit.updatedAt = raw.updatedAt;
  if ('updatedBy' in raw) audit.updatedBy = raw.updatedBy;

  return Object.keys(audit).length > 0 ? audit : undefined;
}

function readPlanData(planId: PersonalDriverPlanId, raw: PersonalDriverPlanDocument | undefined): PersonalDriverPlan | null {
  const fallbackPlan = PERSONAL_DRIVER_PLANS[planId];
  if (!raw) return null;

  const overrides: Partial<PersonalDriverPlan> = {};

  if ('name' in raw) {
    if (!isNonEmptyText(raw.name) || raw.name.trim().length > 80) return null;
    overrides.name = normalizeText(raw.name);
  }

  if ('badge' in raw) {
    if (raw.badge == null) return null;
    if (typeof raw.badge !== 'string' || raw.badge.trim().length > 80) return null;
    overrides.badge = normalizeText(raw.badge) || undefined;
  }

  if ('promise' in raw) {
    if (!isNonEmptyText(raw.promise) || raw.promise.trim().length > 200) return null;
    overrides.promise = normalizeText(raw.promise);
  }

  if ('pricePerKm' in raw) {
    if (!isNumberInRange(raw.pricePerKm, 0, 1000)) return null;
    overrides.pricePerKm = raw.pricePerKm;
  }

  if ('minimumBillableKm' in raw) {
    if (!isIntegerInRange(raw.minimumBillableKm, 1, 100000)) return null;
    overrides.minimumBillableKm = raw.minimumBillableKm;
  }

  if ('minimumAmount' in raw) {
    if (!isNumberInRange(raw.minimumAmount, 0, 1000000)) return null;
    overrides.minimumAmount = raw.minimumAmount;
  }

  if ('allowedWeekdays' in raw) {
    if (!isValidWeekdays(raw.allowedWeekdays)) return null;
    overrides.allowedWeekdays = [...raw.allowedWeekdays];
  }

  if ('includedRegularWaitMinutes' in raw) {
    if (!isIntegerInRange(raw.includedRegularWaitMinutes, 0, 1440)) return null;
    overrides.includedRegularWaitMinutes = raw.includedRegularWaitMinutes;
  }

  if ('includedSpecialTrips' in raw) {
    if (!isIntegerInRange(raw.includedSpecialTrips, 0, 100)) return null;
    overrides.includedSpecialTrips = raw.includedSpecialTrips;
  }

  if ('benefits' in raw) {
    if (!isValidBenefits(raw.benefits)) return null;
    overrides.benefits = raw.benefits.map(normalizeText);
  }

  return {
    ...clonePersonalDriverPlan(fallbackPlan),
    ...overrides,
  };
}

export function normalizePersonalDriverPlan(
  planId: PersonalDriverPlanId,
  raw: PersonalDriverPlanDocument | undefined,
): PersonalDriverPlan | null {
  if (!PERSONAL_DRIVER_PLAN_IDS.includes(planId)) {
    return null;
  }

  return readPlanData(planId, raw);
}

export async function getPersonalDriverPlans(): Promise<PersonalDriverPlansResult> {
  try {
    const docsById = new Map(
      await Promise.all(
        PERSONAL_DRIVER_PLAN_IDS.map(async (planId) => {
          const planDoc = await getDoc(doc(db, PERSONAL_DRIVER_PLANS_COLLECTION, planId));

          return [
            planId,
            planDoc.exists() ? planDoc.data() as PersonalDriverPlanDocument : undefined,
          ] as const;
        }),
      ),
    );

    const plans = PERSONAL_DRIVER_PLAN_IDS.reduce((result, planId) => {
      result[planId] = normalizePersonalDriverPlan(planId, docsById.get(planId)) ?? PERSONAL_DRIVER_PLANS[planId];
      return result;
    }, {} as Record<PersonalDriverPlanId, PersonalDriverPlan>);

    const audit = PERSONAL_DRIVER_PLAN_IDS.reduce((result, planId) => {
      const planAudit = readPlanAudit(docsById.get(planId));
      if (planAudit) {
        result[planId] = planAudit;
      }
      return result;
    }, {} as Partial<Record<PersonalDriverPlanId, PersonalDriverPlanAudit>>);

    return {
      plans: clonePersonalDriverPlans(plans),
      source: 'firestore',
      error: null,
      audit: Object.keys(audit).length > 0 ? audit : undefined,
    };
  } catch (error) {
    return {
      plans: clonePersonalDriverPlans(PERSONAL_DRIVER_PLANS),
      source: 'fallback',
      error: error instanceof Error ? error : new Error('Failed to load personal driver plans'),
    };
  }
}
