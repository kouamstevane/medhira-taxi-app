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
