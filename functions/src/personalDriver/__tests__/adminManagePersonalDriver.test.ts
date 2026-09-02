export {};

const mockSubRef = { id: 'sub_1', update: jest.fn() };
const mockTripRef = { id: 'trip_1' };
const mockDriverRef = { id: 'driver_1' };
const mockVehicleRef = { id: 'veh_1' };
const mockLockRef = { id: 'period_lock_1' };
const mockAdminRef = { get: jest.fn() };
const mockPlanRef = { id: 'premium', set: jest.fn() };
const mockNotificationRef = { id: 'notification_1' };
const mockStripeRetrieve = jest.fn();
const mockStripeCancel = jest.fn();
const mockStripe = {
  paymentIntents: {
    retrieve: mockStripeRetrieve,
    cancel: mockStripeCancel,
  },
};
const mockAssignedTripsQuery: { where: jest.Mock } = { where: jest.fn() };
mockAssignedTripsQuery.where.mockReturnValue(mockAssignedTripsQuery);
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
  set: jest.fn(),
  delete: jest.fn(),
};
const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === 'admins') return { doc: jest.fn(() => mockAdminRef) };
    if (name === 'drivers') return { doc: jest.fn(() => mockDriverRef) };
    if (name === 'vehicles') return { doc: jest.fn(() => mockVehicleRef) };
    if (name === 'personal_driver_subscriptions') return { doc: jest.fn(() => mockSubRef) };
    if (name === 'personal_driver_subscription_locks') return { doc: jest.fn(() => mockLockRef) };
    if (name === 'personal_driver_plans') return { doc: jest.fn(() => mockPlanRef) };
    if (name === 'personal_driver_trips') {
      return {
        doc: jest.fn(() => mockTripRef),
        where: jest.fn(() => mockAssignedTripsQuery),
      };
    }
    if (name === 'notifications') return { doc: jest.fn((id?: string) => id ? { id } : mockNotificationRef) };
    throw new Error(`Unexpected collection ${name}`);
  }),
  runTransaction: jest.fn((callback: (tx: typeof mockTransaction) => Promise<unknown>) => callback(mockTransaction)),
};

jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(() => mockDb), {
    FieldValue: {
      delete: jest.fn(() => ({ __delete: true })),
      serverTimestamp: jest.fn(() => ({ __ts: true })),
    },
  }),
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
  defineSecret: jest.fn(() => ({ value: jest.fn(() => 'sk_test_123') })),
}));

jest.mock('../../stripe/stripe-client', () => ({
  createStripeClient: jest.fn(() => mockStripe),
}));

jest.mock('../entitlement', () => ({
  isSubscriptionEntitled: mockIsSubscriptionEntitled,
  markExpiredSubscriptionInTransaction: mockMarkExpiredSubscriptionInTransaction,
}));

function makeRequest(data: unknown, uid?: string) {
  return { data, auth: uid ? { uid } : undefined } as never;
}

function validPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'premium',
    name: 'Premium',
    badge: 'Service prioritaire',
    promise: 'Un service privilégie, chaque jour',
    pricePerKm: 1.1,
    minimumBillableKm: 591,
    minimumAmount: 650,
    allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    includedRegularWaitMinutes: 10,
    includedSpecialTrips: 4,
    benefits: ['Service 7j/7', '10 min attente gratuites'],
    ...overrides,
  };
}

