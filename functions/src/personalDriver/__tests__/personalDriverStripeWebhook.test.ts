const subscriptionId = 'subscription_123';
const userId = 'user_123';
const serverTimestamp = { __serverTimestamp: true };
const subscriptionData: Record<string, unknown> = {};

const mockSubscriptionRef = { id: subscriptionId };
const mockTransaction = {
  get: jest.fn(),
  update: jest.fn(),
};
const mockDb = {
  collection: jest.fn((name: string) => {
    if (name !== 'personal_driver_subscriptions') {
      throw new Error(`Unexpected collection: ${name}`);
    }
    return { doc: jest.fn(() => mockSubscriptionRef) };
  }),
  runTransaction: jest.fn(async (callback: (transaction: typeof mockTransaction) => Promise<void>) => callback(mockTransaction)),
};
const mockConstructEvent = jest.fn();
const mockCreateStripeClient = jest.fn(() => ({
  webhooks: { constructEvent: mockConstructEvent },
}));
const mockCreateNotification = jest.fn();

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

jest.mock('../../stripe/stripe-client.js', () => ({
  createStripeClient: mockCreateStripeClient,
}), { virtual: true });

jest.mock('../../utils/notificationService.js', () => ({
  createNotification: mockCreateNotification,
}), { virtual: true });

function paymentSucceededEvent(eventUserId = userId) {
  return {
    id: 'evt_123',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_123',
        metadata: {
          purpose: 'personal_driver_subscription',
          subscriptionId,
          userId: eventUserId,
        },
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
      paymentStatus: 'authorized',
    });
    Object.keys(subscriptionData)
      .filter((key) => !['userId', 'status', 'paymentStatus'].includes(key))
      .forEach((key) => delete subscriptionData[key]);

    jest.clearAllMocks();
    mockTransaction.get.mockImplementation(async () => ({
      exists: true,
      data: () => subscriptionData,
    }));
    mockTransaction.update.mockImplementation((_ref, update) => Object.assign(subscriptionData, update));
    mockCreateNotification.mockResolvedValue(undefined);
    mockConstructEvent.mockReturnValue(paymentSucceededEvent());
  });

  it('captures a paid subscription, notifies the client, and ignores duplicate delivery', async () => {
    const { stripeWebhookInstant } = require('../../stripe/index.js');
    const request = {
      method: 'POST',
      headers: { 'stripe-signature': 'signature' },
      rawBody: Buffer.from('{}'),
    };

    await stripeWebhookInstant(request, response());

    expect(mockTransaction.get).toHaveBeenCalledWith(mockSubscriptionRef);
    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, {
      paymentStatus: 'captured',
      status: 'pending_validation',
      paidAt: serverTimestamp,
    });
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      title: 'Paiement Personal Driver confirme',
      type: 'payment_received',
      metadata: expect.objectContaining({ subscriptionId, stripePaymentIntentId: 'pi_123' }),
    }));

    await stripeWebhookInstant(request, response());

    expect(mockTransaction.update).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it('does not transition a subscription when metadata belongs to another user', async () => {
    const { stripeWebhookInstant } = require('../../stripe/index.js');
    mockConstructEvent.mockReturnValue(paymentSucceededEvent('other_user'));
    const request = {
      method: 'POST',
      headers: { 'stripe-signature': 'signature' },
      rawBody: Buffer.from('{}'),
    };

    await stripeWebhookInstant(request, response());

    expect(mockTransaction.update).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
