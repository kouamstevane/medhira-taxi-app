export {};

const subscriptionId = 'a'.repeat(64);
const mockSubscriptionRef = { id: subscriptionId, get: jest.fn() };
const mockUserRef = { get: jest.fn() };
const mockTripRef = { id: 'trip_123' };
const mockTransaction = {
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};
const mockBatch = {
  set: jest.fn(),
  commit: jest.fn(),
};
const mockSubscriptionDoc = jest.fn(() => mockSubscriptionRef);
const mockUserDoc = jest.fn(() => mockUserRef);
const mockTripDoc = jest.fn(() => mockTripRef);
const mockDb = {
  batch: jest.fn(() => mockBatch),
  runTransaction: jest.fn((callback: (transaction: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction)),
  collection: jest.fn((name: string) => ({
    doc: name === 'personal_driver_subscriptions'
      ? mockSubscriptionDoc
      : name === 'users'
        ? mockUserDoc
      : mockTripDoc,
  })),
};
const mockStripe = {
  paymentIntents: { create: jest.fn(), retrieve: jest.fn(), cancel: jest.fn() },
};
const mockCreateStripeClient = jest.fn(() => mockStripe);
const mockCallableOptions: unknown[] = [];
const mockCalculateServerRoute = jest.fn();
const mockCalculateAuthoritativeMonthlyDistanceKm = jest.fn();
const mockResolvePickupLocationAndTimeZone = jest.fn();
const mockResolveAddressCoordinates = jest.fn();
const mockLocalDateTimeToUtc = jest.fn((date: string, time: string) => new Date(`${date}T${time}:00.000Z`));

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: jest.fn(() => mockDb),
}));

jest.mock('firebase-functions/v2/https', () => ({
  onCall: (options: unknown, handler: unknown) => {
    mockCallableOptions.push(options);
    return handler;
  },
  HttpsError: class HttpsError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ name, value: () => 'sk_test_123' }),
}));

jest.mock('../../stripe/stripe-client', () => ({
  createStripeClient: mockCreateStripeClient,
}));

jest.mock('../routeDistance', () => ({
  calculateServerRoute: mockCalculateServerRoute,
  calculateAuthoritativeMonthlyDistanceKm: mockCalculateAuthoritativeMonthlyDistanceKm,
}));

jest.mock('../locationTimeZone', () => ({
  resolvePickupLocationAndTimeZone: mockResolvePickupLocationAndTimeZone,
  resolveAddressCoordinates: mockResolveAddressCoordinates,
  localDateTimeToUtc: mockLocalDateTimeToUtc,
}));

