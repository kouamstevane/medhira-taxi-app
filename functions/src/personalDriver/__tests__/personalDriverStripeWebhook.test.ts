export {};

const subscriptionId = 'subscription_123';
const userId = 'user_123';
const paymentIntentId = 'pi_123';
const notificationId = `personal_driver_payment_${paymentIntentId}`;
const serverTimestamp = { __serverTimestamp: true };
const subscriptionData: Record<string, unknown> = {};

const mockSubscriptionRef = { id: subscriptionId };
const mockNotificationRef = { id: notificationId };
const mockTransaction = {
  get: jest.fn(),
  update: jest.fn(),
  set: jest.fn(),
};
const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'personal_driver_subscriptions') {
      return { doc: jest.fn(() => mockSubscriptionRef) };
    }
    if (name === 'notifications') {
      return { doc: jest.fn(() => mockNotificationRef) };
    }
    throw new Error(`Unexpected collection: ${name}`);
  }),
  runTransaction: jest.fn(async (callback: (transaction: typeof mockTransaction) => Promise<void>) => callback(mockTransaction)),
};
const mockConstructEvent = jest.fn();
const mockCreateStripeClient = jest.fn(() => ({
  webhooks: { constructEvent: mockConstructEvent },
}));
const mockCreateNotification = jest.fn();
const mockGeneratePersonalDriverTrips = jest.fn();

jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(() => mockDb), {
    FieldValue: { serverTimestamp: jest.fn(() => serverTimestamp) },
  }),
}));

jest.mock('firebase-functions/v2/https', () => ({
  onRequest: (_options: unknown, handler: unknown) => handler,
  onCall: (_options: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {},
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'test_secret' }),
}));

jest.mock('../../stripe/stripe-client', () => ({
  createStripeClient: mockCreateStripeClient,
}));

jest.mock('../../utils/notificationService', () => ({
  createNotification: mockCreateNotification,
}));

jest.mock('../tripGeneration', () => ({
  generatePersonalDriverTrips: mockGeneratePersonalDriverTrips,
}));

function paymentIntentEvent(type: string, eventUserId = userId, extra: Record<string, unknown> = {}) {
  return {
    id: 'evt_123',
    type,
    data: {
      object: {
        id: paymentIntentId,
        metadata: {
          purpose: 'personal_driver_subscription',
          subscriptionId,
          userId: eventUserId,
        },
        ...extra,
      },
    },
  };
}

