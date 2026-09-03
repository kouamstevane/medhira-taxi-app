export {};

const subscriptionId = 'a'.repeat(64);
const mockSubscriptionRef = { id: subscriptionId, get: jest.fn() };
const mockUserRef = { get: jest.fn() };
const mockPlanCollectionGet = jest.fn();
const mockTripRef = { id: 'trip_123' };
const mockTransaction = {
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const mockBatch = {
  set: jest.fn(),
  commit: jest.fn(),
};
const mockSubscriptionDoc = jest.fn((id: string) => {
  void id;
  return mockSubscriptionRef;
});
const mockLockDoc = jest.fn((id: string) => ({ id }));
const mockUserDoc = jest.fn(() => mockUserRef);
const mockTripDoc = jest.fn(() => mockTripRef);
const mockDb = {
  batch: jest.fn(() => mockBatch),
  runTransaction: jest.fn((callback: (transaction: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction)),
  collection: jest.fn((name: string) => ({
    ...(name === 'personal_driver_plans' ? { get: mockPlanCollectionGet } : {}),
    doc: name === 'personal_driver_subscriptions'
      ? mockSubscriptionDoc
      : name === 'personal_driver_subscription_locks'
        ? mockLockDoc
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
  getLocalCalendarDate: (instant: Date, serviceTimeZone: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: serviceTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  },
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

function configurePersonalDriverPlan(id: string, data: Record<string, unknown>) {
  mockPlanCollectionGet.mockResolvedValue({
    docs: [{ id, data: () => data }],
  });
}

describe('createPersonalDriverSubscriptionPayment', () => {
  let transactionData: Record<string, unknown> | undefined;
  let lockDocuments: Map<string, Record<string, unknown>>;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(Date.parse('2026-08-03T12:00:00.000Z'));
    jest.clearAllMocks();
    mockSubscriptionDoc.mockImplementation((id: string) => {
      void id;
      return mockSubscriptionRef;
    });
    mockCallableOptions.length = 0;
    mockSubscriptionRef.get.mockReset();
    mockUserRef.get.mockReset();
    mockPlanCollectionGet.mockReset();
    mockPlanCollectionGet.mockResolvedValue({ docs: [] });
    mockTransaction.get.mockReset();
    mockTransaction.create.mockReset();
    mockTransaction.update.mockReset();
    mockTransaction.delete.mockReset();
    mockDb.runTransaction.mockClear();
    mockDb.runTransaction.mockImplementation(async (callback: (transaction: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction));
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
    transactionData = undefined;
    lockDocuments = new Map();
    mockTransaction.get.mockImplementation(async (ref) => {
      const data = ref === mockSubscriptionRef ? transactionData : lockDocuments.get(ref.id);
      return data ? { exists: true, data: () => data } : { exists: false, data: () => undefined };
    });
    mockTransaction.create.mockImplementation((ref, data) => {
      if (ref === mockSubscriptionRef) {
        transactionData = data;
        mockSubscriptionRef.get.mockResolvedValue({ exists: true, data: () => transactionData });
      } else {
        lockDocuments.set(ref.id, data);
      }
    });
    mockTransaction.update.mockImplementation((ref, data) => {
      if (ref === mockSubscriptionRef) {
        transactionData = { ...transactionData, ...data };
        mockSubscriptionRef.get.mockResolvedValue({ exists: true, data: () => transactionData });
      } else {
        lockDocuments.set(ref.id, { ...lockDocuments.get(ref.id), ...data });
      }
    });
    mockTransaction.delete.mockImplementation((ref) => {
      lockDocuments.delete(ref.id);
    });
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

    const first = await createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'));
    const replayed = await createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'));
    transactionData = undefined;
    mockSubscriptionRef.get.mockResolvedValue({ exists: false });
    await createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_456'));

    expect(replayed.subscriptionId).toBe(first.subscriptionId);
    expect(new Set(mockSubscriptionDoc.mock.calls.map(([id]) => id)).size).toBeGreaterThanOrEqual(2);
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
      quote: {
        distanceOneWayKm: 12.5,
        distanceReturnKm: 0,
        monthlyDistanceKm: 62.5,
        selectedPlanPrice: expect.objectContaining({
          planId: 'basic',
          totalBeforeTax: 300,
        }),
        taxAmount: 0,
        totalAmount: 300,
        currency: 'cad',
      },
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
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^personal_driver_subscription_period_[a-f0-9]{64}$/),
      }),
    );
    expect(mockTransaction.update).toHaveBeenCalledWith(
      mockSubscriptionRef,
      expect.objectContaining({
        id: subscriptionId,
        userId: 'user_123',
        status: 'pending_payment',
        activationStatus: 'pending_payment',
        activationError: null,
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
    const subscriptionWrite = mockTransaction.update.mock.calls.find((call) => call[0] === mockSubscriptionRef)?.[1];
    expect(subscriptionWrite).not.toHaveProperty('priceComparison.recommendationReasons');
    expect(subscriptionWrite).toHaveProperty('priceComparison.plans.basic.totalBeforeTax', 300);
  });

  it('prices new Premium subscriptions from the configured plan snapshot', async () => {
    configurePersonalDriverPlan('premium', {
      minimumAmount: 800,
      allowedWeekdays: [1, 2, 3, 4, 5],
      includedSpecialTrips: 1,
    });
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');

    const result = await createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      selectedPlanId: 'premium',
      selectedWeekdays: [1],
    }, 'user_123'));

    expect(result).toEqual(expect.objectContaining({
      amount: 800,
      quote: expect.objectContaining({
        selectedPlanPrice: expect.objectContaining({
          planId: 'premium',
          minimumAmount: 800,
          includedSpecialTrips: 1,
          totalBeforeTax: 800,
        }),
        totalAmount: 800,
      }),
    }));
    expect(mockPlanCollectionGet).toHaveBeenCalledTimes(1);
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 80000 }),
      expect.any(Object),
    );
    expect(mockTransaction.update).toHaveBeenCalledWith(
      mockSubscriptionRef,
      expect.objectContaining({
        selectedPlanId: 'premium',
        selectedPlanPrice: expect.objectContaining({
          minimumAmount: 800,
          includedSpecialTrips: 1,
          totalBeforeTax: 800,
        }),
        priceComparison: expect.objectContaining({
          plans: expect.objectContaining({
            premium: expect.objectContaining({
              minimumAmount: 800,
              includedSpecialTrips: 1,
              totalBeforeTax: 800,
            }),
          }),
        }),
        includedSpecialTrips: 1,
        totalAmount: 800,
      }),
    );
  });

  it('uses configured weekdays to decide selected plan eligibility', async () => {
    configurePersonalDriverPlan('basic', {
      allowedWeekdays: [1, 2, 3, 4, 5, 6],
    });
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      selectedPlanId: 'basic',
      selectedWeekdays: [6],
    }, 'user_123'))).resolves.toEqual(expect.objectContaining({
      amount: 300,
      quote: expect.objectContaining({
        selectedPlanPrice: expect.objectContaining({
          planId: 'basic',
          isEligible: true,
        }),
      }),
    }));

    expect(mockPlanCollectionGet).toHaveBeenCalledTimes(1);
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
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
    expect(mockTransaction.update).toHaveBeenCalledWith(
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

  it('returns the exact authoritative round-trip quote used by Stripe and Firestore', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    mockCalculateServerRoute
      .mockResolvedValueOnce({ distanceKm: 10, durationMinutes: 20 })
      .mockResolvedValueOnce({ distanceKm: 13.4, durationMinutes: 24 });
    mockCalculateAuthoritativeMonthlyDistanceKm.mockReturnValueOnce(117);

    const result = await createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      tripType: 'round_trip',
      returnTime: '17:00',
      distanceOneWayKm: 999,
      distanceReturnKm: 999,
      monthlyDistanceKm: 999,
    }, 'user_123'));

    expect(result).toEqual(expect.objectContaining({
      amount: 300,
      currency: 'cad',
      quote: {
        distanceOneWayKm: 10,
        distanceReturnKm: 13.4,
        monthlyDistanceKm: 117,
        selectedPlanPrice: expect.objectContaining({
          planId: 'basic',
          totalBeforeTax: 300,
        }),
        taxAmount: 0,
        totalAmount: 300,
        currency: 'cad',
      },
    }));
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: result.quote.totalAmount * 100 }),
      expect.any(Object),
    );
    expect(mockTransaction.update).toHaveBeenCalledWith(
      mockSubscriptionRef,
      expect.objectContaining({
        distanceOneWayKm: result.quote.distanceOneWayKm,
        distanceReturnKm: result.quote.distanceReturnKm,
        monthlyDistanceKm: result.quote.monthlyDistanceKm,
        planSnapshot: expect.objectContaining({
          id: 'basic',
          name: 'Basic',
          promise: 'La simplicité au quotidien',
          includedRegularWaitMinutes: 3,
          includedSpecialTrips: 0,
          benefits: [
            'Service du lundi au vendredi',
            "3 min d'attente gratuites",
            'Horaires fixes',
          ],
        }),
        taxAmount: result.quote.taxAmount,
        totalAmount: result.quote.totalAmount,
        currency: result.quote.currency,
      }),
    );
    expect(result.amount).toBe(result.quote.totalAmount);
  });

  it('returns the persisted pending subscription payment for a retried request', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    mockSubscriptionRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user_123',
        status: 'pending_payment',
        paymentStatus: 'pending',
        stripePaymentIntentId: 'pi_existing',
        distanceOneWayKm: 12.5,
        distanceReturnKm: 0,
        monthlyDistanceKm: 62.5,
        selectedPlanPrice: { planId: 'classic', totalBeforeTax: 450 },
        taxAmount: 0,
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
      quote: {
        distanceOneWayKm: 12.5,
        distanceReturnKm: 0,
        monthlyDistanceKm: 62.5,
        selectedPlanPrice: { planId: 'classic', totalBeforeTax: 450 },
        taxAmount: 0,
        totalAmount: 450,
        currency: 'cad',
      },
    });

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_existing');
    expect(mockBatch.commit).not.toHaveBeenCalled();
  });

  it.each([
    ['payment_failed', 'failed'],
    ['cancelled', 'cancelled'],
  ])('reclaims a same-request %s payment instead of replaying its terminal intent', async (status, paymentStatus) => {
    const terminalData = {
      id: subscriptionId,
      userId: 'user_123',
      status,
      paymentStatus,
      periodStartDate: validPayload.startDate,
      paymentCreationAttempt: 1,
      stripePaymentIntentId: 'pi_terminal',
      distanceOneWayKm: 12.5,
      distanceReturnKm: 0,
      monthlyDistanceKm: 62.5,
      selectedPlanPrice: { planId: 'basic', totalBeforeTax: 300 },
      taxAmount: 0,
      totalAmount: 300,
      currency: 'cad',
    };
    transactionData = terminalData;
    mockSubscriptionRef.get.mockResolvedValue({ exists: true, data: () => terminalData });
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).resolves.toEqual(
      expect.objectContaining({ paymentIntentId: 'pi_123' }),
    );

    expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalledWith('pi_terminal');
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      paymentCreationAttempt: 2,
      paymentStatus: 'creating',
    }));
  });

  it('returns the persisted payment when an exact replay crosses pickup-zone midnight', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    const midnightPayload = { ...validPayload, startDate: '2026-08-03' };
    jest.setSystemTime(Date.parse('2026-08-04T03:59:00.000Z'));

    await createPersonalDriverSubscriptionPayment(makeRequest(midnightPayload, 'user_123'));
    mockSubscriptionRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        userId: 'user_123',
        status: 'pending_payment',
        paymentStatus: 'pending',
        stripePaymentIntentId: 'pi_123',
        distanceOneWayKm: 12.5,
        distanceReturnKm: 0,
        monthlyDistanceKm: 62.5,
        selectedPlanPrice: expect.objectContaining({ planId: 'basic', totalBeforeTax: 300 }),
        taxAmount: 0,
        totalAmount: 300,
        currency: 'cad',
      }),
    });
    jest.setSystemTime(Date.parse('2026-08-04T04:01:00.000Z'));

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(midnightPayload, 'user_123'))).resolves.toEqual({
      subscriptionId,
      paymentIntentId: 'pi_123',
      clientSecret: 'pi_123_secret',
      amount: 300,
      currency: 'cad',
      quote: {
        distanceOneWayKm: 12.5,
        distanceReturnKm: 0,
        monthlyDistanceKm: 62.5,
        selectedPlanPrice: expect.objectContaining({ planId: 'basic', totalBeforeTax: 300 }),
        taxAmount: 0,
        totalAmount: 300,
        currency: 'cad',
      },
    });
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_123');
    expect(mockResolvePickupLocationAndTimeZone).toHaveBeenCalledTimes(1);
  });

  it('does not create another PaymentIntent while the same request is claimed', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(Date.parse('2026-08-03T12:00:00.000Z'));
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    let releasePaymentIntent: ((paymentIntent: { id: string; client_secret: string }) => void) | undefined;
    const paymentIntentCreated = new Promise<void>((resolve) => {
      mockStripe.paymentIntents.create.mockImplementationOnce(() => {
        resolve();
        return new Promise((paymentIntentResolve) => {
          releasePaymentIntent = paymentIntentResolve;
        });
      });
    });

    const firstRequest = createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'));
    await paymentIntentCreated;
    const secondRequest = createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      monthlyDistanceKm: 350,
    }, 'user_123'));

    expect(mockTransaction.create).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      userId: 'user_123',
      status: 'pending_payment',
      paymentStatus: 'creating',
    }));
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 30000 }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^personal_driver_subscription_period_[a-f0-9]{64}$/),
      }),
    );

    releasePaymentIntent?.({ id: 'pi_123', client_secret: 'pi_123_secret' });
    await expect(firstRequest).resolves.toEqual(expect.objectContaining({ paymentIntentId: 'pi_123' }));
    await expect(secondRequest).resolves.toEqual(expect.objectContaining({ paymentIntentId: 'pi_123' }));
  });

  it('marks a Stripe creation failure recoverable and lets a retry reclaim it', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    mockStripe.paymentIntents.create.mockRejectedValueOnce(new Error('Stripe unavailable'));

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).rejects.toMatchObject({
      code: 'internal',
    });

    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      status: 'payment_failed',
      paymentStatus: 'failed',
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
    const lockId = require('../subscriptionPeriodLock').createSubscriptionPeriodLockId('user_123', validPayload.startDate);
    lockDocuments.set(lockId, {
      userId: 'user_123',
      periodStartDate: validPayload.startDate,
      subscriptionId,
      state: 'creating',
      ownerId: 'old_owner',
      attempt: 1,
      leaseExpiresAt: new Date(Date.now() - 1),
    });
    transactionData = {
      userId: 'user_123',
      periodStartDate: validPayload.startDate,
      status: 'pending_payment',
      paymentStatus: 'creating',
      paymentCreationOwnerId: 'old_owner',
      paymentCreationClaimedAt: new Date(Date.now() - (60 * 60 * 1000)),
      paymentCreationAttempt: 1,
    };

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).resolves.toEqual(
      expect.objectContaining({ paymentIntentId: 'pi_123' }),
    );

    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubscriptionRef, expect.objectContaining({
      paymentStatus: 'creating',
      paymentCreationOwnerId: expect.any(String),
    }));
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
  });

  it('leaves the idempotent PaymentIntent recoverable when Firestore persistence fails', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    const run = async (callback: (transaction: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction);
    mockDb.runTransaction
      .mockImplementationOnce(run)
      .mockRejectedValueOnce(new Error('Firestore unavailable'))
      .mockImplementation(run);

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).rejects.toMatchObject({
      code: 'internal',
    });

    expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(transactionData).toMatchObject({
      status: 'pending_payment',
      paymentStatus: 'creating',
      paymentCreationAttempt: 1,
    });
    expect(lockDocuments.values().next().value).toMatchObject({
      state: 'creating',
      attempt: 1,
    });
  });

  it('does not cancel a PaymentIntent when the failed commit persisted its subscription', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    const run = async (callback: (transaction: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction);
    mockDb.runTransaction
      .mockImplementationOnce(run)
      .mockImplementationOnce(async (callback) => {
        await callback(mockTransaction);
        throw new Error('Firestore response unavailable');
      })
      .mockImplementation(run);

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).rejects.toMatchObject({
      code: 'internal',
    });

    expect(mockDb.runTransaction).toHaveBeenCalledTimes(2);
    expect(transactionData).toMatchObject({
      status: 'pending_payment',
      paymentStatus: 'pending',
      stripePaymentIntentId: 'pi_123',
    });
    expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled();
  });

  it('does not cancel the shared PaymentIntent after the creating lease changes owner', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    const run = async (callback: (transaction: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction);
    mockDb.runTransaction
      .mockImplementationOnce(run)
      .mockImplementationOnce(async (callback) => {
        const [lockId] = lockDocuments.keys();
        lockDocuments.set(lockId, { ...lockDocuments.get(lockId), ownerId: 'new_owner' });
        return callback(mockTransaction);
      })
      .mockImplementation(run);

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).rejects.toMatchObject({
      code: 'aborted',
    });

    expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled();
  });

  it('does not compensate a generic finalization failure after the lease changes owner', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    const run = async (callback: (transaction: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction);
    mockDb.runTransaction
      .mockImplementationOnce(run)
      .mockImplementationOnce(async () => {
        const [lockId] = lockDocuments.keys();
        lockDocuments.set(lockId, {
          ...lockDocuments.get(lockId),
          ownerId: 'new_owner',
          attempt: 2,
        });
        throw new Error('Firestore unavailable');
      })
      .mockImplementation(run);

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).rejects.toMatchObject({
      code: 'internal',
    });

    expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(lockDocuments.values().next().value).toMatchObject({ ownerId: 'new_owner', attempt: 2 });
  });

  it('does not cancel the shared PaymentIntent before a later owner reclaims failed finalization', async () => {
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    const run = async (callback: (transaction: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction);
    mockDb.runTransaction
      .mockImplementationOnce(run)
      .mockRejectedValueOnce(new Error('Firestore unavailable'))
      .mockImplementation(run);

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).rejects.toMatchObject({
      code: 'internal',
    });
    const firstOwnerId = transactionData?.paymentCreationOwnerId;
    const firstIdempotencyKey = mockStripe.paymentIntents.create.mock.calls[0][1].idempotencyKey;
    jest.setSystemTime(Date.now() + (10 * 60 * 1000) + 1);

    await expect(createPersonalDriverSubscriptionPayment(makeRequest(validPayload, 'user_123'))).resolves.toEqual(
      expect.objectContaining({ paymentIntentId: 'pi_123' }),
    );

    expect(transactionData?.paymentCreationOwnerId).not.toBe(firstOwnerId);
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(2);
    expect(mockStripe.paymentIntents.create.mock.calls[1][1].idempotencyKey).toBe(firstIdempotencyKey);
    expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled();
  });

  it('keeps distinct initial request IDs on one user-period PaymentIntent', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(Date.parse('2026-08-03T12:00:00.000Z'));
    const documents = new Map<string, Record<string, unknown>>();
    mockSubscriptionDoc.mockImplementation((id: string) => ({
      id,
      get: jest.fn(async () => {
        const data = documents.get(id);
        return data ? { exists: true, data: () => data } : { exists: false };
      }),
    }));
    mockTransaction.get.mockImplementation(async (ref: { id: string }) => {
      const data = documents.get(ref.id);
      return data ? { exists: true, data: () => data } : { exists: false, data: () => undefined };
    });
    mockTransaction.create.mockImplementation((ref: { id: string }, data: Record<string, unknown>) => {
      documents.set(ref.id, data);
    });
    mockTransaction.update.mockImplementation((ref: { id: string }, data: Record<string, unknown>) => {
      documents.set(ref.id, { ...documents.get(ref.id), ...data });
    });
    mockBatch.set.mockImplementation((ref: { id: string }, data: Record<string, unknown>) => {
      documents.set(ref.id, data);
    });

    let releasePayment: ((paymentIntent: { id: string; client_secret: string }) => void) | undefined;
    const paymentCreationStarted = new Promise<void>((resolve) => {
      mockStripe.paymentIntents.create.mockImplementationOnce(() => {
        resolve();
        return new Promise((paymentIntentResolve) => {
          releasePayment = paymentIntentResolve;
        });
      });
    });
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    const firstRequest = createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      requestId: 'request_first',
    }, 'user_123'));
    await paymentCreationStarted;
    const secondRequest = createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      requestId: 'request_second',
    }, 'user_123'));
    releasePayment?.({ id: 'pi_123', client_secret: 'pi_123_secret' });
    const [first, second] = await Promise.all([firstRequest, secondRequest]);

    expect(second).toEqual(first);
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
  });

  it('shares one PaymentIntent between an initial purchase and renewal for the same user-period', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(Date.parse('2026-08-03T12:00:00.000Z'));
    const sourceSubscriptionId = 'source_subscription';
    const documents = new Map<string, Record<string, unknown>>([
      [sourceSubscriptionId, {
        id: sourceSubscriptionId,
        userId: 'user_123',
        status: 'active',
        paymentStatus: 'succeeded',
        periodStartDate: '2026-07-05',
        periodEndDateExclusive: '2026-08-04',
        periodStartAtUtc: new Date('2026-07-05T04:00:00.000Z'),
        periodEndAtUtc: new Date('2026-08-04T04:00:00.000Z'),
        serviceTimeZone: 'America/Toronto',
        pickupLocation: { latitude: 45.5017, longitude: -73.5673 },
        destinationLocation: { latitude: 45.6, longitude: -73.6 },
        selectedPlanId: 'basic',
        pickupAddress: validPayload.pickupAddress,
        destinationAddress: validPayload.destinationAddress,
        tripType: validPayload.tripType,
        selectedWeekdays: validPayload.selectedWeekdays,
        departureTime: validPayload.departureTime,
        returnTime: null,
        passengerCount: validPayload.passengerCount,
        notes: validPayload.notes,
        stripeCustomerId: 'cus_123',
      }],
    ]);
    mockSubscriptionDoc.mockImplementation((id: string) => ({
      id,
      get: jest.fn(async () => {
        const data = documents.get(id);
        return data ? { exists: true, data: () => data } : { exists: false };
      }),
    }));
    mockTransaction.get.mockImplementation(async (ref: { id: string }) => {
      const data = documents.get(ref.id);
      return data ? { exists: true, data: () => data } : { exists: false, data: () => undefined };
    });
    mockTransaction.create.mockImplementation((ref: { id: string }, data: Record<string, unknown>) => {
      documents.set(ref.id, data);
    });
    mockTransaction.update.mockImplementation((ref: { id: string }, data: Record<string, unknown>) => {
      documents.set(ref.id, { ...documents.get(ref.id), ...data });
    });
    mockStripe.paymentIntents.retrieve.mockImplementation(async (id: string) => ({
      id,
      client_secret: `${id}_secret`,
    }));

    let releasePayment: ((paymentIntent: { id: string; client_secret: string }) => void) | undefined;
    const paymentCreationStarted = new Promise<void>((resolve) => {
      mockStripe.paymentIntents.create.mockImplementationOnce(() => {
        resolve();
        return new Promise((paymentIntentResolve) => {
          releasePayment = paymentIntentResolve;
        });
      });
    });
    const { createPersonalDriverSubscriptionPayment } = require('../createSubscriptionPayment');
    const { renewPersonalDriverSubscriptionPayment } = require('../renewSubscriptionPayment');
    const initialRequest = createPersonalDriverSubscriptionPayment(makeRequest({
      ...validPayload,
      requestId: 'request_initial',
    }, 'user_123'));
    await paymentCreationStarted;
    const renewalRequest = renewPersonalDriverSubscriptionPayment(makeRequest({
      sourceSubscriptionId,
      requestId: 'request_renewal',
    }, 'user_123'));
    releasePayment?.({ id: 'pi_shared', client_secret: 'pi_shared_secret' });
    const [initial, renewal] = await Promise.all([initialRequest, renewalRequest]);

    expect(renewal).toEqual(initial);
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
  });
});
