import {
  expireSubscriptionIfNeeded,
  isSubscriptionEntitled,
} from '../entitlement.js';

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
});
