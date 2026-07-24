export {};

const subscriptionId = 'a'.repeat(64);
const mockSubscriptionRef = { id: subscriptionId, get: jest.fn() };
const mockTripRef = { id: 'trip_123' };
const mockBatch = {
  set: jest.fn(),
  commit: jest.fn(),
};
const mockSubscriptionDoc = jest.fn(() => mockSubscriptionRef);
const mockTripDoc = jest.fn(() => mockTripRef);
const mockDb = {
  batch: jest.fn(() => mockBatch),
  collection: jest.fn((name: string) => ({
    doc: name === 'personal_driver_subscriptions'
      ? mockSubscriptionDoc
      : mockTripDoc,
  })),
};
const mockStripe = {
  paymentIntents: { create: jest.fn(), retrieve: jest.fn(), cancel: jest.fn() },
};
const mockCreateStripeClient = jest.fn(() => mockStripe);

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: jest.fn(() => mockDb),
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

jest.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => 'sk_test_123' }),
}));

jest.mock('../../stripe/stripe-client.js', () => ({
  createStripeClient: mockCreateStripeClient,
}), { virtual: true });

const validPayload = {
  selectedPlanId: 'basic',
  requestId: 'request_123',
  pickupAddress: '10 rue Principale, Montreal',
  destinationAddress: '100 boulevard Saint-Laurent, Montreal',
  tripType: 'one_way',
  selectedWeekdays: [1],
  departureTime: '08:00',
  startDate: '2026-07-27',
  distanceOneWayKm: 10,
  distanceReturnKm: 0,
  monthlyDistanceKm: 300,
  passengerCount: 1,
  notes: 'Trajet domicile travail',
};

function makeRequest(data: unknown, uid?: string) {
  return {
    data,
    auth: uid ? { uid } : undefined,
  } as never;
}

describe('createPersonalDriverSubscriptionPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscriptionRef.get.mockResolvedValue({ exists: false });
    mockBatch.commit.mockResolvedValue(undefined);
    mockStripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_123',
      client_secret: 'pi_123_secret',
    });
    mockStripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_123',
      client_secret: 'pi_123_secret',
    });
    mockStripe.paymentIntents.cancel.mockResolvedValue({ id: 'pi_123', status: 'canceled' });
  });

  it('requires authentication', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment.js');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload))).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('rejects Basic subscriptions that include weekend days', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment.js');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      selectedWeekdays: [1, 6],
    }, 'user_123'))).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('rejects round trips without a return time', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment.js');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      tripType: 'round_trip',
      distanceReturnKm: 10,
    }, 'user_123'))).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('rejects subscriptions above the existing Stripe amount limit', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment.js');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      selectedPlanId: 'premium',
      monthlyDistanceKm: 10000,
    }, 'user_123'))).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('requires a bounded non-empty request ID', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment.js');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      requestId: ' ',
    }, 'user_123'))).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();

    await expect(createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      requestId: 'a'.repeat(129),
    }, 'user_123'))).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('recalculates the price and creates the subscription, trips, and PaymentIntent', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment.js');

    const result = await createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'));

    expect(result).toEqual({
      subscriptionId,
      paymentIntentId: 'pi_123',
      clientSecret: 'pi_123_secret',
      amount: 450,
      currency: 'cad',
    });
    expect(mockSubscriptionDoc).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 45000,
        currency: 'cad',
        metadata: {
          purpose: 'personal_driver_subscription',
          subscriptionId,
          userId: 'user_123',
        },
      }),
      expect.objectContaining({ idempotencyKey: `personal_driver_subscription_${subscriptionId}_45000` }),
    );
    expect(mockBatch.set).toHaveBeenCalledWith(
      mockSubscriptionRef,
      expect.objectContaining({
        id: subscriptionId,
        userId: 'user_123',
        status: 'pending_payment',
        selectedPlanId: 'basic',
        selectedPlanPrice: expect.objectContaining({ totalBeforeTax: 450 }),
        priceComparison: expect.objectContaining({ monthlyDistanceKm: 300 }),
        taxAmount: 0,
        totalAmount: 450,
        stripePaymentIntentId: 'pi_123',
        paymentStatus: 'authorized',
      }),
    );
    const tripWrites = mockBatch.set.mock.calls.filter((call) => call[0] === mockTripRef);
    expect(tripWrites).toHaveLength(5);
    expect(tripWrites.map((call) => call[1])).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'scheduled', subscriptionId }),
    ]));
    expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    const subscriptionWrite = mockBatch.set.mock.calls.find((call) => call[0] === mockSubscriptionRef)?.[1];
    expect(subscriptionWrite).not.toHaveProperty('priceComparison.recommendationReasons');
    expect(subscriptionWrite).toHaveProperty('priceComparison.plans.basic.totalBeforeTax', 450);
  });

  it('returns the persisted pending subscription payment for a retried request', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment.js');
    mockSubscriptionRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user_123',
        status: 'pending_payment',
        stripePaymentIntentId: 'pi_existing',
        totalAmount: 450,
        currency: 'cad',
      }),
    });
    mockStripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_existing',
      client_secret: 'pi_existing_secret',
    });

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).resolves.toEqual({
      subscriptionId,
      paymentIntentId: 'pi_existing',
      clientSecret: 'pi_existing_secret',
      amount: 450,
      currency: 'cad',
    });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_existing');
    expect(mockBatch.commit).not.toHaveBeenCalled();
  });

  it('cancels the PaymentIntent when Firestore persistence fails', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment.js');
    mockBatch.commit.mockRejectedValue(new Error('Firestore unavailable'));

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).rejects.toMatchObject({
      code: 'internal',
    });

    expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith(
      'pi_123',
      undefined,
      { idempotencyKey: 'cancel_personal_driver_subscription_pi_123' },
    );
  });

  it('still returns an internal error when compensation cancellation fails', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment.js');
    mockBatch.commit.mockRejectedValue(new Error('Firestore unavailable'));
    mockStripe.paymentIntents.cancel.mockRejectedValue(new Error('Stripe unavailable'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).rejects.toMatchObject({
      code: 'internal',
    });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