function response() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe('Personal Driver Stripe webhook', () => {
  beforeEach(() => {
    Object.assign(subscriptionData, {
      userId,
      status: 'pending_payment',
      paymentStatus: 'pending',
      periodStartDate: '2026-08-01',
      periodEndDateExclusive: '2026-08-31',
      periodStartAtUtc: new Date('2026-08-01T04:00:00.000Z'),
      periodEndAtUtc: new Date('2026-08-31T04:00:00.000Z'),
      serviceTimeZone: 'America/Toronto',
      pickupLocation: { latitude: 45.5, longitude: -73.5 },
      selectedWeekdays: [1],
      tripType: 'one_way',
      departureTime: '08:00',
      pickupAddress: 'A',
      destinationAddress: 'B',
      distanceOneWayKm: 10,
      distanceReturnKm: 0,
    });
    Object.keys(subscriptionData)
      .filter((key) => ![
        'userId',
        'status',
        'paymentStatus',
        'periodStartDate',
        'periodEndDateExclusive',
        'periodStartAtUtc',
        'periodEndAtUtc',
        'serviceTimeZone',
        'pickupLocation',
        'selectedWeekdays',
        'tripType',
        'departureTime',
        'pickupAddress',
        'destinationAddress',
        'distanceOneWayKm',
        'distanceReturnKm',
      ].includes(key))
      .forEach((key) => delete subscriptionData[key]);

    jest.clearAllMocks();
    mockTransaction.get.mockImplementation(async () => ({
      exists: true,
      data: () => subscriptionData,
    }));
    mockTransaction.update.mockImplementation((_ref, update) => Object.assign(subscriptionData, update));
    mockTransaction.set.mockImplementation(() => undefined);
    mockCreateNotification.mockResolvedValue(undefined);
    mockConstructEvent.mockReturnValue(paymentIntentEvent('payment_intent.succeeded'));
  });

  it('captures a pending paid subscription and writes its deterministic notification atomically', async () => {
    const { stripeWebhookInstant } = require('../../stripe/index');
    const request = {
      method: 'POST',
      headers: { 'stripe-signature': 'signature' },
      rawBody: Buffer.from('{}'),
    };

    await stripeWebhookInstant(request, response());

    expect(mockTransaction.get).toHaveBeenCalledWith(mockSubscriptionRef);
    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      paymentStatus: 'succeeded',
      status: 'active',
      paidAt: serverTimestamp,
    }));
    expect(mockTransaction.set).toHaveBeenCalledWith(mockNotificationRef, expect.objectContaining({
      notificationId,
      userId,
      title: 'Paiement Personal Driver confirme',
      type: 'payment_received',
      metadata: expect.objectContaining({ subscriptionId, stripePaymentIntentId: paymentIntentId }),
      createdAt: serverTimestamp,
    }));
    expect(mockTransaction.update.mock.invocationCallOrder[0]).toBeLessThan(
      mockTransaction.set.mock.invocationCallOrder[0],
    );
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockGeneratePersonalDriverTrips).toHaveBeenCalledTimes(1);

    await stripeWebhookInstant(request, response());

    expect(mockTransaction.update).toHaveBeenCalledTimes(1);
    expect(mockTransaction.set).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockGeneratePersonalDriverTrips).toHaveBeenCalledTimes(2);
  });

  it('does not regress or notify an active subscription on duplicate delivery', async () => {
    const { stripeWebhookInstant } = require('../../stripe/index');
    Object.assign(subscriptionData, {
      status: 'active',
      paymentStatus: 'succeeded',
    });
    const request = {
      method: 'POST',
      headers: { 'stripe-signature': 'signature' },
      rawBody: Buffer.from('{}'),
    };

    await stripeWebhookInstant(request, response());

    expect(subscriptionData).toMatchObject({
      status: 'active',
      paymentStatus: 'succeeded',
    });
    expect(mockTransaction.update).not.toHaveBeenCalled();
    expect(mockTransaction.set).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('does not transition a subscription when metadata belongs to another user', async () => {
    const { stripeWebhookInstant } = require('../../stripe/index');
    mockConstructEvent.mockReturnValue(paymentIntentEvent('payment_intent.succeeded', 'other_user'));
    const request = {
      method: 'POST',
      headers: { 'stripe-signature': 'signature' },
      rawBody: Buffer.from('{}'),
    };

    await stripeWebhookInstant(request, response());

    expect(mockTransaction.update).not.toHaveBeenCalled();
    expect(mockTransaction.set).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it.each([
    ['payment_intent.payment_failed', 'payment_failed', 'failed'],
    ['payment_intent.canceled', 'cancelled', 'cancelled'],
  ])('marks a subscription as %s without admin validation', async (eventType, status, paymentStatus) => {
    const { stripeWebhookInstant } = require('../../stripe/index');
    mockConstructEvent.mockReturnValue(paymentIntentEvent(eventType, userId, {
      last_payment_error: { message: 'Carte refusée' },
    }));
    const request = {
      method: 'POST',
      headers: { 'stripe-signature': 'signature' },
      rawBody: Buffer.from('{}'),
    };

    await stripeWebhookInstant(request, response());

    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      status,
      paymentStatus,
    }));
    expect(mockGeneratePersonalDriverTrips).not.toHaveBeenCalled();
  });

  it('keeps a payment requiring customer action pending without activating the package', async () => {
    const { stripeWebhookInstant } = require('../../stripe/index');
    mockConstructEvent.mockReturnValue(paymentIntentEvent('payment_intent.requires_action', userId, {
      next_action: { type: 'use_stripe_sdk' },
    }));
    const request = {
      method: 'POST',
      headers: { 'stripe-signature': 'signature' },
      rawBody: Buffer.from('{}'),
    };

    await stripeWebhookInstant(request, response());

    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      status: 'pending_payment',
      paymentStatus: 'requires_action',
      paymentActionRequired: 'use_stripe_sdk',
    }));
    expect(mockGeneratePersonalDriverTrips).not.toHaveBeenCalled();
  });

  it('returns a retryable error when post-payment trip generation fails', async () => {
    const { stripeWebhookInstant } = require('../../stripe/index');
    mockGeneratePersonalDriverTrips.mockRejectedValueOnce(new Error('trip generation failed'));
    const request = {
      method: 'POST',
      headers: { 'stripe-signature': 'signature' },
      rawBody: Buffer.from('{}'),
    };
    const res = response();

    await stripeWebhookInstant(request, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ received: false, error: 'trip generation failed' });
  });
});
