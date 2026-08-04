import { createHash } from 'node:crypto';
import {
  activateSubscriptionPeriodLock,
  claimSubscriptionPeriodLock,
  createSubscriptionPeriodLockId,
  createSubscriptionPeriodLockStripeIdempotencyKey,
  markSubscriptionPeriodLockPendingPayment,
  releaseSubscriptionPeriodLock,
} from '../subscriptionPeriodLock';

type StoredDocument = Record<string, unknown>;
type TestRef = { collection: string; id: string };

function createFirestore(initial: Record<string, StoredDocument> = {}) {
  const documents = new Map(Object.entries(initial));
  const keyFor = (ref: TestRef) => `${ref.collection}/${ref.id}`;
  const transaction = {
    get: jest.fn(async (ref: TestRef) => {
      const data = documents.get(keyFor(ref));
      return {
        exists: !!data,
        data: () => data,
      };
    }),
    create: jest.fn((ref: TestRef, data: StoredDocument) => {
      documents.set(keyFor(ref), data);
    }),
    update: jest.fn((ref: TestRef, data: StoredDocument) => {
      documents.set(keyFor(ref), { ...documents.get(keyFor(ref)), ...data });
    }),
    delete: jest.fn((ref: TestRef) => {
      documents.delete(keyFor(ref));
    }),
  };
  const db = {
    collection: jest.fn((collection: string) => ({
      doc: (id: string): TestRef => ({ collection, id }),
    })),
  };
  return { db, documents, transaction };
}

