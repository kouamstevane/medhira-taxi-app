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

type FoodDeliveryOrderItemSource = {
  itemName: string;
  itemQuantity: number;
  itemPrice: number;
};

type AssignedFoodDeliveryOrderSource = {
  restaurantId?: unknown;
  userId?: unknown;
  cityId?: unknown;
  deliveryPreference?: unknown;
  restaurantAddress?: unknown;
  clientNeighbourhood?: unknown;
  orderItems?: unknown;
  orderNumber?: unknown;
  restaurantName?: unknown;
  restaurantPhone?: unknown;
  customerPhone?: unknown;
  totalOrderPrice?: unknown;
  deliveryCost?: unknown;
};

type PickedUpFoodOrderSource = {
  deliveryAddress?: unknown;
  deliveryLocation?: unknown;
  deliveryInstructions?: unknown;
};

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toDeliveryOrderItems(value: unknown) {
  return Array.isArray(value)
    ? value.map((item: FoodDeliveryOrderItemSource) => ({
      name: item.itemName,
      qty: item.itemQuantity,
      price: item.itemPrice,
    }))
    : [];
}

export function buildAssignedFoodDeliveryOrderData({
  orderId,
  driverId,
  source,
  assignmentAttempt,
  deliveryShareRate,
}: {
  orderId: string;
  driverId: string;
  source: AssignedFoodDeliveryOrderSource;
  assignmentAttempt: number;
  deliveryShareRate: number;
}) {
  return {
    orderId,
    driverId,
    restaurantId: asString(source.restaurantId),
    clientId: asString(source.userId),
    cityId: asString(source.cityId, 'edmonton'),
    status: 'assigned',
    assignmentAttempt,
    deliveryPreference: asString(source.deliveryPreference, 'leave_at_door'),
    restaurantAddress: source.restaurantAddress,
    clientNeighbourhood: asString(source.clientNeighbourhood),
    orderItems: toDeliveryOrderItems(source.orderItems),
    orderNumber: asString(source.orderNumber),
    restaurantName: asString(source.restaurantName),
    restaurantPhone: asString(source.restaurantPhone),
    clientPhone: asString(source.customerPhone),
    totalAmount: asNumber(source.totalOrderPrice),
    driverEarnings: asNumber(source.deliveryCost) * deliveryShareRate,
    cancellationImpactOnStats: true,
  };
}

export function buildPickedUpClientAddress(source: PickedUpFoodOrderSource) {
  const location = source.deliveryLocation as { lat?: unknown; lng?: unknown } | null | undefined;
  const address: {
    address: string;
    lat: number;
    lng: number;
    instructions?: string;
  } = {
    address: asString(source.deliveryAddress),
    lat: asNumber(location?.lat),
    lng: asNumber(location?.lng),
  };
  if (typeof source.deliveryInstructions === 'string' && source.deliveryInstructions.trim()) {
    address.instructions = source.deliveryInstructions;
  }
  return address;
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
