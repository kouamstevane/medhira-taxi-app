const sourceRef = { id: 'sub_old', get: jest.fn() };
const newRef = { id: 'sub_new', get: jest.fn() };
const lockRef = { id: 'period_lock' };
export {};

const mockTransaction = {
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const mockDb = {
  collection: jest.fn((name: string) => ({
    doc: (id: string) => name === 'personal_driver_subscriptions'
      ? (id === 'sub_old' ? sourceRef : newRef)
      : name === 'personal_driver_subscription_locks'
        ? lockRef
        : { id },
  })),
  runTransaction: jest.fn(async (callback: (transaction: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction)),
};
const mockStripe = {
  paymentIntents: {
    create: jest.fn(),
    retrieve: jest.fn(),
  },
};
const mockCalculateServerRoute = jest.fn();
const mockResolveAddressCoordinates = jest.fn();
const mockCreateStripeClient = jest.fn(() => mockStripe);
const mockCallableOptions: unknown[] = [];

jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(() => mockDb), {
    FieldValue: { serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP') },
  }),
}));

jest.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ name, value: () => 'sk_test_123' }),
}));

jest.mock('../../stripe/stripe-client', () => ({
  createStripeClient: mockCreateStripeClient,
}));

jest.mock('../routeDistance', () => ({
  calculateServerRoute: mockCalculateServerRoute,
  calculateAuthoritativeMonthlyDistanceKm: (input: {
    outboundKm: number;
    returnKm: number;
    tripType: 'one_way' | 'round_trip';
    occurrences: number;
  }) => Math.round((input.outboundKm + (input.tripType === 'round_trip' ? input.returnKm : 0)) * input.occurrences * 10) / 10,
}));

