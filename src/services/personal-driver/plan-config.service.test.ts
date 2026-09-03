import { PERSONAL_DRIVER_PLANS } from './plans';

const mockDoc = jest.fn((...path: unknown[]) => ({ path }));
const mockGetDoc = jest.fn();
type LoaderAudit = {
  updatedAt?: string | Date | { toDate: () => Date };
  updatedBy?: string;
};

jest.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));

jest.mock('@/config/firebase', () => ({
  db: { app: 'mock-db' },
}));

function mockPlanSnapshot(id: string, data: Record<string, unknown>) {
  return {
    id,
    exists: () => true,
    data: () => data,
  };
}

function mockMissingSnapshot(id: string) {
  return {
    id,
    exists: () => false,
    data: () => undefined,
  };
}

function expectFixedPlanDocumentReads() {
  expect(mockDoc).toHaveBeenCalledTimes(3);
  expect(mockDoc).toHaveBeenNthCalledWith(1, { app: 'mock-db' }, 'personal_driver_plans', 'basic');
  expect(mockDoc).toHaveBeenNthCalledWith(2, { app: 'mock-db' }, 'personal_driver_plans', 'classic');
  expect(mockDoc).toHaveBeenNthCalledWith(3, { app: 'mock-db' }, 'personal_driver_plans', 'premium');

  expect(mockGetDoc).toHaveBeenCalledTimes(3);
  expect(mockGetDoc).toHaveBeenNthCalledWith(1, { path: [{ app: 'mock-db' }, 'personal_driver_plans', 'basic'] });
  expect(mockGetDoc).toHaveBeenNthCalledWith(2, { path: [{ app: 'mock-db' }, 'personal_driver_plans', 'classic'] });
  expect(mockGetDoc).toHaveBeenNthCalledWith(3, { path: [{ app: 'mock-db' }, 'personal_driver_plans', 'premium'] });
}

