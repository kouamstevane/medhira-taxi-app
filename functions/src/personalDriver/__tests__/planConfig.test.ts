const mockGet = jest.fn();
const mockCollection = jest.fn(() => ({
  get: mockGet,
}));

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: jest.fn(() => ({
    collection: mockCollection,
  })),
}));

describe('personal driver backend plan config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('uses a Premium Firestore override and falls back to backend defaults for missing plans', async () => {
    mockGet.mockResolvedValue({
      docs: [
        {
          id: 'premium',
          data: () => ({
            minimumAmount: 800,
          }),
        },
      ],
    });

    const { getConfiguredPersonalDriverPlans, DEFAULT_PERSONAL_DRIVER_PLANS } = require('../planConfig');
    const plans = await getConfiguredPersonalDriverPlans();

    expect(plans.premium).toMatchObject({
      ...DEFAULT_PERSONAL_DRIVER_PLANS.premium,
      minimumAmount: 800,
    });
    expect(plans.basic).toEqual(DEFAULT_PERSONAL_DRIVER_PLANS.basic);
    expect(plans.classic).toEqual(DEFAULT_PERSONAL_DRIVER_PLANS.classic);
    expect(plans.premium.includedSpecialTrips).toBe(DEFAULT_PERSONAL_DRIVER_PLANS.premium.includedSpecialTrips);
  });

  it('falls back to defaults when a Firestore plan document is invalid', async () => {
    mockGet.mockResolvedValue({
      docs: [
        {
          id: 'premium',
          data: () => ({
            minimumAmount: 800,
            pricePerKm: -1,
          }),
        },
      ],
    });

    const { getConfiguredPersonalDriverPlans, DEFAULT_PERSONAL_DRIVER_PLANS } = require('../planConfig');
    const plans = await getConfiguredPersonalDriverPlans();

    expect(plans.premium).toEqual(DEFAULT_PERSONAL_DRIVER_PLANS.premium);
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
    mockGet.mockResolvedValue({ docs: [{ id: 'basic', data: () => invalidField }] });

    const { getConfiguredPersonalDriverPlans, DEFAULT_PERSONAL_DRIVER_PLANS } = require('../planConfig');
    const plans = await getConfiguredPersonalDriverPlans();

    expect(plans.basic).toEqual(DEFAULT_PERSONAL_DRIVER_PLANS.basic);
  });

  it('allows an empty badge while trimming valid bounded values', async () => {
    mockGet.mockResolvedValue({
      docs: [{ id: 'basic', data: () => ({
        name: '  Basic historique  ',
        badge: '   ',
        promise: '  Promesse  ',
        allowedWeekdays: [1, 2],
        benefits: ['  Avantage  '],
      }) }],
    });

    const { getConfiguredPersonalDriverPlans } = require('../planConfig');
    const plans = await getConfiguredPersonalDriverPlans();

    expect(plans.basic).toMatchObject({
      name: 'Basic historique',
      badge: undefined,
      promise: 'Promesse',
      allowedWeekdays: [1, 2],
      benefits: ['Avantage'],
    });
  });

  it('includes the complete client-facing plan fields in backend defaults', async () => {
    const { DEFAULT_PERSONAL_DRIVER_PLANS } = require('../planConfig');

    expect(DEFAULT_PERSONAL_DRIVER_PLANS.premium).toMatchObject({
      id: 'premium',
      name: 'Premium',
      badge: 'Service prioritaire',
      promise: 'Un service privilégié, chaque jour',
      includedRegularWaitMinutes: 10,
      benefits: [
        'Service 7j/7 & jours fériés',
        '10 min d\'attente gratuites',
        '4 trajets spéciaux',
        'Priorité maximale',
      ],
    });
  });
});
