import type { FoodOrderStatus } from '@/types/food-delivery';

export const RESTAURANT_ORDER_OPERATIONAL_STATUSES = [
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
  'delivering',
] as const satisfies readonly FoodOrderStatus[];

export const RESTAURANT_ORDER_HISTORY_STATUSES = [
  'delivered',
  'no_driver_available',
  'cancelled',
  'cancelled_by_restaurant',
] as const satisfies readonly FoodOrderStatus[];
