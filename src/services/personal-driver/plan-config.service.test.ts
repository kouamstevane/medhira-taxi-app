import { PERSONAL_DRIVER_PLANS } from './plans';

const mockCollection = jest.fn();
const mockGetDocs = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));

jest.mock('@/config/firebase', () => ({
  db: {},
}));

describe('personal driver plan catalogue loader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses a Premium Firestore override and falls back to static defaults for missing plans', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'premium',
          exists: () => true,
          data: () => ({
            name: 'Premium Plus',
            minimumAmount: 800,
          }),
        },
      ],
    });

    const { getPersonalDriverPlans } = await import('./plan-config.service');
    const result = await getPersonalDriverPlans();

    expect(result.source).toBe('firestore');
    expect(result.error).toBeNull();
    expect(result.plans.premium).toMatchObject({
      ...PERSONAL_DRIVER_PLANS.premium,
      name: 'Premium Plus',
      minimumAmount: 800,
    });
    expect(result.plans.basic).toEqual(PERSONAL_DRIVER_PLANS.basic);
    expect(result.plans.classic).toEqual(PERSONAL_DRIVER_PLANS.classic);
  });

  it('keeps fallback plans and static defaults isolated from consumer mutation', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'premium',
          exists: () => true,
          data: () => ({
            name: 'Premium Plus',
            minimumAmount: 800,
          }),
        },
      ],
    });

    const { getPersonalDriverPlans } = await import('./plan-config.service');
    const firstResult = await getPersonalDriverPlans();

    firstResult.plans.basic.allowedWeekdays.push(6);
    firstResult.plans.basic.benefits.push('Mutated benefit');

    expect(PERSONAL_DRIVER_PLANS.basic.allowedWeekdays).toEqual([1, 2, 3, 4, 5]);
    expect(PERSONAL_DRIVER_PLANS.basic.benefits).toEqual([
      "Service du lundi au vendredi",
      "3 min d'attente gratuites",
      'Horaires fixes',
    ]);

    const secondResult = await getPersonalDriverPlans();
    expect(secondResult.plans.basic.allowedWeekdays).toEqual([1, 2, 3, 4, 5]);
    expect(secondResult.plans.basic.benefits).toEqual([
      "Service du lundi au vendredi",
      "3 min d'attente gratuites",
      'Horaires fixes',
    ]);
  });

  it('falls back to the corresponding static plan when Firestore data is invalid', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'basic',
          exists: () => true,
          data: () => ({
            name: '',
            pricePerKm: -1,
            minimumBillableKm: 0,
            minimumAmount: -10,
            allowedWeekdays: [0, 0, 7],
            includedRegularWaitMinutes: -3,
            includedSpecialTrips: 0.5,
            benefits: [''],
          }),
        },
      ],
    });

    const { getPersonalDriverPlans } = await import('./plan-config.service');
    const result = await getPersonalDriverPlans();

    expect(result.source).toBe('firestore');
    expect(result.error).toBeNull();
    expect(result.plans.basic).toEqual(PERSONAL_DRIVER_PLANS.basic);
  });

  it('ignores extra Firestore document IDs that are not part of the fixed catalogue', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'classic',
          exists: () => true,
          data: () => ({
            minimumAmount: 475,
          }),
        },
        {
          id: 'vip',
          exists: () => true,
          data: () => ({
            name: 'Should be ignored',
            minimumAmount: 999,
          }),
        },
      ],
    });

    const { getPersonalDriverPlans } = await import('./plan-config.service');
    const result = await getPersonalDriverPlans();

    expect(Object.keys(result.plans)).toEqual(['basic', 'classic', 'premium']);
    expect((result.plans as Record<string, unknown>).vip).toBeUndefined();
    expect(result.plans.classic.minimumAmount).toBe(475);
    expect(result.plans.basic).toEqual(PERSONAL_DRIVER_PLANS.basic);
    expect(result.plans.premium).toEqual(PERSONAL_DRIVER_PLANS.premium);
  });

  it('returns static plans, fallback source, and an error when the Firestore read fails', async () => {
    const firestoreError = new Error('permission denied');
    mockGetDocs.mockRejectedValue(firestoreError);

    const { getPersonalDriverPlans } = await import('./plan-config.service');
    const result = await getPersonalDriverPlans();

    expect(result.source).toBe('fallback');
    expect(result.error).toBe(firestoreError);
    expect(result.plans).toEqual(PERSONAL_DRIVER_PLANS);
  });
});
