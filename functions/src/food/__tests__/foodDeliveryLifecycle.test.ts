import {
  FOOD_DELIVERY_TERMINAL_STATUSES,
  getDeliveryOrderCancellationAfterRefusal,
  getFoodOrderStatusForDeliveryStatus,
  getNextDeliveryAssignmentAttempt,
  RESTAURANT_CANCELLABLE_FOOD_ORDER_STATUSES,
} from '../foodDeliveryLifecycle';

describe('foodDeliveryLifecycle', () => {
  test('maps driver delivery statuses to client-facing food order statuses', () => {
    expect(getFoodOrderStatusForDeliveryStatus('heading_to_restaurant')).toBe('driver_heading_to_restaurant');
    expect(getFoodOrderStatusForDeliveryStatus('arrived_restaurant')).toBe('driver_arrived_restaurant');
    expect(getFoodOrderStatusForDeliveryStatus('picked_up')).toBe('picked_up');
    expect(getFoodOrderStatusForDeliveryStatus('heading_to_client')).toBe('out_for_delivery');
    expect(getFoodOrderStatusForDeliveryStatus('arrived_client')).toBe('arriving');
    expect(getFoodOrderStatusForDeliveryStatus('delivered')).toBe('delivered');
    expect(getFoodOrderStatusForDeliveryStatus('cancelled')).toBe('cancelled');
  });

  test('does not expose refused as a client-facing status because refusal triggers reassignment', () => {
    expect(getFoodOrderStatusForDeliveryStatus('refused')).toBeNull();
    expect(FOOD_DELIVERY_TERMINAL_STATUSES).toContain('refused');
  });

  test('allows restaurant cancellation until pickup has started', () => {
    expect(RESTAURANT_CANCELLABLE_FOOD_ORDER_STATUSES).toEqual([
      'pending',
      'confirmed',
      'accepted',
      'preparing',
      'ready',
      'no_driver_available',
    ]);
  });

  test('increments delivery assignment attempts up to the retry cap', () => {
    expect(getNextDeliveryAssignmentAttempt(undefined)).toBe(2);
    expect(getNextDeliveryAssignmentAttempt(1)).toBe(2);
    expect(getNextDeliveryAssignmentAttempt(2)).toBe(3);
  });

  test('cancels refused delivery orders without penalizing the driver', () => {
    expect(getDeliveryOrderCancellationAfterRefusal()).toEqual({
      status: 'cancelled',
      cancellationReason: 'driver_cancelled',
      cancellationImpactOnStats: false,
    });
  });
});
