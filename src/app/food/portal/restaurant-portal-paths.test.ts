import {
  getRestaurantIdFromSearch,
  getRestaurantPortalPath,
} from './restaurant-portal-paths';

describe('restaurant portal paths', () => {
  it('keeps the restaurant ID in a static-export-compatible query parameter', () => {
    expect(getRestaurantPortalPath('rest/123', 'orders')).toBe(
      '/food/portal/orders?restaurantId=rest%2F123',
    );
    expect(getRestaurantPortalPath('rest/123')).toBe(
      '/food/portal?restaurantId=rest%2F123',
    );
  });

  it('reads the restaurant ID from the query string', () => {
    expect(getRestaurantIdFromSearch('?restaurantId=rest%2F123')).toBe('rest/123');
    expect(getRestaurantIdFromSearch('')).toBeNull();
  });
});