jest.mock('../locationTimeZone', () => ({
  getLocalCalendarDate: (instant: Date) => instant.toISOString().slice(0, 10),
  localDateTimeToUtc: (date: string, time: string) => new Date(`${date}T${time}:00.000Z`),
  resolveAddressCoordinates: mockResolveAddressCoordinates,
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

function makeRequest(data: unknown, uid = 'user_1') {
  return { data, auth: { uid } } as never;
}

const sourceSubscription = {
  id: 'sub_old',
  userId: 'user_1',
  status: 'active',
  paymentStatus: 'succeeded',
  periodStartDate: '2026-08-01',
  periodEndDateExclusive: '2026-08-31',
  periodStartAtUtc: new Date('2026-08-01T04:00:00.000Z'),
  periodEndAtUtc: new Date('2026-08-31T04:00:00.000Z'),
  serviceTimeZone: 'America/Toronto',
  pickupLocation: { latitude: 45.5, longitude: -73.5 },
  destinationLocation: { latitude: 45.6, longitude: -73.6 },
  selectedPlanId: 'classic',
  pickupAddress: 'A',
  destinationAddress: 'B',
  tripType: 'one_way',
  selectedWeekdays: [1],
  departureTime: '08:00',
  returnTime: null,
  passengerCount: 1,
  notes: null,
  stripeCustomerId: 'cus_1',
};

describe('renewPersonalDriverSubscriptionPayment', () => {
  let transactionData: Record<string, unknown> | undefined;
  let lockData: Record<string, unknown> | undefined;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(Date.parse('2026-08-03T12:00:00.000Z'));
    jest.clearAllMocks();
    mockCallableOptions.length = 0;
    sourceRef.get.mockResolvedValue({ exists: true, data: () => sourceSubscription });
    newRef.get.mockResolvedValue({ exists: false });
    transactionData = undefined;
    lockData = undefined;
    mockTransaction.get.mockImplementation(async (ref) => {
      const data = ref === lockRef ? lockData : transactionData;
      return data ? { exists: true, data: () => data } : { exists: false };
    });
    mockTransaction.create.mockImplementation((ref, data) => {
      if (ref === lockRef) {
        lockData = data;
      } else {
        transactionData = data;
        newRef.get.mockResolvedValue({ exists: true, data: () => transactionData });
      }
    });
    mockTransaction.update.mockImplementation((ref, data) => {
      if (ref === lockRef) {
        lockData = { ...lockData, ...data };
      } else {
        transactionData = { ...transactionData, ...data };
        newRef.get.mockResolvedValue({
          exists: true,
          data: () => ({ ...sourceSubscription, ...transactionData }),
        });
      }
    });
    mockTransaction.delete.mockImplementation((ref) => {
      if (ref === lockRef) lockData = undefined;
    });
    mockCalculateServerRoute.mockResolvedValue({ distanceKm: 10, durationMinutes: 20 });
    mockResolveAddressCoordinates.mockResolvedValue({ latitude: 45.6, longitude: -73.6 });
    mockStripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_renew_1',
      client_secret: 'pi_renew_1_secret',
    });
    mockStripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_renew_1',
      client_secret: 'pi_renew_1_secret',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('declares Stripe and Google Maps secrets for deployment', () => {
    require('../renewSubscriptionPayment');

    const options = mockCallableOptions[0] as { secrets?: Array<{ name: string }> };
    expect(options.secrets?.map((secret) => secret.name)).toEqual([
      'STRIPE_SECRET_KEY',
      'GOOGLE_MAPS_API_KEY',
    ]);
  });

  it('chains an active renewal, resets quotas, and replays the same payment', async () => {
    const { renewPersonalDriverSubscriptionPayment } = require('../renewSubscriptionPayment');

    const first = await renewPersonalDriverSubscriptionPayment(makeRequest({
      sourceSubscriptionId: 'sub_old',
      requestId: 'renew_1',
    }));
    const second = await renewPersonalDriverSubscriptionPayment(makeRequest({
      sourceSubscriptionId: 'sub_old',
      requestId: 'renew_1',
    }));

    expect(first).toEqual({
      subscriptionId: expect.any(String),
      paymentIntentId: 'pi_renew_1',
      clientSecret: 'pi_renew_1_secret',
      amount: 450,
      currency: 'cad',
      quote: {
        distanceOneWayKm: 10,
        distanceReturnKm: 0,
        monthlyDistanceKm: 50,
        selectedPlanPrice: expect.objectContaining({
          planId: 'classic',
          totalBeforeTax: 450,
        }),
        taxAmount: 0,
        totalAmount: 450,
        currency: 'cad',
      },
    });
    expect(second).toEqual(first);
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    expect(mockTransaction.update).toHaveBeenCalledWith(
      newRef,
      expect.objectContaining({
        periodStartDate: '2026-08-31',
        periodEndDateExclusive: '2026-09-30',
        monthlyDistanceKm: 50,
        monthlyDistanceKmRemaining: 50,
        specialTripsUsed: 0,
        specialTripsDistanceUsedKm: 0,
        taxStatus: 'pending_confirmation',
        paymentStatus: 'pending',
      }),
    );
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: first.quote.totalAmount * 100 }),
      expect.any(Object),
    );
    expect(first.amount).toBe(first.quote.totalAmount);
  });

  it('starts an expired renewal on the current local service date', async () => {
    const { renewPersonalDriverSubscriptionPayment } = require('../renewSubscriptionPayment');
    sourceRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        ...sourceSubscription,
        status: 'expired',
        periodStartDate: '2026-07-01',
        periodEndDateExclusive: '2026-07-31',
        periodStartAtUtc: new Date('2026-07-01T04:00:00.000Z'),
        periodEndAtUtc: new Date('2026-07-31T04:00:00.000Z'),
      }),
    });

    await renewPersonalDriverSubscriptionPayment(makeRequest({
      sourceSubscriptionId: 'sub_old',
      requestId: 'renew_expired',
    }));

    expect(mockTransaction.update).toHaveBeenCalledWith(
      newRef,
      expect.objectContaining({
        periodStartDate: '2026-08-03',
        periodEndDateExclusive: '2026-09-02',
      }),
    );
  });

  it('recovers a saved pending renewal by its target period after the source-period boundary', async () => {
    jest.setSystemTime(Date.parse('2026-09-05T05:00:00.000Z'));
    transactionData = {
      id: 'sub_new',
      userId: 'user_1',
      sourceSubscriptionId: 'sub_old',
      status: 'pending_payment',
      paymentStatus: 'pending',
      periodStartDate: '2026-08-31',
      stripePaymentIntentId: 'pi_renew_1',
      distanceOneWayKm: 10,
      distanceReturnKm: 0,
      monthlyDistanceKm: 50,
      selectedPlanPrice: { planId: 'classic', totalBeforeTax: 450 },
      taxAmount: 0,
      totalAmount: 450,
      currency: 'cad',
    };
    lockData = {
      userId: 'user_1',
      periodStartDate: '2026-08-31',
      subscriptionId: 'sub_new',
      state: 'pending_payment',
      ownerId: 'owner_1',
      attempt: 1,
      paymentIntentId: 'pi_renew_1',
    };
    newRef.get.mockResolvedValue({ exists: true, data: () => transactionData });
    mockCalculateServerRoute.mockClear();
    const { renewPersonalDriverSubscriptionPayment } = require('../renewSubscriptionPayment');

    await expect(renewPersonalDriverSubscriptionPayment(makeRequest({
      sourceSubscriptionId: 'sub_old',
      requestId: 'recover-sub_new',
      pendingSubscriptionId: 'sub_new',
    }))).resolves.toEqual(expect.objectContaining({
      subscriptionId: 'sub_new',
      paymentIntentId: 'pi_renew_1',
      clientSecret: 'pi_renew_1_secret',
    }));

    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_renew_1');
    expect(mockCalculateServerRoute).not.toHaveBeenCalled();
  });

  it('reclaims an expired creating renewal during reload recovery and completes its payment', async () => {
    transactionData = {
      id: 'sub_new',
      userId: 'user_1',
      sourceSubscriptionId: 'sub_old',
      status: 'pending_payment',
      paymentStatus: 'creating',
      periodStartDate: '2026-08-31',
      paymentCreationOwnerId: 'expired_owner',
      paymentCreationClaimedAt: new Date(Date.now() - (60 * 60 * 1000)),
      paymentCreationAttempt: 1,
    };
    lockData = {
      userId: 'user_1',
      periodStartDate: '2026-08-31',
      subscriptionId: 'sub_new',
      state: 'creating',
      ownerId: 'expired_owner',
      attempt: 1,
      leaseExpiresAt: new Date(Date.now() - 1),
    };
    newRef.get.mockResolvedValue({ exists: true, data: () => transactionData });
    const { renewPersonalDriverSubscriptionPayment } = require('../renewSubscriptionPayment');

    await expect(renewPersonalDriverSubscriptionPayment(makeRequest({
      sourceSubscriptionId: 'sub_old',
      requestId: 'recover-sub_new',
      pendingSubscriptionId: 'sub_new',
    }))).resolves.toEqual(expect.objectContaining({
      subscriptionId: 'sub_new',
      paymentIntentId: 'pi_renew_1',
      clientSecret: 'pi_renew_1_secret',
    }));

    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    expect(transactionData).toMatchObject({
      id: 'sub_new',
      status: 'pending_payment',
      paymentStatus: 'pending',
      paymentCreationAttempt: 1,
      stripePaymentIntentId: 'pi_renew_1',
    });
    expect(transactionData?.paymentCreationOwnerId).not.toBe('expired_owner');
    expect(lockData).toMatchObject({
      subscriptionId: 'sub_new',
      state: 'pending_payment',
      attempt: 1,
      paymentIntentId: 'pi_renew_1',
    });
  });

  it('rejects an active source whose payment is not succeeded', async () => {
    const { renewPersonalDriverSubscriptionPayment } = require('../renewSubscriptionPayment');
    mockStripe.paymentIntents.create.mockClear();
    sourceRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ ...sourceSubscription, paymentStatus: 'pending' }),
    });

    await expect(renewPersonalDriverSubscriptionPayment(makeRequest({
      sourceSubscriptionId: 'sub_old',
      requestId: 'renew_invalid_payment',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('rejects a renewal whose recurring return time is not after departure', async () => {
    const { renewPersonalDriverSubscriptionPayment } = require('../renewSubscriptionPayment');
    sourceRef.get.mockResolvedValue({
      exists: true,
      data: () => ({
        ...sourceSubscription,
        tripType: 'round_trip',
        returnTime: '07:30',
      }),
    });

    await expect(renewPersonalDriverSubscriptionPayment(makeRequest({
      sourceSubscriptionId: 'sub_old',
      requestId: 'renew_invalid_schedule',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('returns the same payment when the same request is already being created', async () => {
    jest.useRealTimers();
    mockStripe.paymentIntents.retrieve.mockImplementation(async (paymentIntentId: string) => ({
      id: paymentIntentId,
      client_secret: `${paymentIntentId}_secret`,
    }));
    let releasePayment: ((paymentIntent: { id: string; client_secret: string }) => void) | undefined;
    const paymentCreated = new Promise<void>((resolve) => {
      mockStripe.paymentIntents.create.mockImplementationOnce(() => {
        resolve();
        return new Promise((paymentIntentResolve) => {
          releasePayment = paymentIntentResolve;
        });
      });
    });

    const { renewPersonalDriverSubscriptionPayment } = require('../renewSubscriptionPayment');
    const firstRequest = renewPersonalDriverSubscriptionPayment(makeRequest({
      sourceSubscriptionId: 'sub_old',
      requestId: 'renew_concurrent',
    }));
    await paymentCreated;
    const secondRequest = renewPersonalDriverSubscriptionPayment(makeRequest({
      sourceSubscriptionId: 'sub_old',
      requestId: 'renew_concurrent',
    }));

    await new Promise((resolve) => setTimeout(resolve, 25));
    releasePayment?.({ id: 'pi_renew_concurrent', client_secret: 'pi_renew_concurrent_secret' });
    await expect(firstRequest).resolves.toEqual(expect.objectContaining({ paymentIntentId: 'pi_renew_concurrent' }));
    await expect(secondRequest).resolves.toEqual(expect.objectContaining({ paymentIntentId: 'pi_renew_concurrent' }));
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
  });

  it('keeps distinct renewal request IDs on one pending renewal PaymentIntent', async () => {
    jest.useRealTimers();
    const pendingRenewals = new Map<string, Record<string, unknown>>();
    mockDb.collection.mockImplementation((name: string) => ({
      doc: (id: string) => name === 'personal_driver_subscriptions'
        ? (id === 'sub_old' ? sourceRef : {
          id,
          get: async () => {
            const data = pendingRenewals.get(id);
            return data ? { exists: true, data: () => data } : { exists: false };
          },
        })
        : { id },
    }));
    mockDb.runTransaction.mockImplementation(async (callback: (transaction: typeof mockTransaction) => Promise<unknown>) => {
      mockTransaction.get.mockImplementation(async (ref: { id: string }) => {
        const data = pendingRenewals.get(ref.id);
        return data ? { exists: true, data: () => data } : { exists: false };
      });
      mockTransaction.create.mockImplementation((ref: { id: string }, data: Record<string, unknown>) => {
        pendingRenewals.set(ref.id, data);
      });
      mockTransaction.update.mockImplementation((ref: { id: string }, data: Record<string, unknown>) => {
        pendingRenewals.set(ref.id, { ...pendingRenewals.get(ref.id), ...data });
      });
      mockTransaction.delete.mockImplementation((ref: { id: string }) => {
        pendingRenewals.delete(ref.id);
      });
      return callback(mockTransaction);
    });
    const { renewPersonalDriverSubscriptionPayment } = require('../renewSubscriptionPayment');
    let releasePayment: ((paymentIntent: { id: string; client_secret: string }) => void) | undefined;
    const paymentCreationStarted = new Promise<void>((resolve) => {
      mockStripe.paymentIntents.create.mockImplementationOnce(() => {
        resolve();
        return new Promise((paymentIntentResolve) => {
          releasePayment = paymentIntentResolve;
        });
      });
    });

    const firstRequest = renewPersonalDriverSubscriptionPayment(makeRequest({
      sourceSubscriptionId: 'sub_old',
      requestId: 'renew_first',
    }));
    await paymentCreationStarted;
    const secondRequest = renewPersonalDriverSubscriptionPayment(makeRequest({
      sourceSubscriptionId: 'sub_old',
      requestId: 'renew_second',
    }));
    releasePayment?.({ id: 'pi_renew_1', client_secret: 'pi_renew_1_secret' });
    const [first, second] = await Promise.all([firstRequest, secondRequest]);

    expect(second).toEqual(first);
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
  });
});