describe('personal driver plan catalogue loader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads the fixed plan documents directly and falls back to static defaults for missing plans', async () => {
    mockGetDoc
      .mockResolvedValueOnce(mockMissingSnapshot('basic'))
      .mockResolvedValueOnce(mockMissingSnapshot('classic'))
      .mockResolvedValueOnce(mockPlanSnapshot('premium', {
        name: 'Premium Plus',
        minimumAmount: 800,
      }));

    const { getPersonalDriverPlans } = await import('./plan-config.service');
    const result = await getPersonalDriverPlans();

    expectFixedPlanDocumentReads();
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
    mockGetDoc
      .mockResolvedValueOnce(mockMissingSnapshot('basic'))
      .mockResolvedValueOnce(mockMissingSnapshot('classic'))
      .mockResolvedValueOnce(mockPlanSnapshot('premium', {
        name: 'Premium Plus',
        minimumAmount: 800,
      }))
      .mockResolvedValueOnce(mockMissingSnapshot('basic'))
      .mockResolvedValueOnce(mockMissingSnapshot('classic'))
      .mockResolvedValueOnce(mockPlanSnapshot('premium', {
        name: 'Premium Plus',
        minimumAmount: 800,
      }));

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
    mockGetDoc
      .mockResolvedValueOnce(mockPlanSnapshot('basic', {
        name: '',
        pricePerKm: -1,
        minimumBillableKm: 0,
        minimumAmount: -10,
        allowedWeekdays: [0, 0, 7],
        includedRegularWaitMinutes: -3,
        includedSpecialTrips: 0.5,
        benefits: [''],
      }))
      .mockResolvedValueOnce(mockMissingSnapshot('classic'))
      .mockResolvedValueOnce(mockMissingSnapshot('premium'));

    const { getPersonalDriverPlans } = await import('./plan-config.service');
    const result = await getPersonalDriverPlans();

    expectFixedPlanDocumentReads();
    expect(result.source).toBe('firestore');
    expect(result.error).toBeNull();
    expect(result.plans.basic).toEqual(PERSONAL_DRIVER_PLANS.basic);
  });

  it.each([
    ['name', { name: 'x'.repeat(81) }],
    ['badge', { badge: 'x'.repeat(81) }],
    ['promise', { promise: 'x'.repeat(201) }],
    ['pricePerKm', { pricePerKm: 1000.01 }],
    ['minimumBillableKm', { minimumBillableKm: 100001 }],
    ['minimumAmount', { minimumAmount: 1000000.01 }],
    ['includedRegularWaitMinutes', { includedRegularWaitMinutes: 1441 }],
    ['includedSpecialTrips', { includedSpecialTrips: 101 }],
    ['benefits', { benefits: ['x'.repeat(201)] }],
  ])('falls back completely when %s exceeds the server bound', async (_field, invalidField) => {
    mockGetDoc
      .mockResolvedValueOnce(mockPlanSnapshot('basic', invalidField))
      .mockResolvedValueOnce(mockMissingSnapshot('classic'))
      .mockResolvedValueOnce(mockMissingSnapshot('premium'));

    const { getPersonalDriverPlans } = await import('./plan-config.service');
    const result = await getPersonalDriverPlans();

    expect(result.plans.basic).toEqual(PERSONAL_DRIVER_PLANS.basic);
  });

  it('allows an empty badge while trimming valid bounded values', async () => {
    mockGetDoc
      .mockResolvedValueOnce(mockPlanSnapshot('basic', {
        name: '  Basic historique  ',
        badge: '   ',
        promise: '  Promesse  ',
        allowedWeekdays: [1, 2],
        benefits: ['  Avantage  '],
      }))
      .mockResolvedValueOnce(mockMissingSnapshot('classic'))
      .mockResolvedValueOnce(mockMissingSnapshot('premium'));

    const { getPersonalDriverPlans } = await import('./plan-config.service');
    const result = await getPersonalDriverPlans();

    expect(result.plans.basic).toMatchObject({
      name: 'Basic historique',
      badge: undefined,
      promise: 'Promesse',
      allowedWeekdays: [1, 2],
      benefits: ['Avantage'],
    });
  });

  it('loads only the fixed catalogue IDs', async () => {
    mockGetDoc
      .mockResolvedValueOnce(mockMissingSnapshot('basic'))
      .mockResolvedValueOnce(mockPlanSnapshot('classic', {
        minimumAmount: 475,
      }))
      .mockResolvedValueOnce(mockMissingSnapshot('premium'));

    const { getPersonalDriverPlans } = await import('./plan-config.service');
    const result = await getPersonalDriverPlans();

    expectFixedPlanDocumentReads();
    expect(Object.keys(result.plans)).toEqual(['basic', 'classic', 'premium']);
    expect((result.plans as Record<string, unknown>).vip).toBeUndefined();
    expect(result.plans.classic.minimumAmount).toBe(475);
    expect(result.plans.basic).toEqual(PERSONAL_DRIVER_PLANS.basic);
    expect(result.plans.premium).toEqual(PERSONAL_DRIVER_PLANS.premium);
  });

  it('preserves Firestore audit metadata on the returned catalogue result', async () => {
    mockGetDoc
      .mockResolvedValueOnce(mockMissingSnapshot('basic'))
      .mockResolvedValueOnce(mockMissingSnapshot('classic'))
      .mockResolvedValueOnce(mockPlanSnapshot('premium', {
        name: 'Premium Plus',
        minimumAmount: 800,
        updatedAt: '2026-08-31T10:20:00.000Z',
        updatedBy: 'admin_1',
      }));

    const { getPersonalDriverPlans } = await import('./plan-config.service');
    const result = await getPersonalDriverPlans() as Awaited<ReturnType<typeof getPersonalDriverPlans>> & { audit?: Partial<Record<string, LoaderAudit>> };

    expectFixedPlanDocumentReads();
    expect(result.source).toBe('firestore');
    expect(result.error).toBeNull();
    expect(result.audit?.premium).toEqual({
      updatedAt: '2026-08-31T10:20:00.000Z',
      updatedBy: 'admin_1',
    });
    expect(result.plans.premium).toMatchObject({
      ...PERSONAL_DRIVER_PLANS.premium,
      name: 'Premium Plus',
      minimumAmount: 800,
    });
  });

  it('returns static plans, fallback source, and an error when the Firestore read fails', async () => {
    const firestoreError = new Error('permission denied');
    mockGetDoc.mockRejectedValueOnce(firestoreError);

    const { getPersonalDriverPlans } = await import('./plan-config.service');
    const result = await getPersonalDriverPlans();

    expect(mockDoc).toHaveBeenCalledTimes(3);
    expect(mockGetDoc).toHaveBeenCalledTimes(3);
    expect(result.source).toBe('fallback');
    expect(result.error).toBe(firestoreError);
    expect(result.plans).toEqual(PERSONAL_DRIVER_PLANS);
  });
});
