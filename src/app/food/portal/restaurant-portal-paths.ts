export type RestaurantPortalSection = 'menu' | 'orders';

export function getRestaurantPortalPath(
  restaurantId: string,
  section?: RestaurantPortalSection,
): string {
  const basePath = section ? `/food/portal/${section}` : '/food/portal';
  return `${basePath}?restaurantId=${encodeURIComponent(restaurantId)}`;
}

export function getRestaurantIdFromSearch(search: string): string | null {
  const restaurantId = new URLSearchParams(search).get('restaurantId');
  return restaurantId?.trim() || null;
}