const validPayload = {
  selectedPlanId: 'basic',
  requestId: 'request_123',
  pickupAddress: '10 rue Principale, Montreal',
  destinationAddress: '100 boulevard Saint-Laurent, Montreal',
  tripType: 'one_way',
  selectedWeekdays: [1],
  departureTime: '08:00',
  startDate: '2026-08-04',
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
    jest.useFakeTimers().setSystemTime(new Date('2026-08-03T12:00:00.000Z'));
    jest.clearAllMocks();
    mockCallableOptions.length = 0;
    mockSubscriptionRef.get.mockReset();
    mockUserRef.get.mockReset();
    mockTransaction.get.mockReset();
    mockTransaction.create.mockReset();
    mockTransaction.update.mockReset();
    mockDb.runTransaction.mockClear();
    mockBatch.commit.mockReset();
    mockStripe.paymentIntents.create.mockReset();
    mockStripe.paymentIntents.retrieve.mockReset();
    mockStripe.paymentIntents.cancel.mockReset();
    mockCalculateServerRoute.mockReset();
    mockCalculateAuthoritativeMonthlyDistanceKm.mockReset();
    mockResolvePickupLocationAndTimeZone.mockReset();
    mockResolveAddressCoordinates.mockReset();
    mockCalculateServerRoute.mockResolvedValue({ distanceKm: 12.5, durationMinutes: 30 });
    mockCalculateAuthoritativeMonthlyDistanceKm.mockReturnValue(62.5);
    mockResolvePickupLocationAndTimeZone.mockResolvedValue({
      latitude: 45.5017,
      longitude: -73.5673,
      serviceTimeZone: 'America/Toronto',
    });
    mockResolveAddressCoordinates.mockResolvedValue({ latitude: 45.6, longitude: -73.6 });
    mockSubscriptionRef.get.mockResolvedValue({ exists: false });
    mockUserRef.get.mockResolvedValue({ exists: false });
    mockTransaction.get.mockResolvedValue({ exists: false });
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

  afterEach(() => {
    jest.useRealTimers();
  });

  it('declares Stripe and Google Maps secrets for deployment', () => {
    require('../createSubscriptionPayment');

    const options = mockCallableOptions[0] as { secrets?: Array<{ name: string }> };
    expect(options.secrets?.map((secret) => secret.name)).toEqual([
      'STRIPE_SECRET_KEY',
      'GOOGLE_MAPS_API_KEY',
    ]);
  });

  it('requires authentication', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload))).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('rejects Basic subscriptions that include weekend days', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      selectedWeekdays: [1, 6],
    }, 'user_123'))).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('rejects round trips without a return time', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      tripType: 'round_trip',
      distanceReturnKm: 10,
    }, 'user_123'))).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('rejects a subscription whose start date is before the fixed service date', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    const pastStartPayload = {
      ...validPayload,
      startDate: '2026-08-02',
    };

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(pastStartPayload, 'user_123')))
      .rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('rejects a round trip whose return time is not after its departure time', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      tripType: 'round_trip',
      returnTime: '07:30',
      distanceReturnKm: 13.4,
    }, 'user_123'))).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('rejects server-calculated subscriptions above the Stripe amount limit', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    mockCalculateAuthoritativeMonthlyDistanceKm.mockReturnValueOnce(10000);

    await expect(createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      selectedPlanId: 'premium',
      monthlyDistanceKm: 1,
    }, 'user_123'))).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('requires a bounded non-empty request ID', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');

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

  it('derives the same subscription ID for the same user and request ID only', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');

    await createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'));
    await createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'));
    await createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_456'));

    const subscriptionDocCalls = mockSubscriptionDoc.mock.calls as unknown as Array<[string]>;
    const [firstSubscriptionId] = subscriptionDocCalls[0];
    const [replayedSubscriptionId] = subscriptionDocCalls[1];
    const [otherUserSubscriptionId] = subscriptionDocCalls[2];
    expect(replayedSubscriptionId).toBe(firstSubscriptionId);
    expect(otherUserSubscriptionId).not.toBe(firstSubscriptionId);
  });

  it('recalculates the price and creates the subscription and PaymentIntent without trips', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');

    const result = await createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'));

    expect(result).toEqual({
      subscriptionId,
      paymentIntentId: 'pi_123',
      clientSecret: 'pi_123_secret',
      amount: 300,
      currency: 'cad',
    });
    expect(mockSubscriptionDoc).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 30000,
        currency: 'cad',
        metadata: {
          purpose: 'personal_driver_subscription',
          subscriptionId,
          userId: 'user_123',
        },
      }),
      expect.objectContaining({ idempotencyKey: `personal_driver_subscription_${subscriptionId}_1` }),
    );
    expect(mockBatch.set).toHaveBeenCalledWith(
      mockSubscriptionRef,
      expect.objectContaining({
        id: subscriptionId,
        userId: 'user_123',
        status: 'pending_payment',
        selectedPlanId: 'basic',
        selectedPlanPrice: expect.objectContaining({ totalBeforeTax: 300 }),
        priceComparison: expect.objectContaining({ monthlyDistanceKm: 62.5 }),
        includedSpecialTrips: 0,
        taxAmount: 0,
        totalAmount: 300,
        stripePaymentIntentId: 'pi_123',
        paymentStatus: 'pending',
      }),
    );
    const tripWrites = mockBatch.set.mock.calls.filter((call) => call[0] === mockTripRef);
    expect(tripWrites).toHaveLength(0);
    expect(mockBatch.commit).toHaveBeenCalledTimes(1);
    const subscriptionWrite = mockBatch.set.mock.calls.find((call) => call[0] === mockSubscriptionRef)?.[1];
    expect(subscriptionWrite).not.toHaveProperty('priceComparison.recommendationReasons');
    expect(subscriptionWrite).toHaveProperty('priceComparison.plans.basic.totalBeforeTax', 300);
  });

  it('uses server route distance and creates no trips before payment success', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');

    const result = await createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      selectedPlanId: 'classic',
      monthlyDistanceKm: 1000,
      distanceOneWayKm: 999,
      distanceReturnKm: 0,
    }, 'user_123'));

    expect(result.amount).toBe(450);
    expect(mockCalculateServerRoute).toHaveBeenCalledWith({
      origin: validPayload.pickupAddress,
      destination: validPayload.destinationAddress,
    });
    expect(mockBatch.set.mock.calls.filter((call) => call[0] === mockTripRef)).toHaveLength(0);
    expect(mockBatch.set).toHaveBeenCalledWith(
      mockSubscriptionRef,
      expect.objectContaining({
        monthlyDistanceKm: 62.5,
        monthlyDistanceKmRemaining: 62.5,
        includedSpecialTrips: 2,
        periodStartDate: '2026-08-04',
        periodEndDateExclusive: '2026-09-03',
        serviceTimeZone: 'America/Toronto',
        pickupLocation: { latitude: 45.5017, longitude: -73.5673 },
        taxStatus: 'pending_confirmation',
        taxAmount: 0,
        paymentStatus: 'pending',
      }),
    );
  });

  it('returns the persisted pending subscription payment for a retried request', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    mockTransaction.get.mockResolvedValue({
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

  it('does not create another PaymentIntent while the same request is claimed', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    let claimedData: Record<string, unknown> | undefined;
    let releasePaymentIntent: ((paymentIntent: { id: string; client_secret: string }) => void) | undefined;
    const paymentIntentCreated = new Promise<void>((resolve) => {
      mockStripe.paymentIntents.create.mockImplementationOnce(() => {
        resolve();
        return new Promise((paymentIntentResolve) => {
          releasePaymentIntent = paymentIntentResolve;
        });
      });
    });

    mockTransaction.get.mockImplementation(async () => (
      claimedData
        ? { exists: true, data: () => claimedData }
        : { exists: false }
    ));
    mockTransaction.create.mockImplementation((_ref, data) => {
      claimedData = data;
    });

    const firstRequest = createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'));
    await paymentIntentCreated;

    await expect(createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      monthlyDistanceKm: 350,
    }, 'user_123'))).rejects.toMatchObject({ code: 'aborted' });

    expect(mockTransaction.create).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      userId: 'user_123',
      status: 'pending_payment',
      paymentStatus: 'creating',
    }));
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 30000 }),
      expect.objectContaining({ idempotencyKey: `personal_driver_subscription_${subscriptionId}_1` }),
    );

    releasePaymentIntent?.({ id: 'pi_123', client_secret: 'pi_123_secret' });
    await expect(firstRequest).resolves.toEqual(expect.objectContaining({ paymentIntentId: 'pi_123' }));
  });

  it('marks a Stripe creation failure recoverable and lets a retry reclaim it', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    let claimedData: Record<string, unknown> | undefined;
    mockTransaction.get.mockImplementation(async () => (
      claimedData
        ? { exists: true, data: () => claimedData }
        : { exists: false }
    ));
    mockTransaction.create.mockImplementation((_ref, data) => {
      claimedData = data;
    });
    mockTransaction.update.mockImplementation((_ref, data) => {
      claimedData = { ...claimedData, ...data };
    });
    mockStripe.paymentIntents.create.mockRejectedValueOnce(new Error('Stripe unavailable'));

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).rejects.toMatchObject({
      code: 'internal',
    });

    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      paymentStatus: 'creating',
      paymentCreationFailedAt: expect.any(Date),
      paymentCreationError: 'Stripe unavailable',
    }));

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).resolves.toEqual(
      expect.objectContaining({ paymentIntentId: 'pi_123' }),
    );
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(2);
  });

  it('reclaims a stale payment creation claim', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    mockTransaction.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user_123',
        status: 'pending_payment',
        paymentStatus: 'creating',
        paymentCreationClaimedAt: new Date(Date.now() - (60 * 60 * 1000)),
        paymentCreationAttempt: 1,
      }),
    });

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).resolves.toEqual(
      expect.objectContaining({ paymentIntentId: 'pi_123' }),
    );

    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      paymentStatus: 'creating',
      paymentCreationClaimedAt: expect.any(Date),
    }));
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
  });

  it('cancels the PaymentIntent when Firestore persistence fails', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
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

  it('marks an orphaned commit failure recoverable after cancellation', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    let claimedData: Record<string, unknown> | undefined;
    mockTransaction.get.mockImplementation(async () => (
      claimedData
        ? { exists: true, data: () => claimedData }
        : { exists: false }
    ));
    mockTransaction.create.mockImplementation((_ref, data) => {
      claimedData = data;
    });
    mockTransaction.update.mockImplementation((_ref, data) => {
      claimedData = { ...claimedData, ...data };
    });
    mockBatch.commit.mockRejectedValue(new Error('Firestore unavailable'));

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).rejects.toMatchObject({
      code: 'internal',
    });

    expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith(
      'pi_123',
      undefined,
      { idempotencyKey: 'cancel_personal_driver_subscription_pi_123' },
    );
    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      paymentStatus: 'creating',
      paymentCreationAttempt: 2,
    }));
  });

  it('does not cancel a PaymentIntent when the failed commit persisted its subscription', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    mockSubscriptionRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user_123',
        stripePaymentIntentId: 'pi_123',
      }),
    });
    mockBatch.commit.mockRejectedValue(new Error('Firestore unavailable'));

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).rejects.toMatchObject({
      code: 'internal',
    });

    expect(mockSubscriptionRef.get).toHaveBeenCalledTimes(1);
    expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled();
  });

  it('still returns an internal error when compensation cancellation fails', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
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
