export const MAX_DELIVERY_ASSIGNMENT_ATTEMPTS = 3;

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
