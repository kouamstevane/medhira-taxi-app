export {};

const mockTripRef = { get: jest.fn(), update: jest.fn() };
const mockSubscriptionRef = { get: jest.fn() };
const mockAdminRef = { get: jest.fn() };
const mockPaymentIntentsCreate = jest.fn();

const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'personal_driver_trips') return { doc: jest.fn(() => mockTripRef) };
    if (name === 'personal_driver_subscriptions') return { doc: jest.fn(() => mockSubscriptionRef) };
    if (name === 'admins') return { doc: jest.fn(() => mockAdminRef) };
    throw new Error(`Unexpected collection ${name}`);
  }),
};

jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  firestore: jest.fn(() => mockDb),
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: jest.fn(() => ({ value: jest.fn(() => 'sk_test_123') })),
}));

jest.mock('../../stripe/stripe-client.js', () => ({
  createStripeClient: jest.fn(() => ({
    paymentIntents: {
      create: mockPaymentIntentsCreate,
    },
  })),
}));

jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_options: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

function makeRequest(data: unknown, uid?: string) {
  return { data, auth: uid ? { uid } : undefined } as never;
}

describe('chargePersonalDriverWaitTimeOverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTripRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        subscriptionId: 'sub_1',
        userId: 'client_1',
        assignedDriverId: 'driver_1',
        planId: 'classic',
        isSpecialTrip: false,
        overageWaitBilled: false,
      }),
    });
    mockSubscriptionRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'client_1',
        stripeCustomerId: 'cus_1',
        defaultPaymentMethodId: 'pm_1',
      }),
    });
    mockAdminRef.get.mockResolvedValue({ exists: false });
    mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_overage_1' });
  });

  it('rejects callers who are not the assigned driver, owner, or admin', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');

    await expect(
      chargePersonalDriverWaitTimeOverage(makeRequest({ tripId: 'trip_1', elapsedMinutes: 9 }, 'other_user')),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects billing when no reusable payment method is stored', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');
    mockSubscriptionRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ userId: 'client_1' }),
    });

    await expect(
      chargePersonalDriverWaitTimeOverage(makeRequest({ tripId: 'trip_1', elapsedMinutes: 9 }, 'driver_1')),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTripRef.update).not.toHaveBeenCalled();
  });

  it('rejects billing the same overage twice', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');
    mockTripRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        subscriptionId: 'sub_1',
        userId: 'client_1',
        assignedDriverId: 'driver_1',
        planId: 'classic',
        overageWaitBilled: true,
      }),
    });

    await expect(
      chargePersonalDriverWaitTimeOverage(makeRequest({ tripId: 'trip_1', elapsedMinutes: 9 }, 'driver_1')),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('charges and records overage for the assigned driver', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');

    const result = await chargePersonalDriverWaitTimeOverage(
      makeRequest({ tripId: 'trip_1', elapsedMinutes: 9 }, 'driver_1'),
    );

    expect(result).toEqual({
      success: true,
      feeBilled: 2,
      overageMinutes: 4,
      paymentIntentId: 'pi_overage_1',
    });
    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({
      amount: 200,
      customer: 'cus_1',
      payment_method: 'pm_1',
      confirm: true,
    }));
    expect(mockTripRef.update).toHaveBeenCalledWith(expect.objectContaining({
      overageWaitBilled: true,
      overagePaymentIntentId: 'pi_overage_1',
    }));
  });
});
