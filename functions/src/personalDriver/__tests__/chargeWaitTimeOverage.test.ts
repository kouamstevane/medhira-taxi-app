export {};

const mockTripRef = { id: 'trip_1', get: jest.fn() };
const mockSubscriptionRef = { id: 'sub_1' };
const mockAdminRef = { get: jest.fn() };
const mockPaymentIntentsCreate = jest.fn();
const mockIsSubscriptionEntitled = jest.fn((subscription: Record<string, unknown>) => (
  subscription?.status === 'active' && subscription?.paymentStatus === 'succeeded'
));
const mockMarkExpiredSubscriptionInTransaction = jest.fn((
  transaction: { update: jest.Mock },
  subscriptionRef: unknown,
  subscription: Record<string, unknown>,
  now: Date,
) => {
  const periodEnd = subscription?.periodEndAtUtc instanceof Date ? subscription.periodEndAtUtc : null;
  if (subscription?.status === 'active' && periodEnd && now >= periodEnd) {
    transaction.update(subscriptionRef, { status: 'expired', expiredAt: 'EXPIRED' });
    return true;
  }
  return false;
});
const mockTransaction = {
  get: jest.fn(),
  update: jest.fn(),
};
const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'personal_driver_trips') return { doc: jest.fn(() => mockTripRef) };
    if (name === 'personal_driver_subscriptions') return { doc: jest.fn(() => mockSubscriptionRef) };
    if (name === 'admins') return { doc: jest.fn(() => mockAdminRef) };
    throw new Error(`Unexpected collection ${name}`);
  }),
  runTransaction: jest.fn((callback: (tx: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction)),
};

jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(() => mockDb), {
    FieldValue: {
      serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
      delete: jest.fn(() => 'DELETE_FIELD'),
    },
  }),
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: jest.fn(() => ({ value: jest.fn(() => 'sk_test_123') })),
  defineInt: jest.fn(() => ({ value: jest.fn(() => 240) })),
}));

