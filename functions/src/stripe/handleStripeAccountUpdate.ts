import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

export async function onAccountUpdated(account: Record<string, unknown>): Promise<void> {
  const metadata = (account.metadata ?? {}) as Record<string, string>;
  const accountType = metadata.accountType as 'driver' | 'restaurant' | undefined;

  if (accountType === 'restaurant') {
    return handleRestaurantUpdate(account);
  }
  if (accountType === 'driver') {
    return handleDriverFallback(account);
  }
  return handleDriverFallback(account);
}

async function handleDriverFallback(account: Record<string, unknown>): Promise<void> {
  const metadata = (account.metadata ?? {}) as Record<string, string>;
  const driverId = metadata.driverId;
  if (driverId) {
    logger.info('[handleStripeAccountUpdate] driver update via metadata.driverId', { driverId });
    return;
  }
  const snap = await admin.firestore()
    .collection('drivers')
    .where('stripeAccountId', '==', account.id)
    .limit(1)
    .get();
  if (!snap.empty) {
    logger.info('[handleStripeAccountUpdate] driver fallback query match', { driverId: snap.docs[0].id });
  } else {
    logger.warn('[handleStripeAccountUpdate] no match for account', { accountId: account.id });
  }
}

async function handleRestaurantUpdate(account: Record<string, unknown>): Promise<void> {
  const metadata = (account.metadata ?? {}) as Record<string, string>;
  const restaurantId = metadata.restaurantId;
  if (!restaurantId) {
    logger.warn('[handleStripeAccountUpdate] restaurant account missing restaurantId metadata', { accountId: account.id });
    return;
  }

  const chargesEnabled = !!account.charges_enabled;
  const detailsSubmitted = !!account.details_submitted;
  const requirements = account.requirements as Record<string, unknown> | undefined;
  const disabledReason = (requirements?.disabled_reason as string | null) ?? null;

  const newStatus: string = chargesEnabled && detailsSubmitted
    ? 'active'
    : disabledReason
      ? 'restricted'
      : 'in_progress';

  const ref = admin.firestore().doc(`restaurants/${restaurantId}`);
  const cur = (await ref.get()).data();
  if (cur?.stripeConnectStatus === newStatus) {
    logger.info('[handleStripeAccountUpdate] no-op restaurant update', { restaurantId, status: newStatus });
    return;
  }

  await ref.update({
    stripeConnectStatus: newStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  logger.info('[handleStripeAccountUpdate] restaurant status updated', { restaurantId, newStatus });
}
