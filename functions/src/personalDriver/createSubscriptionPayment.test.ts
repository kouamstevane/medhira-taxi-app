export {};

const mockSubscriptionRef = { id: 'subscription_123' };
const mockTripRef = { id: 'trip_123' };
const mockUserRef = { get: jest.fn() };
const mockBatch = {
  set: jest.fn(),
  commit: jest.fn(),
};
const mockDb = {
  batch: jest.fn(() => mockBatch),
  collection: jest.fn((name: string) => ({
    doc: jest.fn(() => {
      if (name === 'personal_driver_subscriptions') return mockSubscriptionRef;
      if (name === 'personal_driver_trips') return mockTripRef;
      return mockUserRef;
    }),
  })),
};
const mockStripe = {
  paymentIntents: { create: jest.fn() },
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

jest.mock('../stripe/stripe-client.js', () => ({
  createStripeClient: mockCreateStripeClient,
}), { virtual: true });

const validPayload = {
  selectedPlanId: 'basic',
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
    mockBatch.commit.mockResolvedValue(undefined);
    mockStripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_123',
      client_secret: 'pi_123_secret',
    });
  });

  it('requires authentication', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('./createSubscriptionPayment.js');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload))).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('rejects Basic subscriptions that include weekend days', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('./createSubscriptionPayment.js');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      selectedWeekdays: [1, 6],
    }, 'user_123'))).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('rejects round trips without a return time', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('./createSubscriptionPayment.js');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      tripType: 'round_trip',
      distanceReturnKm: 10,
    }, 'user_123'))).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('rejects subscriptions above the existing Stripe amount limit', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('./createSubscriptionPayment.js');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      selectedPlanId: 'premium',
      monthlyDistanceKm: 10000,
    }, 'user_123'))).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('recalculates the price and creates the subscription, trips, and PaymentIntent', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('./createSubscriptionPayment.js');

    const result = await createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'));

    expect(result).toEqual({
      subscriptionId: 'subscription_123',
      paymentIntentId: 'pi_123',
      clientSecret: 'pi_123_secret',
      amount: 450,
      currency: 'cad',
    });
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 45000,
        currency: 'cad',
        metadata: {
          purpose: 'personal_driver_subscription',
          subscriptionId: 'subscription_123',
          userId: 'user_123',
        },
      }),
      expect.objectContaining({ idempotencyKey: 'personal_driver_subscription_subscription_123_45000' }),
    );
    expect(mockBatch.set).toHaveBeenCalledWith(
      mockSubscriptionRef,
      expect.objectContaining({
        id: 'subscription_123',
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
      expect.objectContaining({ status: 'scheduled', subscriptionId: 'subscription_123' }),
    ]));
    expect(mockBatch.commit).toHaveBeenCalledTimes(1);
  });
});
