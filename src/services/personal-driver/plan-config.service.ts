import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type {
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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isValidWeekdays(value: unknown): value is PersonalDriverWeekday[] {
  if (!Array.isArray(value)) return false;

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
    && value.every(isNonEmptyText);
}

function normalizeText(value: string): string {
  return value.trim();
}

function readPlanData(planId: PersonalDriverPlanId, raw: PersonalDriverPlanDocument | undefined): PersonalDriverPlan | null {
  const fallbackPlan = PERSONAL_DRIVER_PLANS[planId];
  if (!raw) return null;

  const overrides: Partial<PersonalDriverPlan> = {};

  if ('name' in raw) {
    if (!isNonEmptyText(raw.name)) return null;
    overrides.name = normalizeText(raw.name);
  }

  if ('badge' in raw) {
    if (raw.badge == null) {
      return null;
    }
    if (!isNonEmptyText(raw.badge)) return null;
    overrides.badge = normalizeText(raw.badge);
  }

  if ('promise' in raw) {
    if (!isNonEmptyText(raw.promise)) return null;
    overrides.promise = normalizeText(raw.promise);
  }

  if ('pricePerKm' in raw) {
    if (!isFiniteNonNegativeNumber(raw.pricePerKm)) return null;
    overrides.pricePerKm = raw.pricePerKm;
  }

  if ('minimumBillableKm' in raw) {
    if (!isPositiveInteger(raw.minimumBillableKm)) return null;
    overrides.minimumBillableKm = raw.minimumBillableKm;
  }

  if ('minimumAmount' in raw) {
    if (!isFiniteNonNegativeNumber(raw.minimumAmount)) return null;
    overrides.minimumAmount = raw.minimumAmount;
  }

  if ('allowedWeekdays' in raw) {
    if (!isValidWeekdays(raw.allowedWeekdays)) return null;
    overrides.allowedWeekdays = [...raw.allowedWeekdays];
  }

  if ('includedRegularWaitMinutes' in raw) {
    if (!isFiniteNonNegativeNumber(raw.includedRegularWaitMinutes)) return null;
    overrides.includedRegularWaitMinutes = raw.includedRegularWaitMinutes;
  }

  if ('includedSpecialTrips' in raw) {
    if (!isFiniteNonNegativeNumber(raw.includedSpecialTrips)) return null;
    overrides.includedSpecialTrips = raw.includedSpecialTrips;
  }

  if ('benefits' in raw) {
    if (!isValidBenefits(raw.benefits)) return null;
    overrides.benefits = raw.benefits.map(normalizeText);
  }

  return {
    ...fallbackPlan,
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
    const snapshot = await getDocs(collection(db, PERSONAL_DRIVER_PLANS_COLLECTION));
    const docsById = new Map(
      snapshot.docs
        .filter((planDoc) => PERSONAL_DRIVER_PLAN_IDS.includes(planDoc.id as PersonalDriverPlanId))
        .map((planDoc) => [
          planDoc.id as PersonalDriverPlanId,
          planDoc.data() as PersonalDriverPlanDocument,
        ]),
    );

    const plans = PERSONAL_DRIVER_PLAN_IDS.reduce((result, planId) => {
      result[planId] = normalizePersonalDriverPlan(planId, docsById.get(planId)) ?? PERSONAL_DRIVER_PLANS[planId];
      return result;
    }, {} as Record<PersonalDriverPlanId, PersonalDriverPlan>);

    return {
      plans,
      source: 'firestore',
      error: null,
    };
  } catch (error) {
    return {
      plans: PERSONAL_DRIVER_PLANS,
      source: 'fallback',
      error: error instanceof Error ? error : new Error('Failed to load personal driver plans'),
    };
  }
}
