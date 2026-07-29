import { calculateRoadDistanceKm, calculateVerifiedFoodOrderTotals, toStripeAmount } from '../foodOrderPricing';

describe('foodOrderPricing', () => {
  test('recalculates item prices from menu documents instead of trusting client prices', () => {
    const result = calculateVerifiedFoodOrderTotals(
      {
        orderItems: [
          { menuItemId: 'burger', itemName: 'Fake Burger', itemQuantity: 2, itemPrice: 0.01 },
          { menuItemId: 'fries', itemName: 'Fake Fries', itemQuantity: 1, itemPrice: 0.01 },
        ],
        deliveryDistance: 4,
        isWeekend: true,
      },
      new Map([
        ['burger', { name: 'Burger', price: 12.5, isAvailable: true }],
        ['fries', { name: 'Frites', price: 4, isAvailable: true }],
      ]),
    );

    expect(result.orderItems).toEqual([
      { menuItemId: 'burger', itemName: 'Burger', itemQuantity: 2, itemPrice: 12.5 },
      { menuItemId: 'fries', itemName: 'Frites', itemQuantity: 1, itemPrice: 4 },
    ]);
    expect(result.basePrice).toBe(29);
    expect(result.deliveryCost).toBe(7.5);
    expect(result.totalOrderPrice).toBe(36.5);
  });

  test('rejects unavailable or missing menu items', () => {
    expect(() =>
      calculateVerifiedFoodOrderTotals(
        {
          orderItems: [{ menuItemId: 'burger', itemName: 'Burger', itemQuantity: 1, itemPrice: 12 }],
          deliveryDistance: 1,
          isWeekend: false,
        },
        new Map([['burger', { name: 'Burger', price: 12, isAvailable: false }]]),
      ),
    ).toThrow('Article indisponible');
  });

  test('converts CAD amounts to Stripe cents', () => {
    expect(toStripeAmount(36.5, 'cad')).toBe(3650);
  });

  test('rejects client-supplied distance when server distance is available', () => {
    const result = calculateRoadDistanceKm({
      clientDistanceKm: 0.1,
      serverDistanceKm: 8.42,
    });

    expect(result).toBe(8.42);
  });

  test('rejects orders when no trusted server distance is available', () => {
    expect(() =>
      calculateRoadDistanceKm({
        clientDistanceKm: 1,
        serverDistanceKm: null,
      }),
    ).toThrow('Distance de livraison indisponible');
  });
});
