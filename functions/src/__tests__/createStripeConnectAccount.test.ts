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
  accounts: { create: jest.fn() },
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
  defineSecret: () => ({ value: () => 'test-secret' }),
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
        metadata: expect.objectContaining({ accountType: 'restaurant', restaurantId: 'r1' }),
      })
    );
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeAccountId: 'acct_new',
        stripeConnectStatus: 'in_progress',
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

  it('returns update link on happy path (update mode)', async () => {
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
      expect.objectContaining({ type: 'account_update' })
    );
  });
});
