import {
  getRestaurantIdsAfterDeletion,
  getRestaurantStoragePrefixes,
} from '../deleteRestaurant';

describe('getRestaurantIdsAfterDeletion', () => {
  test('removes the deleted restaurant while preserving other restaurants', () => {
    expect(getRestaurantIdsAfterDeletion({
      restaurantId: 'rest-2',
      restaurantIds: ['rest-1', 'rest-2', 'rest-3'],
    }, 'rest-2')).toEqual(['rest-1', 'rest-3']);
  });

  test('supports legacy users with only one restaurant id', () => {
    expect(getRestaurantIdsAfterDeletion({ restaurantId: 'rest-1' }, 'rest-1')).toEqual([]);
  });
});

describe('getRestaurantStoragePrefixes', () => {
  test('covers every restaurant-owned Storage namespace', () => {
    expect(getRestaurantStoragePrefixes('rest-123')).toEqual([
      'restaurant-images/rest-123/',
      'menu-images/rest-123/',
      'menu-imports/rest-123/',
    ]);
  });
});
