import { createHash } from 'node:crypto';

export const SUBSCRIPTION_PERIOD_LOCK_LEASE_MS = 10 * 60 * 1000;

export type SubscriptionPeriodLockState = 'creating' | 'pending_payment' | 'active';

interface ClaimSubscriptionPeriodLockInput {
  userId: string;
  periodStartDate: string;
  requestedSubscriptionId: string;
  ownerId: string;
  now: Date;
}

interface ClaimedSubscriptionPeriodLock {
  kind: 'claimed';
  lockId: string;
  lockRef: FirebaseFirestore.DocumentReference;
  subscriptionId: string;
  ownerId: string;
  attempt: number;
  subscriptionExists: boolean;
}

interface ExistingSubscriptionPeriodLock {
  kind: 'existing';
  lockId: string;
  lockRef: FirebaseFirestore.DocumentReference;
  subscriptionId: string;
  state: SubscriptionPeriodLockState;
  attempt: number;
}

export type ClaimSubscriptionPeriodLockResult =
  | ClaimedSubscriptionPeriodLock
  | ExistingSubscriptionPeriodLock;

interface MarkSubscriptionPeriodLockPendingPaymentInput {
  subscriptionId: string;
  ownerId: string;
  paymentIntentId: string;
  now: Date;
}

interface ActivateSubscriptionPeriodLockInput {
  subscriptionId: string;
  paymentIntentId: string;
  now: Date;
}

