const mockFirestoreInstance = {
  doc: jest.fn(),
};

const mockFieldValue = { serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP') };
const firestoreFn = jest.fn(() => mockFirestoreInstance) as any;
firestoreFn.FieldValue = mockFieldValue;

jest.mock('firebase-admin', () => ({
  firestore: firestoreFn,
  apps: [],
  initializeApp: jest.fn(),
  FieldValue: mockFieldValue,
}));

const mockStripeInstance = {
  accounts: { create: jest.fn(), retrieve: jest.fn(), update: jest.fn() },
  accountLinks: { create: jest.fn() },
};

jest.mock('stripe', () => {
  return jest.fn(() => mockStripeInstance);
});

jest.mock('../utils/rateLimiter', () => ({
  enforceRateLimit: jest.fn(),
}));

jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts: any, fn: any) => fn,
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, msg: string) {
      super(msg);
      this.code = code;
      this.name = 'HttpsError';
    }
  },
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({
    value: () => name === 'STRIPE_SECRET_KEY' ? 'sk_test_test' : '',
  }),
}));

jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { enforceRateLimit } from '../utils/rateLimiter';

const mockedRateLimit = enforceRateLimit as jest.MockedFunction<typeof enforceRateLimit>;

function makeRequest(data: unknown, auth?: { uid: string }) {
  return { data, auth: auth ?? undefined } as any;
}

