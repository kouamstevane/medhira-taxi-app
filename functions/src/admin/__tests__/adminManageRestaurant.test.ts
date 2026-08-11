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
});