jest.mock('../../stripe/stripe-client.js', () => ({
  createStripeClient: jest.fn(() => ({
    paymentIntents: { create: mockPaymentIntentsCreate },
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

jest.mock('../entitlement', () => ({
  isSubscriptionEntitled: mockIsSubscriptionEntitled,
  markExpiredSubscriptionInTransaction: mockMarkExpiredSubscriptionInTransaction,
}));

function makeRequest(data: unknown, uid = 'driver_1') {
  return { data, auth: { uid } } as never;
}

const now = new Date('2026-08-04T12:00:00.000Z');

describe('chargePersonalDriverWaitTimeOverage', () => {
  let tripData: Record<string, unknown>;
  let subscriptionData: Record<string, unknown>;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now.getTime());
    jest.clearAllMocks();
    tripData = {
      subscriptionId: 'sub_1',
      userId: 'client_1',
      assignedDriverId: 'driver_1',
      status: 'passenger_picked_up',
      selectedPlanId: 'classic',
      isSpecialTrip: false,
      waitStartedAt: new Date('2026-08-04T11:51:00.000Z'),
      waitEndedAt: new Date('2026-08-04T12:00:00.000Z'),
      overageChargeStatus: undefined,
    };
    subscriptionData = {
      userId: 'client_1',
      status: 'active',
      paymentStatus: 'succeeded',
      periodStartAtUtc: new Date('2026-08-01T00:00:00.000Z'),
      periodEndAtUtc: new Date('2026-09-01T00:00:00.000Z'),
      selectedPlanId: 'classic',
      stripeCustomerId: 'cus_1',
      defaultPaymentMethodId: 'pm_1',
    };
    mockTransaction.get.mockImplementation(async (ref: unknown) => (
      ref === mockTripRef
        ? { exists: true, data: () => tripData }
        : ref === mockAdminRef
          ? { exists: false, data: () => undefined }
          : { exists: true, data: () => subscriptionData }
    ));
    mockTripRef.get.mockResolvedValue({ exists: true, data: () => tripData });
    mockTransaction.update.mockImplementation((_ref: unknown, update: Record<string, unknown>) => {
      Object.assign(tripData, update);
    });
    mockAdminRef.get.mockResolvedValue({ exists: false });
    mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_overage_1', status: 'succeeded' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects elapsedMinutes because the client cannot provide wait duration', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');

    await expect(chargePersonalDriverWaitTimeOverage(makeRequest({ tripId: 'trip_1', elapsedMinutes: 999 })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects and marks a trip for review when server wait timestamps are missing', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');
    delete tripData.waitStartedAt;

    await expect(chargePersonalDriverWaitTimeOverage(makeRequest({ tripId: 'trip_1' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.update).toHaveBeenCalledWith(mockTripRef, expect.objectContaining({
      overageChargeStatus: 'review_required',
    }));
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('rejects negative server wait duration', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');
    tripData.waitEndedAt = new Date('2026-08-04T11:50:00.000Z');

    await expect(chargePersonalDriverWaitTimeOverage(makeRequest({ tripId: 'trip_1' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('rejects a wait above the explicit maximum without charging Stripe', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');
    tripData.waitStartedAt = new Date('2026-08-04T07:00:00.000Z');

    await expect(chargePersonalDriverWaitTimeOverage(makeRequest({ tripId: 'trip_1' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.update).toHaveBeenCalledWith(mockTripRef, expect.objectContaining({
      overageChargeStatus: 'review_required',
    }));
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('marks free wait as billed without creating a PaymentIntent', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');
    tripData.waitStartedAt = new Date('2026-08-04T11:56:00.000Z');

    await expect(chargePersonalDriverWaitTimeOverage(makeRequest({ tripId: 'trip_1' }))).resolves.toEqual({
      success: true,
      waitTimeMinutes: 4,
      feeBilled: 0,
      overageMinutes: 0,
    });
    expect(mockTransaction.update).toHaveBeenCalledWith(mockTripRef, expect.objectContaining({
      overageChargeStatus: 'billed',
      overageWaitBilled: true,
    }));
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('calculates chargeable wait from server timestamps and uses the deterministic overage key', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');

    await expect(chargePersonalDriverWaitTimeOverage(makeRequest({ tripId: 'trip_1' }))).resolves.toEqual({
      success: true,
      waitTimeMinutes: 9,
      feeBilled: 2,
      overageMinutes: 4,
      paymentIntentId: 'pi_overage_1',
    });
    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 200 }), {
      idempotencyKey: 'personal_driver_wait_overage_trip_1',
    });
    expect(mockTransaction.update).toHaveBeenCalledWith(mockTripRef, expect.objectContaining({
      overageChargeStatus: 'billed',
      overagePaymentIntentId: 'pi_overage_1',
    }));
  });

  it('rechecks ownership and entitlement inside the transaction', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');
    subscriptionData.paymentStatus = 'pending';

    await expect(chargePersonalDriverWaitTimeOverage(makeRequest({ tripId: 'trip_1' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('rejects a manual retry from an unrelated user inside the transaction', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');

    await expect(chargePersonalDriverWaitTimeOverage(makeRequest({ tripId: 'trip_1' }, 'other_user')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('reclaims a stale processing claim with the same deterministic key', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');
    tripData.overageChargeStatus = 'processing';
    tripData.overageChargeClaimedAt = new Date('2026-08-04T11:00:00.000Z');

    await expect(chargePersonalDriverWaitTimeOverage(makeRequest({ tripId: 'trip_1' }))).resolves.toMatchObject({
      paymentIntentId: 'pi_overage_1',
    });
    expect(mockPaymentIntentsCreate).toHaveBeenCalledTimes(1);
    expect(mockPaymentIntentsCreate.mock.calls[0][1]).toEqual({
      idempotencyKey: 'personal_driver_wait_overage_trip_1',
    });
  });

  it('returns an already billed result without requiring a PaymentIntent id', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');
    tripData.overageChargeStatus = 'billed';
    tripData.overageWaitBilled = true;
    tripData.overageWaitMinutes = 0;
    tripData.overageWaitFeeAmount = 0;
    tripData.waitTimeMinutes = 9;

    await expect(chargePersonalDriverWaitTimeOverage(makeRequest({ tripId: 'trip_1' }))).resolves.toEqual({
      success: true,
      waitTimeMinutes: 9,
      feeBilled: 0,
      overageMinutes: 0,
    });
    expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('marks an expired subscription in Firestore while settling wait-time billing for an ongoing trip', async () => {
    const { chargePersonalDriverWaitTimeOverage } = require('../chargeWaitTimeOverage');
    subscriptionData.periodEndAtUtc = new Date('2026-08-01T00:00:00.000Z');

    const result = await chargePersonalDriverWaitTimeOverage(makeRequest({ tripId: 'trip_1' }));
    expect(result).toMatchObject({ success: true, paymentIntentId: 'pi_overage_1' });
    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      status: 'expired',
    }));
    expect(mockPaymentIntentsCreate).toHaveBeenCalled();
  });
});
