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