describe('adminManagePersonalDriver', () => {
  let tripData: Record<string, unknown>;
  let subscriptionData: Record<string, unknown>;
  let driverData: Record<string, unknown>;
  let vehicleData: Record<string, unknown>;
  let lockData: Record<string, unknown>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminRef.get.mockResolvedValue({ exists: true });
    tripData = { userId: 'user_1', subscriptionId: 'sub_1', status: 'scheduled' };
    subscriptionData = {
      status: 'active',
      paymentStatus: 'succeeded',
      periodStartAtUtc: new Date('2026-01-01T00:00:00.000Z'),
      periodEndAtUtc: new Date('2027-01-01T00:00:00.000Z'),
    };
    driverData = { status: 'approved', isAvailable: true };
    vehicleData = { status: 'available', isAvailable: true };
    lockData = { subscriptionId: 'sub_1', state: 'pending_payment', paymentIntentId: 'pi_pending' };
    mockStripeRetrieve.mockResolvedValue({
      id: 'pi_pending',
      status: 'requires_action',
      metadata: { purpose: 'personal_driver_subscription', subscriptionId: 'sub_1', userId: 'user_1' },
    });
    mockStripeCancel.mockResolvedValue({ id: 'pi_pending', status: 'canceled' });
    mockTransaction.get.mockImplementation(async (ref: unknown) => {
      if (ref === mockTripRef) return { exists: true, data: () => tripData };
      if (ref === mockDriverRef) return { exists: true, data: () => driverData };
      if (ref === mockVehicleRef) return { exists: true, data: () => vehicleData };
      if (ref === mockLockRef) return { exists: true, data: () => lockData };
      if (ref === mockAssignedTripsQuery) return { docs: [{ id: 'trip_1' }] };
      return { exists: true, data: () => subscriptionData };
    });
    mockTransaction.update.mockImplementation((_ref: unknown, update: Record<string, unknown>) => {
      if (_ref === mockTripRef) Object.assign(tripData, update);
    });
  });

  it('rejects unauthenticated requests', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    await expect(adminManagePersonalDriver(makeRequest({ action: 'assignTrip', tripId: 'trip_1', driverId: 'driver_1', vehicleId: 'veh_1' })))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects manual subscription validation for admin users', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    await expect(adminManagePersonalDriver(makeRequest({ action: 'validateSubscription', subscriptionId: 'sub_1' }, 'admin_1')))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects unauthenticated plan updates', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'updatePlan',
      plan: validPlan(),
    }))).rejects.toMatchObject({ code: 'unauthenticated' });

    expect(mockPlanRef.set).not.toHaveBeenCalled();
  });

  it('rejects non-admin plan updates before writing', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    mockAdminRef.get.mockResolvedValueOnce({ exists: false });

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'updatePlan',
      plan: validPlan(),
    }, 'driver_1'))).rejects.toMatchObject({ code: 'permission-denied' });

    expect(mockPlanRef.set).not.toHaveBeenCalled();
  });

  it('saves audited plan updates with server timestamp merge', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'updatePlan',
      plan: validPlan({ name: ' Premium ', benefits: [' Priorité maximale '] }),
    }, 'admin_1'))).resolves.toEqual({ success: true, planId: 'premium' });

    expect(mockPlanRef.set).toHaveBeenCalledWith(expect.objectContaining({
      id: 'premium',
      name: 'Premium',
      benefits: ['Priorité maximale'],
      updatedAt: { __ts: true },
      updatedBy: 'admin_1',
    }), { merge: true });
  });

  it('clears an empty badge during merge plan updates', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'updatePlan',
      plan: validPlan({ badge: '' }),
    }, 'admin_1'))).resolves.toEqual({ success: true, planId: 'premium' });

    expect(mockPlanRef.set).toHaveBeenCalledWith(expect.objectContaining({
      badge: { __delete: true },
    }), { merge: true });
  });

  it('rejects plan updates for unknown fixed IDs', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'updatePlan',
      plan: validPlan({ id: 'enterprise' }),
    }, 'admin_1'))).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'Identifiant de forfait invalide.',
    });

    expect(mockPlanRef.set).not.toHaveBeenCalled();
  });

  it('rejects plan updates with negative numbers', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'updatePlan',
      plan: validPlan({ pricePerKm: -1 }),
    }, 'admin_1'))).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'Le prix par km doit être compris entre 0 et 1000.',
    });

    expect(mockPlanRef.set).not.toHaveBeenCalled();
  });

  it('rejects plan updates with duplicate weekdays', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'updatePlan',
      plan: validPlan({ allowedWeekdays: [1, 1, 2] }),
    }, 'admin_1'))).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'Les jours autorisés doivent être uniques.',
    });

    expect(mockPlanRef.set).not.toHaveBeenCalled();
  });

  it('rejects plan updates with empty benefits', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'updatePlan',
      plan: validPlan({ benefits: ['Service 7j/7', ''] }),
    }, 'admin_1'))).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'Chaque avantage doit contenir entre 1 et 200 caractères.',
    });

    expect(mockPlanRef.set).not.toHaveBeenCalled();
  });

  it('cancels a trip through the shared operational cancellation path', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    tripData.status = 'driver_assigned';
    tripData.assignedDriverId = 'driver_1';
    tripData.assignedVehicleId = 'vehicle_1';
    driverData.isAvailable = false;
    driverData.availabilityStatus = 'busy_personal_driver';
    driverData.activePersonalDriverTripId = 'trip_1';

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'cancelTrip', tripId: 'trip_1', reason: 'Incident opérationnel',
    }, 'admin_1'))).resolves.toEqual({ success: true });

    expect(mockTransaction.update).toHaveBeenCalledWith(mockTripRef, expect.objectContaining({
      status: 'cancelled',
      cancelledBy: 'admin',
      assignedDriverId: null,
      assignedVehicleId: null,
    }));
    expect(mockTransaction.update).toHaveBeenCalledWith(mockDriverRef, expect.objectContaining({
      isAvailable: true,
      availabilityStatus: 'available',
    }));
  });

  it('rejects cancellation of a paid active subscription without inventing a refund path', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'cancelSubscription', subscriptionId: 'sub_1', reason: 'Demande client',
    }, 'admin_1'))).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(mockTransaction.update).not.toHaveBeenCalled();
    expect(mockTransaction.delete).not.toHaveBeenCalled();
  });

  it('cancels an unpaid pending subscription and releases its matching period lock', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    subscriptionData = {
      userId: 'user_1',
      periodStartDate: '2026-08-01',
      status: 'pending_payment',
      paymentStatus: 'pending',
      stripePaymentIntentId: 'pi_pending',
    };

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'cancelSubscription', subscriptionId: 'sub_1', reason: 'Abandon avant paiement',
    }, 'admin_1'))).resolves.toEqual({ success: true });

    expect(mockDb.runTransaction).toHaveBeenCalledTimes(2);
    expect(mockStripeRetrieve).toHaveBeenCalledWith('pi_pending');
    expect(mockStripeCancel).toHaveBeenCalledWith('pi_pending');
    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubRef, expect.objectContaining({
      status: 'cancelled',
      paymentStatus: 'cancelled',
      cancelledBy: 'admin_1',
    }));
    expect(mockTransaction.delete).toHaveBeenCalledWith(mockLockRef);
  });

  it('completes admin audit fields when the matching cancellation webhook wins the race', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    subscriptionData = {
      userId: 'user_1',
      periodStartDate: '2026-08-01',
      status: 'pending_payment',
      paymentStatus: 'pending',
      stripePaymentIntentId: 'pi_pending',
    };
    let transactionCall = 0;
    mockDb.runTransaction.mockImplementation(async (callback: (tx: typeof mockTransaction) => Promise<unknown>) => {
      transactionCall += 1;
      if (transactionCall === 2) {
        subscriptionData = {
          userId: 'user_1',
          periodStartDate: '2026-08-01',
          status: 'cancelled',
          paymentStatus: 'cancelled',
          stripePaymentIntentId: 'pi_pending',
        };
      }
      return callback(mockTransaction);
    });

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'cancelSubscription', subscriptionId: 'sub_1', reason: 'Abandon avant paiement',
    }, 'admin_1'))).resolves.toEqual({ success: true });

    expect(mockTransaction.delete).not.toHaveBeenCalled();
    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubRef, expect.objectContaining({
      status: 'cancelled',
      paymentStatus: 'cancelled',
      cancelledAt: { __ts: true },
      cancelledBy: 'admin_1',
      cancelReason: 'Abandon avant paiement',
      updatedAt: { __ts: true },
    }));
  });

  it('preserves the first admin audit when the matching cancelled subscription is retried', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    subscriptionData = {
      userId: 'user_1',
      periodStartDate: '2026-08-01',
      status: 'pending_payment',
      paymentStatus: 'pending',
      stripePaymentIntentId: 'pi_pending',
    };
    let transactionCall = 0;
    mockDb.runTransaction.mockImplementation(async (callback: (tx: typeof mockTransaction) => Promise<unknown>) => {
      transactionCall += 1;
      if (transactionCall === 2) {
        subscriptionData = {
          userId: 'user_1',
          periodStartDate: '2026-08-01',
          status: 'cancelled',
          paymentStatus: 'cancelled',
          stripePaymentIntentId: 'pi_pending',
          cancelledAt: 'FIRST_CANCELLED_AT',
          cancelledBy: 'admin_original',
          cancelReason: 'Première raison',
          updatedAt: 'FIRST_UPDATED_AT',
        };
      }
      return callback(mockTransaction);
    });

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'cancelSubscription', subscriptionId: 'sub_1', reason: 'Nouvelle raison',
    }, 'admin_retry'))).resolves.toEqual({ success: true });

    expect(mockTransaction.delete).not.toHaveBeenCalled();
    expect(mockTransaction.update).not.toHaveBeenCalledWith(mockSubRef, expect.anything());
  });

  it('rejects a webhook-wins cancellation whose payment identity changed', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    subscriptionData = {
      userId: 'user_1',
      periodStartDate: '2026-08-01',
      status: 'pending_payment',
      paymentStatus: 'pending',
      stripePaymentIntentId: 'pi_pending',
    };
    let transactionCall = 0;
    mockDb.runTransaction.mockImplementation(async (callback: (tx: typeof mockTransaction) => Promise<unknown>) => {
      transactionCall += 1;
      if (transactionCall === 2) {
        subscriptionData = {
          userId: 'user_1',
          periodStartDate: '2026-08-01',
          status: 'cancelled',
          paymentStatus: 'cancelled',
          stripePaymentIntentId: 'pi_other',
        };
      }
      return callback(mockTransaction);
    });

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'cancelSubscription', subscriptionId: 'sub_1', reason: 'Abandon avant paiement',
    }, 'admin_1'))).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(mockTransaction.delete).not.toHaveBeenCalled();
    expect(mockTransaction.update).not.toHaveBeenCalledWith(mockSubRef, expect.objectContaining({
      cancelledBy: 'admin_1',
    }));
  });

  it('does not release a pending subscription whose payment settled before cancellation', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    subscriptionData = {
      userId: 'user_1',
      periodStartDate: '2026-08-01',
      status: 'pending_payment',
      paymentStatus: 'pending',
      stripePaymentIntentId: 'pi_pending',
    };
    mockStripeRetrieve.mockResolvedValue({
      id: 'pi_pending',
      status: 'succeeded',
      metadata: { purpose: 'personal_driver_subscription', subscriptionId: 'sub_1', userId: 'user_1' },
    });

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'cancelSubscription', subscriptionId: 'sub_1', reason: 'Trop tard',
    }, 'admin_1'))).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(mockStripeCancel).not.toHaveBeenCalled();
    expect(mockTransaction.delete).not.toHaveBeenCalled();
    expect(mockTransaction.update).not.toHaveBeenCalledWith(mockSubRef, expect.objectContaining({
      status: 'cancelled',
    }));
  });

  it('does not release the lock when payment succeeds during Stripe cancellation', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    subscriptionData = {
      userId: 'user_1',
      periodStartDate: '2026-08-01',
      status: 'pending_payment',
      paymentStatus: 'pending',
      stripePaymentIntentId: 'pi_pending',
    };
    mockStripeRetrieve
      .mockResolvedValueOnce({
        id: 'pi_pending',
        status: 'requires_action',
        metadata: { purpose: 'personal_driver_subscription', subscriptionId: 'sub_1', userId: 'user_1' },
      })
      .mockResolvedValueOnce({
        id: 'pi_pending',
        status: 'succeeded',
        metadata: { purpose: 'personal_driver_subscription', subscriptionId: 'sub_1', userId: 'user_1' },
      });
    mockStripeCancel.mockRejectedValue(new Error('PaymentIntent already succeeded'));

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'cancelSubscription', subscriptionId: 'sub_1', reason: 'Course Stripe',
    }, 'admin_1'))).rejects.toMatchObject({ code: 'failed-precondition' });

    expect(mockStripeRetrieve).toHaveBeenCalledTimes(2);
    expect(mockTransaction.delete).not.toHaveBeenCalled();
    expect(mockTransaction.update).not.toHaveBeenCalledWith(mockSubRef, expect.objectContaining({
      status: 'cancelled',
    }));
  });

  it('assigns a driver only after reading trip, driver, and subscription in one transaction', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'assignTrip', tripId: 'trip_1', driverId: 'driver_1', vehicleId: 'veh_1',
    }, 'admin_1'))).resolves.toEqual({ success: true });

    expect(mockDb.runTransaction).toHaveBeenCalledTimes(1);
    expect(mockTransaction.get).toHaveBeenCalledWith(mockTripRef);
    expect(mockTransaction.get).toHaveBeenCalledWith(mockSubRef);
    expect(mockTransaction.get).toHaveBeenCalledWith(mockDriverRef);
    expect(mockTransaction.get).toHaveBeenCalledWith(mockVehicleRef);
    expect(mockTransaction.update).toHaveBeenCalledWith(mockTripRef, expect.objectContaining({
      assignedDriverId: 'driver_1',
      status: 'driver_assigned',
    }));
    expect(mockTransaction.set).toHaveBeenCalledWith(mockNotificationRef, expect.objectContaining({
      userId: 'driver_1',
      type: 'personal_driver_trip_assigned_driver',
    }));
  });

  it('rejects assignment when the transaction observes an unpaid package', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    subscriptionData.paymentStatus = 'pending';

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'assignTrip', tripId: 'trip_1', driverId: 'driver_1', vehicleId: 'veh_1',
    }, 'admin_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.update).not.toHaveBeenCalled();
  });

  it('rejects assignment to a driver that is unavailable in the transaction', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    driverData.isAvailable = false;

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'assignTrip', tripId: 'trip_1', driverId: 'driver_1', vehicleId: 'veh_1',
    }, 'admin_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.update).not.toHaveBeenCalled();
  });

  it('rejects assignment to an unavailable vehicle in the transaction', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    vehicleData.status = 'maintenance';

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'assignTrip', tripId: 'trip_1', driverId: 'driver_1', vehicleId: 'veh_1',
    }, 'admin_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.update).not.toHaveBeenCalledWith(mockTripRef, expect.anything());
  });

  it('marks an expired subscription before rejecting assignment', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    subscriptionData.periodEndAtUtc = new Date('2026-08-01T00:00:00.000Z');

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'assignTrip', tripId: 'trip_1', driverId: 'driver_1', vehicleId: 'veh_1',
    }, 'admin_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.update).toHaveBeenCalledWith(mockSubRef, expect.objectContaining({
      status: 'expired',
    }));
    expect(mockTransaction.update).not.toHaveBeenCalledWith(mockTripRef, expect.anything());
  });

  it('rejects assignment when the driver already has another trip scheduled within 60 minutes', async () => {
    const { adminManagePersonalDriver } = require('../adminManagePersonalDriver');
    tripData.scheduledAtIso = '2026-08-12T10:00:00.000Z';
    const collidingTripDoc = {
      id: 'trip_colliding',
      data: () => ({ scheduledAtIso: '2026-08-12T10:30:00.000Z', status: 'driver_assigned' }),
    };
    mockTransaction.get.mockImplementation(async (ref: unknown) => {
      if (ref === mockTripRef) return { exists: true, data: () => tripData };
      if (ref === mockDriverRef) return { exists: true, data: () => driverData };
      if (ref === mockVehicleRef) return { exists: true, data: () => vehicleData };
      if (ref === mockAssignedTripsQuery) return { docs: [collidingTripDoc] };
      return { exists: true, data: () => subscriptionData };
    });

    await expect(adminManagePersonalDriver(makeRequest({
      action: 'assignTrip', tripId: 'trip_1', driverId: 'driver_1', vehicleId: 'veh_1',
    }, 'admin_1'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mockTransaction.update).not.toHaveBeenCalledWith(mockTripRef, expect.anything());
  });
});
