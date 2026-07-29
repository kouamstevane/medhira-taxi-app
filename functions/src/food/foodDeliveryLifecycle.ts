export const MAX_DELIVERY_ASSIGNMENT_ATTEMPTS = 3;
export const PENDING_CARD_PAYMENT_EXPIRY_MS = 30 * 60 * 1000;

export const FOOD_DELIVERY_TERMINAL_STATUSES = ['refused', 'delivered', 'cancelled'] as const;

export const RESTAURANT_CANCELLABLE_FOOD_ORDER_STATUSES = [
  'pending',
  'confirmed',
  'accepted',
  'preparing',
  'ready',
  'no_driver_available',
] as const;

const DELIVERY_TO_FOOD_ORDER_STATUS: Record<string, string> = {
  heading_to_restaurant: 'driver_heading_to_restaurant',
  arrived_restaurant: 'driver_arrived_restaurant',
  picked_up: 'picked_up',
  heading_to_client: 'out_for_delivery',
  arrived_client: 'arriving',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

export function getFoodOrderStatusForDeliveryStatus(status: string): string | null {
  return DELIVERY_TO_FOOD_ORDER_STATUS[status] ?? null;
}

export function getNextDeliveryAssignmentAttempt(currentAttempt: number | undefined): number {
  const attempt = Number.isInteger(currentAttempt) && currentAttempt && currentAttempt > 0
    ? currentAttempt
    : 1;
  return attempt + 1;
}

export function canRetryDeliveryAssignment(currentAttempt: number | undefined): boolean {
  const attempt = Number.isInteger(currentAttempt) && currentAttempt && currentAttempt > 0
    ? currentAttempt
    : 1;
  return attempt < MAX_DELIVERY_ASSIGNMENT_ATTEMPTS;
}

export function getDeliveryOrderCancellationAfterRefusal() {
  return {
    status: 'cancelled',
    cancellationReason: 'driver_cancelled',
    cancellationImpactOnStats: false,
  };
}

export function isFoodOrderAssignableToDriver(order: { status?: unknown; paymentValidated?: unknown } | null | undefined): boolean {
  return order?.status === 'accepted' && order.paymentValidated === true;
}

export function isFoodOrderPayable(order: { status?: unknown; paymentValidated?: unknown } | null | undefined): boolean {
  return order?.status === 'pending_payment' && order.paymentValidated !== true;
}

export function shouldSkipStaleDeliveryAssignment(
  order: { status?: unknown; paymentValidated?: unknown } | null | undefined,
  deliveryOrderAlreadyExists: boolean,
): boolean {
  return deliveryOrderAlreadyExists || !isFoodOrderAssignableToDriver(order);
}

function toMillis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

export function isFoodOrderPaymentExpired(
  order: { status?: unknown; paymentMethod?: unknown; createdAt?: unknown },
  nowMs = Date.now(),
): boolean {
  const createdAtMs = toMillis(order.createdAt);
  return order.status === 'pending_payment'
    && (order.paymentMethod === 'card' || order.paymentMethod === 'wallet')
    && createdAtMs != null
    && nowMs - createdAtMs >= PENDING_CARD_PAYMENT_EXPIRY_MS;
}

export function getStalePendingPaymentCancellationUpdate() {
  return {
    status: 'cancelled',
    cancelledBy: 'system',
    cancellationReason: 'payment_abandoned',
  };
}