describe('subscriptionPeriodLock', () => {
  const userId = 'user_123';
  const periodStartDate = '2026-08-04';
  const now = new Date('2026-08-03T12:00:00.000Z');

  it('derives the lock ID and Stripe key deterministically from the user-period lock identity', () => {
    const lockId = createSubscriptionPeriodLockId(userId, periodStartDate);

    expect(lockId).toBe(createHash('sha256').update(`${userId}\0${periodStartDate}`).digest('hex'));
    expect(createSubscriptionPeriodLockStripeIdempotencyKey(lockId, 'subscription_1', 1)).toBe(
      createSubscriptionPeriodLockStripeIdempotencyKey(lockId, 'subscription_1', 1),
    );
    expect(createSubscriptionPeriodLockStripeIdempotencyKey(lockId, 'subscription_1', 1)).not.toBe(
      createSubscriptionPeriodLockStripeIdempotencyKey(lockId, 'subscription_2', 1),
    );
    expect(createSubscriptionPeriodLockStripeIdempotencyKey(lockId, 'subscription_1', 1)).not.toBe(
      createSubscriptionPeriodLockStripeIdempotencyKey(lockId, 'subscription_1', 2),
    );
  });

  it('claims a new user-period with a ten-minute creating lease and ownership attempt', async () => {
    const { db, documents, transaction } = createFirestore();

    const result = await claimSubscriptionPeriodLock(transaction as never, db as never, {
      userId,
      periodStartDate,
      requestedSubscriptionId: 'subscription_1',
      ownerId: 'owner_1',
      now,
    });

    expect(result).toMatchObject({
      kind: 'claimed',
      subscriptionId: 'subscription_1',
      ownerId: 'owner_1',
      attempt: 1,
    });
    expect(documents.get(`personal_driver_subscription_locks/${result.lockId}`)).toEqual({
      userId,
      periodStartDate,
      subscriptionId: 'subscription_1',
      state: 'creating',
      ownerId: 'owner_1',
      attempt: 1,
      leaseExpiresAt: new Date('2026-08-03T12:10:00.000Z'),
      updatedAt: now,
    });
  });

  it.each(['pending_payment', 'active'] as const)(
    'returns the existing %s lock without reclaiming it',
    async (state) => {
      const lockId = createSubscriptionPeriodLockId(userId, periodStartDate);
      const { db, transaction } = createFirestore({
        [`personal_driver_subscription_locks/${lockId}`]: {
          userId,
          periodStartDate,
          subscriptionId: 'subscription_existing',
          state,
          attempt: 2,
        },
      });

      const result = await claimSubscriptionPeriodLock(transaction as never, db as never, {
        userId,
        periodStartDate,
        requestedSubscriptionId: 'subscription_new',
        ownerId: 'owner_new',
        now,
      });

      expect(result).toMatchObject({
        kind: 'existing',
        subscriptionId: 'subscription_existing',
        state,
        attempt: 2,
      });
      expect(transaction.update).not.toHaveBeenCalled();
    },
  );

  it('does not steal an unexpired creating lock', async () => {
    const lockId = createSubscriptionPeriodLockId(userId, periodStartDate);
    const { db, transaction } = createFirestore({
      [`personal_driver_subscription_locks/${lockId}`]: {
        userId,
        periodStartDate,
        subscriptionId: 'subscription_existing',
        state: 'creating',
        ownerId: 'owner_existing',
        attempt: 1,
        leaseExpiresAt: new Date('2026-08-03T12:05:00.000Z'),
      },
      'personal_driver_subscriptions/subscription_existing': {
        userId,
        periodStartDate,
        paymentStatus: 'creating',
      },
    });

    await expect(claimSubscriptionPeriodLock(transaction as never, db as never, {
      userId,
      periodStartDate,
      requestedSubscriptionId: 'subscription_new',
      ownerId: 'owner_new',
      now,
    })).resolves.toMatchObject({
      kind: 'existing',
      subscriptionId: 'subscription_existing',
      state: 'creating',
    });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('reclaims expired creating work under a new owner while preserving the subscription and Stripe identity', async () => {
    const lockId = createSubscriptionPeriodLockId(userId, periodStartDate);
    const { db, documents, transaction } = createFirestore({
      [`personal_driver_subscription_locks/${lockId}`]: {
        userId,
        periodStartDate,
        subscriptionId: 'subscription_existing',
        state: 'creating',
        ownerId: 'owner_existing',
        attempt: 1,
        leaseExpiresAt: new Date('2026-08-03T11:59:59.999Z'),
      },
      'personal_driver_subscriptions/subscription_existing': {
        userId,
        periodStartDate,
        paymentStatus: 'creating',
      },
    });

    const result = await claimSubscriptionPeriodLock(transaction as never, db as never, {
      userId,
      periodStartDate,
      requestedSubscriptionId: 'subscription_new',
      ownerId: 'owner_new',
      now,
    });

    expect(result).toMatchObject({
      kind: 'claimed',
      subscriptionId: 'subscription_existing',
      ownerId: 'owner_new',
      attempt: 1,
    });
    expect(documents.get(`personal_driver_subscription_locks/${lockId}`)).toMatchObject({
      subscriptionId: 'subscription_existing',
      state: 'creating',
      ownerId: 'owner_new',
      attempt: 1,
      leaseExpiresAt: new Date('2026-08-03T12:10:00.000Z'),
    });
  });

  it('does not reclaim an expired creating lock whose subscription ownership does not match', async () => {
    const lockId = createSubscriptionPeriodLockId(userId, periodStartDate);
    const { db, transaction } = createFirestore({
      [`personal_driver_subscription_locks/${lockId}`]: {
        userId,
        periodStartDate,
        subscriptionId: 'subscription_existing',
        state: 'creating',
        ownerId: 'owner_existing',
        attempt: 1,
        leaseExpiresAt: new Date('2026-08-03T11:59:59.999Z'),
      },
      'personal_driver_subscriptions/subscription_existing': {
        userId: 'other_user',
        periodStartDate,
        paymentStatus: 'creating',
      },
    });

    await expect(claimSubscriptionPeriodLock(transaction as never, db as never, {
      userId,
      periodStartDate,
      requestedSubscriptionId: 'subscription_new',
      ownerId: 'owner_new',
      now,
    })).resolves.toMatchObject({
      kind: 'existing',
      subscriptionId: 'subscription_existing',
      state: 'creating',
    });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it.each(['failed', 'cancelled'])('reclaims only matching %s subscription work', async (paymentStatus) => {
    const lockId = createSubscriptionPeriodLockId(userId, periodStartDate);
    const { db, transaction } = createFirestore({
      [`personal_driver_subscription_locks/${lockId}`]: {
        userId,
        periodStartDate,
        subscriptionId: 'subscription_failed',
        state: 'pending_payment',
        ownerId: 'owner_existing',
        attempt: 1,
      },
      'personal_driver_subscriptions/subscription_failed': {
        userId,
        periodStartDate,
        paymentStatus,
      },
    });

    await expect(claimSubscriptionPeriodLock(transaction as never, db as never, {
      userId,
      periodStartDate,
      requestedSubscriptionId: 'subscription_new',
      ownerId: 'owner_new',
      now,
    })).resolves.toMatchObject({
      kind: 'claimed',
      subscriptionId: 'subscription_new',
      ownerId: 'owner_new',
      attempt: 2,
    });
  });

  it('finalizes, activates, and releases only the matching owned lock', async () => {
    const lockId = createSubscriptionPeriodLockId(userId, periodStartDate);
    const lockPath = `personal_driver_subscription_locks/${lockId}`;
    const { db, documents, transaction } = createFirestore({
      [lockPath]: {
        userId,
        periodStartDate,
        subscriptionId: 'subscription_1',
        state: 'creating',
        ownerId: 'owner_1',
        attempt: 1,
      },
    });
    const lockRef = db.collection('personal_driver_subscription_locks').doc(lockId);

    await markSubscriptionPeriodLockPendingPayment(transaction as never, lockRef as never, {
      subscriptionId: 'subscription_1',
      ownerId: 'wrong_owner',
      paymentIntentId: 'pi_1',
      now,
    });
    expect(documents.get(lockPath)?.state).toBe('creating');

    await markSubscriptionPeriodLockPendingPayment(transaction as never, lockRef as never, {
      subscriptionId: 'subscription_1',
      ownerId: 'owner_1',
      paymentIntentId: 'pi_1',
      now,
    });
    expect(documents.get(lockPath)).toMatchObject({
      state: 'pending_payment',
      paymentIntentId: 'pi_1',
      updatedAt: now,
    });

    await activateSubscriptionPeriodLock(transaction as never, lockRef as never, {
      subscriptionId: 'subscription_other',
      paymentIntentId: 'pi_1',
      now,
    });
    expect(documents.get(lockPath)?.state).toBe('pending_payment');

    await activateSubscriptionPeriodLock(transaction as never, lockRef as never, {
      subscriptionId: 'subscription_1',
      paymentIntentId: 'pi_1',
      now,
    });
    expect(documents.get(lockPath)?.state).toBe('active');

    await releaseSubscriptionPeriodLock(transaction as never, lockRef as never, {
      subscriptionId: 'subscription_other',
      paymentIntentId: 'pi_1',
    });
    expect(documents.has(lockPath)).toBe(true);

    await releaseSubscriptionPeriodLock(transaction as never, lockRef as never, {
      subscriptionId: 'subscription_1',
      paymentIntentId: 'pi_other',
    });
    expect(documents.has(lockPath)).toBe(true);

    await releaseSubscriptionPeriodLock(transaction as never, lockRef as never, {
      subscriptionId: 'subscription_1',
      paymentIntentId: 'pi_1',
    });
    expect(documents.has(lockPath)).toBe(true);

    documents.set(lockPath, {
      userId,
      periodStartDate,
      subscriptionId: 'subscription_1',
      state: 'pending_payment',
      ownerId: 'owner_1',
      attempt: 1,
      paymentIntentId: 'pi_1',
    });
    await releaseSubscriptionPeriodLock(transaction as never, lockRef as never, {
      subscriptionId: 'subscription_1',
      paymentIntentId: 'pi_1',
    });
    expect(documents.has(lockPath)).toBe(false);
  });
});
