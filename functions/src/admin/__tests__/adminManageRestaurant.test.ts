import * as adminManageRestaurantModule from '../adminManageRestaurant.js';

type SchemaLike = {
  safeParse: (value: unknown) => { success: boolean };
};

const schema = (adminManageRestaurantModule as typeof adminManageRestaurantModule & {
  ManageRestaurantSchema?: SchemaLike;
}).ManageRestaurantSchema;

describe('ManageRestaurantSchema', () => {
  it('accepts approval payloads serialized with null reason', () => {
    expect(schema?.safeParse({
      action: 'approve',
      restaurantId: 'restaurant-1',
      reason: null,
    }).success).toBe(true);
  });

  it('keeps empty rejection reasons available for callable-level validation', () => {
    expect(schema?.safeParse({
      action: 'reject',
      restaurantId: 'restaurant-1',
      reason: '',
    }).success).toBe(true);
  });

  it('accepts a commission-rate update payload', () => {
    expect(schema?.safeParse({
      action: 'set_commission_rate',
      restaurantId: 'restaurant-1',
      commissionRate: 15,
    }).success).toBe(true);
  });

  it('rejects commission rates outside the inclusive 0-100 range', () => {
    expect(schema?.safeParse({
      action: 'set_commission_rate',
      restaurantId: 'restaurant-1',
      commissionRate: 100.01,
    }).success).toBe(false);
    expect(schema?.safeParse({
      action: 'set_commission_rate',
      restaurantId: 'restaurant-1',
      commissionRate: -0.01,
    }).success).toBe(false);
  });
});
