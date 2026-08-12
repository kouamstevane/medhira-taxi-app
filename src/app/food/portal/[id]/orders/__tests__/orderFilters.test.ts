import {
  getRestaurantOrderFilterClassName,
  RESTAURANT_ORDER_FILTERS,
  RESTAURANT_ORDER_STATUS_LABELS,
  RESTAURANT_REJECTABLE_STATUSES,
} from '../orderStatusUi';

describe('restaurant order status UI', () => {
  test('includes every restaurant-actionable status in the filters', () => {
    expect(RESTAURANT_ORDER_FILTERS).toEqual([
      'all',
      'pending_payment',
      'pending',
      'confirmed',
      'accepted',
      'preparing',
      'ready',
      'driver_heading_to_restaurant',
      'driver_arrived_restaurant',
      'picked_up',
      'out_for_delivery',
      'arriving',
      'delivered',
      'no_driver_available',
      'cancelled',
      'cancelled_by_restaurant',
    ]);
  });

  test('lets restaurants refuse or cancel orders before pickup', () => {
    expect(RESTAURANT_REJECTABLE_STATUSES).toEqual([
      'pending',
      'confirmed',
      'accepted',
      'preparing',
      'ready',
      'no_driver_available',
    ]);
  });

  test('has French labels for non-terminal operational statuses', () => {
    expect(RESTAURANT_ORDER_STATUS_LABELS.accepted).toBe('Acceptée');
    expect(RESTAURANT_ORDER_STATUS_LABELS.driver_heading_to_restaurant).toBe('Livreur en route');
    expect(RESTAURANT_ORDER_STATUS_LABELS.cancelled_by_restaurant).toBe('Refusée restaurant');
  });

  test('keeps filter buttons readable inside the horizontal scroller', () => {
    const inactiveClassName = getRestaurantOrderFilterClassName(false);
    const activeClassName = getRestaurantOrderFilterClassName(true);

    expect(inactiveClassName).toContain('shrink-0');
    expect(inactiveClassName).toContain('whitespace-nowrap');
    expect(inactiveClassName).toContain('min-h-10');
    expect(activeClassName).toContain('text-[#1a1305]');
    expect(activeClassName).not.toContain('text-white');
  });
});