describe('createStripeConnectAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ACTIVE_MARKET = 'FR';
    mockedRateLimit.mockResolvedValue(undefined);
  });

  it('throws unauthenticated when no auth', async () => {
    const { handleCreateStripeConnectAccount } = await import('../stripe/createStripeConnectAccount.js');
    await expect(handleCreateStripeConnectAccount(makeRequest({ restaurantId: 'r1' }))).rejects.toThrow('Vous devez être connecté.');
  });

  it('throws invalid-argument for bad schema', async () => {
    const { handleCreateStripeConnectAccount } = await import('../stripe/createStripeConnectAccount.js');
    await expect(handleCreateStripeConnectAccount(makeRequest({}, { uid: 'u1' }))).rejects.toThrow();
  });

  it('throws not-found when restaurant missing', async () => {
    const snap = { exists: false, data: jest.fn() };
    mockFirestoreInstance.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(snap) });

    const { handleCreateStripeConnectAccount } = await import('../stripe/createStripeConnectAccount.js');
    await expect(
      handleCreateStripeConnectAccount(makeRequest({ restaurantId: 'r1' }, { uid: 'u1' }))
    ).rejects.toThrow('Restaurant introuvable.');
  });

  it('throws permission-denied on owner mismatch', async () => {
    const snap = { exists: true, data: () => ({ ownerId: 'other', status: 'approved' }) };
    mockFirestoreInstance.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(snap) });

    const { handleCreateStripeConnectAccount } = await import('../stripe/createStripeConnectAccount.js');
    await expect(
      handleCreateStripeConnectAccount(makeRequest({ restaurantId: 'r1' }, { uid: 'u1' }))
    ).rejects.toThrow('Action non autorisée.');
  });

  it('throws failed-precondition when not approved', async () => {
    const snap = { exists: true, data: () => ({ ownerId: 'u1', status: 'pending_approval' }) };
    mockFirestoreInstance.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(snap) });

    const { handleCreateStripeConnectAccount } = await import('../stripe/createStripeConnectAccount.js');
    await expect(
      handleCreateStripeConnectAccount(makeRequest({ restaurantId: 'r1' }, { uid: 'u1' }))
    ).rejects.toThrow('Le restaurant doit être approuvé.');
  });

  it('throws already-exists when account active and onboarding', async () => {
    const snap = {
      exists: true,
      data: () => ({
        ownerId: 'u1',
        status: 'approved',
        stripeAccountId: 'acct_123',
        stripeConnectStatus: 'active',
        ownerEmail: 'o@t.com',
      }),
    };
    mockFirestoreInstance.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(snap) });

    const { handleCreateStripeConnectAccount } = await import('../stripe/createStripeConnectAccount.js');
    await expect(
      handleCreateStripeConnectAccount(makeRequest({ restaurantId: 'r1', mode: 'onboarding' }, { uid: 'u1' }))
    ).rejects.toThrow('Compte Stripe déjà actif.');
  });

  it('throws failed-precondition on update without account', async () => {
    const snap = {
      exists: true,
      data: () => ({
        ownerId: 'u1',
        status: 'approved',
        ownerEmail: 'o@t.com',
      }),
    };
    mockFirestoreInstance.doc.mockReturnValue({ get: jest.fn().mockResolvedValue(snap) });

    const { handleCreateStripeConnectAccount } = await import('../stripe/createStripeConnectAccount.js');
    await expect(
      handleCreateStripeConnectAccount(makeRequest({ restaurantId: 'r1', mode: 'update' }, { uid: 'u1' }))
    ).rejects.toThrow('Aucun compte Stripe existant à réparer.');
  });

  it('returns onboarding URL on happy path (new account)', async () => {
    const snap = {
      exists: true,
      data: () => ({
        ownerId: 'u1',
        status: 'approved',
        ownerEmail: 'o@t.com',
        name: 'Chez Nous',
        description: 'Cuisine familiale',
        phone: '06 12 34 56 78',
        email: 'contact@cheznous.ca',
      }),
    };
    const updateFn = jest.fn().mockResolvedValue(undefined);
    mockFirestoreInstance.doc.mockReturnValue({
      get: jest.fn().mockResolvedValue(snap),
      update: updateFn,
    });

    mockStripeInstance.accounts.create.mockResolvedValue({ id: 'acct_new' });
    mockStripeInstance.accountLinks.create.mockResolvedValue({ url: 'https://onboarding.stripe.com' });

    const { handleCreateStripeConnectAccount } = await import('../stripe/createStripeConnectAccount.js');
    const result = await handleCreateStripeConnectAccount(
      makeRequest({ restaurantId: 'r1' }, { uid: 'u1' })
    );

    expect(result.onboardingUrl).toBe('https://onboarding.stripe.com');
    expect(result.mode).toBe('onboarding');
    expect(mockStripeInstance.accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'express',
        country: 'FR',
        metadata: expect.objectContaining({ accountType: 'restaurant', restaurantId: 'r1' }),
        business_profile: expect.objectContaining({
          name: 'Chez Nous',
          product_description: 'Cuisine familiale',
          support_email: 'contact@cheznous.ca',
        }),
      })
    );
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeAccountId: 'acct_new',
        stripeConnectStatus: 'in_progress',
      })
    );
    expect(mockStripeInstance.accountLinks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        refresh_url: 'https://medjira-service.web.app/stripe-return?role=restaurant&status=refresh',
        return_url: 'https://medjira-service.web.app/stripe-return?role=restaurant&status=success',
      })
    );
  });

  it('returns onboarding URL for existing in_progress account (no new account created)', async () => {
    const snap = {
      exists: true,
      data: () => ({
        ownerId: 'u1',
        status: 'approved',
        stripeAccountId: 'acct_existing',
        stripeConnectStatus: 'in_progress',
        ownerEmail: 'o@t.com',
      }),
    };
    mockFirestoreInstance.doc.mockReturnValue({
      get: jest.fn().mockResolvedValue(snap),
    });

    mockStripeInstance.accountLinks.create.mockResolvedValue({ url: 'https://onboard.stripe.com/existing' });

    const { handleCreateStripeConnectAccount } = await import('../stripe/createStripeConnectAccount.js');
    const result = await handleCreateStripeConnectAccount(
      makeRequest({ restaurantId: 'r1', mode: 'onboarding' }, { uid: 'u1' })
    );

    expect(result.onboardingUrl).toBe('https://onboard.stripe.com/existing');
    expect(result.mode).toBe('onboarding');
    expect(mockStripeInstance.accounts.create).not.toHaveBeenCalled();
  });

  it('updates business information before reopening an incomplete account', async () => {
    const snap = {
      exists: true,
      data: () => ({
        ownerId: 'u1',
        status: 'approved',
        stripeAccountId: 'acct_existing',
        stripeConnectStatus: 'in_progress',
        ownerEmail: 'o@t.com',
        name: 'Chez Nous',
        description: 'Cuisine familiale',
        phone: '514 555 0101',
      }),
    };
    mockFirestoreInstance.doc.mockReturnValue({
      get: jest.fn().mockResolvedValue(snap),
    });
    mockStripeInstance.accounts.retrieve.mockResolvedValue({ details_submitted: false });
    mockStripeInstance.accounts.update.mockResolvedValue({ id: 'acct_existing' });
    mockStripeInstance.accountLinks.create.mockResolvedValue({ url: 'https://onboard.stripe.com/existing' });

    const { handleCreateStripeConnectAccount } = await import('../stripe/createStripeConnectAccount.js');
    await handleCreateStripeConnectAccount(
      makeRequest({ restaurantId: 'r1', mode: 'onboarding' }, { uid: 'u1' })
    );

    expect(mockStripeInstance.accounts.update).toHaveBeenCalledWith(
      'acct_existing',
      expect.objectContaining({
        business_profile: expect.objectContaining({
          name: 'Chez Nous',
          product_description: 'Cuisine familiale',
        }),
      })
    );
  });

  it('synchronizes the business profile even when Stripe already submitted account details', async () => {
    const snap = {
      exists: true,
      data: () => ({
        ownerId: 'u1',
        status: 'approved',
        stripeAccountId: 'acct_submitted',
        stripeConnectStatus: 'restricted',
        ownerEmail: 'o@t.com',
        name: 'Chez Nous',
        description: 'Cuisine familiale',
        phone: '06 12 34 56 78',
        email: 'contact@cheznous.ca',
      }),
    };
    mockFirestoreInstance.doc.mockReturnValue({
      get: jest.fn().mockResolvedValue(snap),
    });
    mockStripeInstance.accounts.retrieve.mockResolvedValue({ details_submitted: true });
    mockStripeInstance.accounts.update.mockResolvedValue({ id: 'acct_submitted' });
    mockStripeInstance.accountLinks.create.mockResolvedValue({ url: 'https://onboard.stripe.com/submitted' });

    const { handleCreateStripeConnectAccount } = await import('../stripe/createStripeConnectAccount.js');
    await handleCreateStripeConnectAccount(
      makeRequest({ restaurantId: 'r1', mode: 'update' }, { uid: 'u1' })
    );

    expect(mockStripeInstance.accounts.update).toHaveBeenCalledWith(
      'acct_submitted',
      expect.objectContaining({
        business_profile: expect.objectContaining({
          mcc: '5812',
          url: 'https://medjira-service.firebaseapp.com',
          product_description: 'Cuisine familiale',
          support_email: 'contact@cheznous.ca',
          support_phone: '+33612345678',
        }),
      })
    );
  });

  it('returns an onboarding link for an existing account in update mode', async () => {
    const snap = {
      exists: true,
      data: () => ({
        ownerId: 'u1',
        status: 'approved',
        stripeAccountId: 'acct_123',
        stripeConnectStatus: 'restricted',
        ownerEmail: 'o@t.com',
      }),
    };
    mockFirestoreInstance.doc.mockReturnValue({
      get: jest.fn().mockResolvedValue(snap),
    });

    mockStripeInstance.accountLinks.create.mockResolvedValue({ url: 'https://update.stripe.com' });

    const { handleCreateStripeConnectAccount } = await import('../stripe/createStripeConnectAccount.js');
    const result = await handleCreateStripeConnectAccount(
      makeRequest({ restaurantId: 'r1', mode: 'update' }, { uid: 'u1' })
    );

    expect(result.onboardingUrl).toBe('https://update.stripe.com');
    expect(result.mode).toBe('update');
    expect(mockStripeInstance.accountLinks.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'account_onboarding' })
    );
  });
});