interface ReleaseSubscriptionPeriodLockInput {
  subscriptionId: string;
  paymentIntentId?: string;
  ownerId?: string;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function getAttempt(data: FirebaseFirestore.DocumentData): number {
  return typeof data.attempt === 'number' && Number.isSafeInteger(data.attempt) && data.attempt > 0
    ? data.attempt
    : 1;
}

function isLockState(value: unknown): value is SubscriptionPeriodLockState {
  return value === 'creating' || value === 'pending_payment' || value === 'active';
}

export function createSubscriptionPeriodLockId(userId: string, periodStartDate: string): string {
  return createHash('sha256').update(userId).update('\0').update(periodStartDate).digest('hex');
}

export function createSubscriptionPeriodLockStripeIdempotencyKey(
  lockId: string,
  subscriptionId: string,
  attempt: number,
): string {
  const claimIdentity = createHash('sha256')
    .update(lockId)
    .update('\0')
    .update(subscriptionId)
    .update('\0')
    .update(String(attempt))
    .digest('hex');
  return `personal_driver_subscription_period_${claimIdentity}`;
}

export async function claimSubscriptionPeriodLock(
  transaction: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  input: ClaimSubscriptionPeriodLockInput,
): Promise<ClaimSubscriptionPeriodLockResult> {
  const lockId = createSubscriptionPeriodLockId(input.userId, input.periodStartDate);
  const lockRef = db.collection('personal_driver_subscription_locks').doc(lockId);
  const lockSnapshot = await transaction.get(lockRef);
  const leaseExpiresAt = new Date(input.now.getTime() + SUBSCRIPTION_PERIOD_LOCK_LEASE_MS);

  if (!lockSnapshot.exists) {
    const requestedSubscriptionRef = db.collection('personal_driver_subscriptions').doc(input.requestedSubscriptionId);
    const requestedSubscriptionSnapshot = await transaction.get(requestedSubscriptionRef);
    const requestedSubscription = requestedSubscriptionSnapshot.exists
      ? requestedSubscriptionSnapshot.data()
      : undefined;
    const matchingExistingSubscription = requestedSubscriptionSnapshot.exists
      && requestedSubscription?.userId === input.userId
      && requestedSubscription.periodStartDate === input.periodStartDate;
    const terminalExistingSubscription = matchingExistingSubscription
      && (requestedSubscription.paymentStatus === 'failed' || requestedSubscription.paymentStatus === 'cancelled');
    if (requestedSubscriptionSnapshot.exists && !terminalExistingSubscription) {
      if (!matchingExistingSubscription) {
        throw new Error(`Invalid personal driver subscription claim: ${input.requestedSubscriptionId}`);
      }
      const state: SubscriptionPeriodLockState = requestedSubscription.status === 'active'
        && requestedSubscription.paymentStatus === 'succeeded'
        ? 'active'
        : requestedSubscription.paymentStatus === 'creating'
          ? 'creating'
          : 'pending_payment';
      transaction.create(lockRef, {
        userId: input.userId,
        periodStartDate: input.periodStartDate,
        subscriptionId: input.requestedSubscriptionId,
        state,
        ownerId: requestedSubscription.paymentCreationOwnerId ?? input.ownerId,
        attempt: requestedSubscription.paymentCreationAttempt ?? 1,
        ...(state === 'creating' ? { leaseExpiresAt } : {}),
        ...(typeof requestedSubscription.stripePaymentIntentId === 'string'
          ? { paymentIntentId: requestedSubscription.stripePaymentIntentId }
          : {}),
        updatedAt: input.now,
      });
      return {
        kind: 'existing',
        lockId,
        lockRef,
        subscriptionId: input.requestedSubscriptionId,
        state,
        attempt: requestedSubscription.paymentCreationAttempt ?? 1,
      };
    }
    const attempt = terminalExistingSubscription
      && typeof requestedSubscription.paymentCreationAttempt === 'number'
      ? requestedSubscription.paymentCreationAttempt + 1
      : 1;
    transaction.create(lockRef, {
      userId: input.userId,
      periodStartDate: input.periodStartDate,
      subscriptionId: input.requestedSubscriptionId,
      state: 'creating',
      ownerId: input.ownerId,
      attempt,
      leaseExpiresAt,
      updatedAt: input.now,
    });
    return {
      kind: 'claimed',
      lockId,
      lockRef,
      subscriptionId: input.requestedSubscriptionId,
      ownerId: input.ownerId,
      attempt,
      subscriptionExists: terminalExistingSubscription,
    };
  }

  const lock = lockSnapshot.data();
  if (
    !lock
    || lock.userId !== input.userId
    || lock.periodStartDate !== input.periodStartDate
    || typeof lock.subscriptionId !== 'string'
    || !isLockState(lock.state)
  ) {
    throw new Error(`Invalid personal driver subscription period lock: ${lockId}`);
  }

  const existingSubscriptionRef = db.collection('personal_driver_subscriptions').doc(lock.subscriptionId);
  const existingSubscriptionSnapshot = await transaction.get(existingSubscriptionRef);
  const existingSubscription = existingSubscriptionSnapshot.exists
    ? existingSubscriptionSnapshot.data()
    : undefined;
  const matchingTerminalSubscription = existingSubscriptionSnapshot.exists
    && existingSubscription?.userId === input.userId
    && existingSubscription.periodStartDate === input.periodStartDate
    && (existingSubscription.paymentStatus === 'failed' || existingSubscription.paymentStatus === 'cancelled');
  const matchingCreatingSubscription = !existingSubscriptionSnapshot.exists
    || (
      existingSubscription?.userId === input.userId
      && existingSubscription.periodStartDate === input.periodStartDate
      && existingSubscription.paymentStatus === 'creating'
    );
  const expiredCreating = lock.state === 'creating'
    && matchingCreatingSubscription
    && (!toDate(lock.leaseExpiresAt) || (toDate(lock.leaseExpiresAt)?.getTime() ?? 0) <= input.now.getTime());

  if (!matchingTerminalSubscription && !expiredCreating) {
    return {
      kind: 'existing',
      lockId,
      lockRef,
      subscriptionId: lock.subscriptionId,
      state: lock.state,
      attempt: getAttempt(lock),
    };
  }

  const subscriptionId = matchingTerminalSubscription
    ? input.requestedSubscriptionId
    : lock.subscriptionId;
  const attempt = matchingTerminalSubscription ? getAttempt(lock) + 1 : getAttempt(lock);
  transaction.update(lockRef, {
    userId: input.userId,
    periodStartDate: input.periodStartDate,
    subscriptionId,
    state: 'creating',
    ownerId: input.ownerId,
    attempt,
    leaseExpiresAt,
    updatedAt: input.now,
    paymentIntentId: null,
  });
  return {
    kind: 'claimed',
    lockId,
    lockRef,
    subscriptionId,
    ownerId: input.ownerId,
    attempt,
    subscriptionExists: !matchingTerminalSubscription && existingSubscriptionSnapshot.exists,
  };
}

export async function markSubscriptionPeriodLockPendingPayment(
  transaction: FirebaseFirestore.Transaction,
  lockRef: FirebaseFirestore.DocumentReference,
  input: MarkSubscriptionPeriodLockPendingPaymentInput,
): Promise<boolean> {
  const snapshot = await transaction.get(lockRef);
  if (!snapshot.exists) return false;
  const lock = snapshot.data();
  if (
    lock?.state !== 'creating'
    || lock.subscriptionId !== input.subscriptionId
    || lock.ownerId !== input.ownerId
  ) {
    return false;
  }
  transaction.update(lockRef, {
    state: 'pending_payment',
    paymentIntentId: input.paymentIntentId,
    updatedAt: input.now,
  });
  return true;
}

export async function activateSubscriptionPeriodLock(
  transaction: FirebaseFirestore.Transaction,
  lockRef: FirebaseFirestore.DocumentReference,
  input: ActivateSubscriptionPeriodLockInput,
): Promise<boolean> {
  const snapshot = await transaction.get(lockRef);
  if (!snapshot.exists) return false;
  const lock = snapshot.data();
  if (
    lock?.subscriptionId !== input.subscriptionId
    || lock.paymentIntentId !== input.paymentIntentId
    || lock.state === 'active'
    || lock.state !== 'pending_payment'
  ) {
    return false;
  }
  transaction.update(lockRef, {
    state: 'active',
    updatedAt: input.now,
  });
  return true;
}

export async function releaseSubscriptionPeriodLock(
  transaction: FirebaseFirestore.Transaction,
  lockRef: FirebaseFirestore.DocumentReference,
  input: ReleaseSubscriptionPeriodLockInput,
): Promise<boolean> {
  const snapshot = await transaction.get(lockRef);
  if (!snapshot.exists) return false;
  const lock = snapshot.data();
  if (
    lock?.subscriptionId !== input.subscriptionId
    || lock.state === 'active'
    || (input.paymentIntentId !== undefined && lock.paymentIntentId !== input.paymentIntentId)
    || (input.ownerId !== undefined && lock.ownerId !== input.ownerId)
  ) {
    return false;
  }
  transaction.delete(lockRef);
  return true;
}
