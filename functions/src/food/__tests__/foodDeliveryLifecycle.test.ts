import {
  FOOD_DELIVERY_TERMINAL_STATUSES,
  buildAssignedFoodDeliveryOrderData,
  buildPickedUpClientAddress,
  getDeliveryOrderCancellationAfterRefusal,
  getFoodOrderStatusForDeliveryStatus,
  getNextDeliveryAssignmentAttempt,
  getStalePendingPaymentCancellationUpdate,
  isFoodOrderAssignableToDriver,
  isFoodOrderPayable,
  isFoodOrderPaymentExpired,
  shouldSkipStaleDeliveryAssignment,
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

  test('prevents stale accepted events from assigning drivers after cancellation', () => {
    expect(isFoodOrderAssignableToDriver({ status: 'accepted', paymentValidated: true })).toBe(true);
    expect(isFoodOrderAssignableToDriver({ status: 'cancelled_by_restaurant', paymentValidated: true })).toBe(false);
    expect(isFoodOrderAssignableToDriver({ status: 'accepted', paymentValidated: false })).toBe(false);
    expect(shouldSkipStaleDeliveryAssignment({ status: 'cancelled_by_restaurant', paymentValidated: true }, false)).toBe(true);
    expect(shouldSkipStaleDeliveryAssignment({ status: 'accepted', paymentValidated: true }, true)).toBe(true);
  });

  test('allows payment only while the food order is pending payment', () => {
    expect(isFoodOrderPayable({ status: 'pending_payment', paymentValidated: false })).toBe(true);
    expect(isFoodOrderPayable({ status: 'cancelled', paymentValidated: false })).toBe(false);
    expect(isFoodOrderPayable({ status: 'confirmed', paymentValidated: true })).toBe(false);
  });

  test('builds assigned delivery orders without exposing the full client address', () => {
    const deliveryOrder = buildAssignedFoodDeliveryOrderData({
      orderId: 'order-1',
      driverId: 'driver-1',
      source: {
        restaurantId: 'restaurant-1',
        userId: 'client-1',
        cityId: 'edmonton',
        deliveryPreference: 'leave_at_door',
        restaurantAddress: { address: '1 Restaurant Street', lat: 53.54, lng: -113.49 },
        clientNeighbourhood: 'Downtown',
        orderItems: [{ itemName: 'Plat', itemQuantity: 1, itemPrice: 25 }],
        orderNumber: '#42',
        restaurantName: 'Le Test',
        restaurantPhone: '+14165550000',
        customerPhone: '+14165550111',
        totalOrderPrice: 34,
        deliveryCost: 9,
      },
      assignmentAttempt: 1,
      deliveryShareRate: 0.8,
    });

    expect(deliveryOrder).toMatchObject({
      status: 'assigned',
      clientNeighbourhood: 'Downtown',
    });
    expect(deliveryOrder).not.toHaveProperty('clientAddress');
  });

  test('builds picked-up client address without undefined Firestore fields', () => {
    expect(buildPickedUpClientAddress({
      deliveryAddress: '100 Client Street',
      deliveryLocation: { lat: 53.55, lng: -113.5 },
    })).toEqual({
      address: '100 Client Street',
      lat: 53.55,
      lng: -113.5,
    });
  });

  test('expires abandoned payment attempts after the configured window', () => {
    const now = Date.UTC(2026, 6, 28, 12, 0, 0);
    const staleCreatedAt = new Date(now - 31 * 60 * 1000);
    const freshCreatedAt = new Date(now - 10 * 60 * 1000);

    expect(isFoodOrderPaymentExpired({ status: 'pending_payment', paymentMethod: 'card', createdAt: staleCreatedAt }, now)).toBe(true);
    expect(isFoodOrderPaymentExpired({ status: 'pending_payment', paymentMethod: 'card', createdAt: freshCreatedAt }, now)).toBe(false);
    expect(isFoodOrderPaymentExpired({ status: 'pending_payment', paymentMethod: 'wallet', createdAt: staleCreatedAt }, now)).toBe(true);
    expect(getStalePendingPaymentCancellationUpdate()).toEqual({
      status: 'cancelled',
      cancelledBy: 'system',
      cancellationReason: 'payment_abandoned',
    });
  });
});
