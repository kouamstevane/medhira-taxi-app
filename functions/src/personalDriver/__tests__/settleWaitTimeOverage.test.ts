const mockTripRef = { id: 'trip_1' };
const mockSubscriptionRef = { id: 'sub_1' };
const mockAdminRef = { id: 'driver_1' };
const mockPaymentIntentsCreate = jest.fn();
const mockTransaction = { get: jest.fn(), update: jest.fn() };
const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'personal_driver_trips') return { doc: jest.fn(() => mockTripRef) };
    if (name === 'personal_driver_subscriptions') return { doc: jest.fn(() => mockSubscriptionRef) };
    if (name === 'admins') return { doc: jest.fn(() => mockAdminRef) };
    return { doc: jest.fn(() => ({ id: 'unexpected' })) };
  }),
  runTransaction: jest.fn((callback: (tx: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction)),
};
const mockIsSubscriptionEntitled = jest.fn((subscription: Record<string, unknown>) => (
  subscription.status === 'active' && subscription.paymentStatus === 'succeeded'
));

jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(() => mockDb), {
    FieldValue: { serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP') },
  }),
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: jest.fn(() => ({ value: jest.fn(() => 'sk_test_123') })),
  defineInt: jest.fn(() => ({ value: jest.fn(() => 240) })),
}));

jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentUpdated: (_options: unknown, handler: unknown) => handler,
}));

jest.mock('../../stripe/stripe-client.js', () => ({
  createStripeClient: jest.fn(() => ({ paymentIntents: { create: mockPaymentIntentsCreate } })),
}));

jest.mock('../entitlement', () => ({
  isSubscriptionEntitled: mockIsSubscriptionEntitled,
  markExpiredSubscriptionInTransaction: jest.fn(() => false),
}));

describe('settleWaitTimeOverage', () => {
  let tripData: Record<string, unknown>;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(Date.parse('2026-08-04T12:00:00.000Z'));
    jest.clearAllMocks();
    tripData = {
      subscriptionId: 'sub_1', assignedDriverId: 'driver_1', status: 'passenger_picked_up', isSpecialTrip: false,
      waitStartedAt: new Date('2026-08-04T11:51:00.000Z'),
      waitEndedAt: new Date('2026-08-04T12:00:00.000Z'),
    };
    const subscriptionData = {
      status: 'active', paymentStatus: 'succeeded', selectedPlanId: 'classic',
      stripeCustomerId: 'cus_1', defaultPaymentMethodId: 'pm_1',
    };
    mockTransaction.get.mockImplementation(async (ref: unknown) => (
      ref === mockTripRef
        ? { exists: true, data: () => tripData }
        : ref === mockAdminRef
          ? { exists: false, data: () => undefined }
          : { exists: true, data: () => subscriptionData }
    ));
    mockTransaction.update.mockImplementation((_ref: unknown, update: Record<string, unknown>) => Object.assign(tripData, update));
    mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_overage_1', status: 'succeeded' });
  });

  afterEach(() => jest.useRealTimers());

  it('uses one idempotency key and does not bill a duplicate transition', async () => {
    const { settleWaitTimeOverage } = require('../settleWaitTimeOverage');

    await expect(settleWaitTimeOverage({ tripId: 'trip_1', actor: 'transition' })).resolves.toMatchObject({
      success: true, overageMinutes: 4, paymentIntentId: 'pi_overage_1',
    });
    await expect(settleWaitTimeOverage({ tripId: 'trip_1', actor: 'transition' })).resolves.toMatchObject({
      success: true, paymentIntentId: 'pi_overage_1',
    });

    expect(mockPaymentIntentsCreate).toHaveBeenCalledTimes(1);
    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(expect.any(Object), {
      idempotencyKey: 'personal_driver_wait_overage_trip_1',
    });
  });

  it('marks a Stripe failure and permits an authorized server retry with the same key', async () => {
    const { settleWaitTimeOverage } = require('../settleWaitTimeOverage');
    mockPaymentIntentsCreate.mockRejectedValueOnce(new Error('card_declined'));

    await expect(settleWaitTimeOverage({ tripId: 'trip_1', actor: 'transition' }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(tripData.overageChargeStatus).toBe('failed');

    await expect(settleWaitTimeOverage({ tripId: 'trip_1', actor: 'manual', actorUid: 'driver_1' })).resolves.toMatchObject({
      paymentIntentId: 'pi_overage_1',
    });
    expect(mockPaymentIntentsCreate).toHaveBeenCalledTimes(2);
    expect(mockPaymentIntentsCreate.mock.calls.map((call) => call[1])).toEqual([
      { idempotencyKey: 'personal_driver_wait_overage_trip_1' },
      { idempotencyKey: 'personal_driver_wait_overage_trip_1' },
    ]);
  });

  it('settles only the transition into passenger_picked_up', async () => {
    const { settlePersonalDriverWaitOverageOnPickup } = require('../settleWaitTimeOverage');
    const event = {
      params: { tripId: 'trip_1' },
      data: {
        before: { data: () => ({ status: 'driver_arrived' }) },
        after: { data: () => ({ status: 'passenger_picked_up' }) },
      },
    };

    await settlePersonalDriverWaitOverageOnPickup(event);
    await settlePersonalDriverWaitOverageOnPickup({
      ...event,
      data: {
        before: { data: () => ({ status: 'passenger_picked_up' }) },
        after: { data: () => ({ status: 'passenger_picked_up' }) },
      },
    });

    expect(mockPaymentIntentsCreate).toHaveBeenCalledTimes(1);
  });
});
