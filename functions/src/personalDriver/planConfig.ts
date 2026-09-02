import * as admin from 'firebase-admin';

export type PersonalDriverPlanId = 'basic' | 'classic' | 'premium';
export type PersonalDriverWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface PersonalDriverPlanDocument {
  name?: string;
  badge?: string | null;
  promise?: string;
  pricePerKm?: number;
  minimumBillableKm?: number;
  minimumAmount?: number;
  allowedWeekdays?: PersonalDriverWeekday[];
  includedRegularWaitMinutes?: number;
  includedSpecialTrips?: number;
  benefits?: string[];
}

export interface PersonalDriverPlanConfig {
  id: PersonalDriverPlanId;
  name: string;
  badge?: string;
  promise: string;
  pricePerKm: number;
  minimumBillableKm: number;
  minimumAmount: number;
  allowedWeekdays: PersonalDriverWeekday[];
  includedRegularWaitMinutes: number;
  includedSpecialTrips: number;
  benefits: string[];
}

export type PersonalDriverPlans = Record<PersonalDriverPlanId, PersonalDriverPlanConfig>;

const PERSONAL_DRIVER_PLANS_COLLECTION = 'personal_driver_plans';
const PERSONAL_DRIVER_PLAN_IDS: PersonalDriverPlanId[] = ['basic', 'classic', 'premium'];

export const DEFAULT_PERSONAL_DRIVER_PLANS: PersonalDriverPlans = {
  basic: {
    id: 'basic',
    name: 'Basic',
    promise: 'La simplicité au quotidien',
    pricePerKm: 1.5,
    minimumBillableKm: 200,
    minimumAmount: 300,
    allowedWeekdays: [1, 2, 3, 4, 5],
    includedRegularWaitMinutes: 3,
    includedSpecialTrips: 0,
    benefits: ['Service du lundi au vendredi', '3 min d\'attente gratuites', 'Horaires fixes'],
  },
  classic: {
    id: 'classic',
    name: 'Classic',
    badge: 'Le plus populaire',
    promise: 'Le meilleur équilibre pour vos déplacements',
    pricePerKm: 1.25,
    minimumBillableKm: 360,
    minimumAmount: 450,
    allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    includedRegularWaitMinutes: 5,
    includedSpecialTrips: 2,
    benefits: ['Service semaine & week-end', '5 min d\'attente gratuites', '2 trajets spéciaux', 'Priorité supérieure'],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    badge: 'Service prioritaire',
    promise: 'Un service privilégié, chaque jour',
    pricePerKm: 1.1,
    minimumBillableKm: 591,
    minimumAmount: 650,
    allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    includedRegularWaitMinutes: 10,
    includedSpecialTrips: 4,
    benefits: ['Service 7j/7 & jours fériés', '10 min d\'attente gratuites', '4 trajets spéciaux', 'Priorité maximale'],
  },
};

function clonePlan(plan: PersonalDriverPlanConfig): PersonalDriverPlanConfig {
  return {
    ...plan,
    allowedWeekdays: [...plan.allowedWeekdays],
    benefits: [...plan.benefits],
  };
}

function clonePlans(plans: PersonalDriverPlans): PersonalDriverPlans {
  return PERSONAL_DRIVER_PLAN_IDS.reduce((result, planId) => {
    result[planId] = clonePlan(plans[planId]);
    return result;
  }, {} as PersonalDriverPlans);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

function normalizePersonalDriverPlan(
  planId: PersonalDriverPlanId,
  raw: PersonalDriverPlanDocument | undefined,
): PersonalDriverPlanConfig | null {
  if (!raw) return null;

  const fallbackPlan = DEFAULT_PERSONAL_DRIVER_PLANS[planId];
  const overrides: Partial<PersonalDriverPlanConfig> = {};

  if ('name' in raw) {
    if (!isNonEmptyText(raw.name)) return null;
    overrides.name = normalizeText(raw.name);
  }

  if ('badge' in raw) {
    if (raw.badge == null || !isNonEmptyText(raw.badge)) return null;
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
    ...clonePlan(fallbackPlan),
    ...overrides,
    id: planId,
  };
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

export async function getConfiguredPersonalDriverPlans(
  db: FirebaseFirestore.Firestore = getDb(),
): Promise<PersonalDriverPlans> {
  try {
    const snapshot = await db.collection(PERSONAL_DRIVER_PLANS_COLLECTION).get();
    const docsById = new Map(
      snapshot.docs
        .filter((doc) => PERSONAL_DRIVER_PLAN_IDS.includes(doc.id as PersonalDriverPlanId))
        .map((doc) => [doc.id as PersonalDriverPlanId, doc.data() as PersonalDriverPlanDocument]),
    );

    const plans = PERSONAL_DRIVER_PLAN_IDS.reduce((result, planId) => {
      result[planId] = normalizePersonalDriverPlan(planId, docsById.get(planId))
        ?? clonePlan(DEFAULT_PERSONAL_DRIVER_PLANS[planId]);
      return result;
    }, {} as PersonalDriverPlans);

    return clonePlans(plans);
  } catch {
    return clonePlans(DEFAULT_PERSONAL_DRIVER_PLANS);
  }
}
