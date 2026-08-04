import {
  expireSubscriptionIfNeeded,
  isSubscriptionEntitled,
} from '../entitlement.js';
import { expirePersonalDriverSubscriptionsUntilExhausted } from '../expireSubscriptions.js';

describe('personal driver entitlement', () => {
  it('requires active status, succeeded payment, complete UTC boundaries, and current time', () => {
    const valid = {
      status: 'active',
      paymentStatus: 'succeeded',
      periodStartAtUtc: new Date('2026-07-01T04:00:00.000Z'),
      periodEndAtUtc: new Date('2026-07-31T04:00:00.000Z'),
    };

    expect(isSubscriptionEntitled(valid, new Date('2026-07-01T03:59:59.000Z'))).toBe(false);
    expect(isSubscriptionEntitled(valid, new Date('2026-07-30T12:00:00.000Z'))).toBe(true);
    expect(isSubscriptionEntitled(valid, new Date('2026-07-31T04:00:00.000Z'))).toBe(false);
    expect(isSubscriptionEntitled({ ...valid, paymentStatus: 'pending' }, new Date('2026-07-30T12:00:00.000Z'))).toBe(false);
    expect(isSubscriptionEntitled({ status: 'active' }, new Date('2026-07-30T12:00:00.000Z'))).toBe(false);
  });

  it('expires an active subscription transactionally at its exclusive UTC boundary', async () => {
    const subscriptionRef = { id: 'sub_1' } as FirebaseFirestore.DocumentReference;
    const transaction = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          status: 'active',
          paymentStatus: 'succeeded',
          periodStartAtUtc: new Date('2026-07-01T04:00:00.000Z'),
          periodEndAtUtc: new Date('2026-07-31T04:00:00.000Z'),
        }),
      }),
      update: jest.fn(),
    };
    const db = {
      runTransaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<boolean>) => callback(transaction)),
    } as unknown as FirebaseFirestore.Firestore;

    await expect(expireSubscriptionIfNeeded(
      db,
      subscriptionRef,
      new Date('2026-07-31T04:00:00.000Z'),
    )).resolves.toBe(false);

    expect(transaction.update).toHaveBeenCalledWith(subscriptionRef, {
      status: 'expired',
      expiredAt: expect.anything(),
    });
  });

  it('filters active subscriptions and pages past 501 irrelevant expired rows', async () => {
    const irrelevantRows = Array.from({ length: 501 }, (_, index) => ({
      id: `irrelevant_${index}`,
      ref: { id: `irrelevant_${index}` },
      data: () => ({ status: 'expired' }),
    }));
    const expiredActive = {
      id: 'expired_active',
      ref: { id: 'expired_active' },
      data: () => ({ status: 'active' }),
    };
    const queryBuilder = {
      where: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
      startAfter: jest.fn(),
      get: jest.fn()
        .mockResolvedValueOnce({ docs: irrelevantRows.slice(0, 500) })
        .mockResolvedValueOnce({ docs: [...irrelevantRows.slice(500), expiredActive] }),
    };
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
    queryBuilder.limit.mockReturnValue(queryBuilder);
    queryBuilder.startAfter.mockReturnValue(queryBuilder);
    const batch = {
      update: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    const db = {
      collection: jest.fn(() => queryBuilder),
      batch: jest.fn(() => batch),
    } as unknown as FirebaseFirestore.Firestore;

    await expirePersonalDriverSubscriptionsUntilExhausted(
      db,
      new Date('2026-08-04T12:00:00.000Z'),
    );

    expect(queryBuilder.where).toHaveBeenNthCalledWith(1, 'status', '==', 'active');
    expect(queryBuilder.where).toHaveBeenNthCalledWith(2, 'periodEndAtUtc', '<=', expect.anything());
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('periodEndAtUtc', 'asc');
    expect(queryBuilder.limit).toHaveBeenCalledWith(500);
    expect(queryBuilder.startAfter).toHaveBeenCalledWith(irrelevantRows[499]);
    expect(queryBuilder.get).toHaveBeenCalledTimes(2);
    expect(batch.update).toHaveBeenCalledTimes(1);
    expect(batch.update).toHaveBeenCalledWith(expiredActive.ref, {
      status: 'expired',
      expiredAt: expect.anything(),
    });
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});
