import { calculateFoodSettlement } from '../foodSettlement';

describe('calculateFoodSettlement', () => {
  test('splits the order between restaurant, driver, and platform in cents', () => {
    expect(calculateFoodSettlement({ basePrice: 100, deliveryCost: 20, commissionRate: 15 })).toEqual({
      totalAmountCents: 12000,
      restaurantGrossCents: 10000,
      restaurantCommissionCents: 1500,
      restaurantNetCents: 8500,
      driverGrossCents: 2000,
      driverAmountCents: 1400,
      platformAmountCents: 2100,
    });
  });

  test('uses the configured default commission when the restaurant has no rate', () => {
    const settlement = calculateFoodSettlement({ basePrice: 20, deliveryCost: 5 });

    expect(settlement.restaurantCommissionCents).toBe(300);
    expect(settlement.restaurantNetCents).toBe(1700);
  });

  test('clamps invalid commission rates and never creates negative payouts', () => {
    expect(calculateFoodSettlement({ basePrice: 10, deliveryCost: 0, commissionRate: 150 })).toMatchObject({
      restaurantCommissionCents: 1000,
      restaurantNetCents: 0,
      driverAmountCents: 0,
      platformAmountCents: 1000,
    });
  });
});
