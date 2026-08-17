import type { FoodOrderStatus } from '@/types/food-delivery';

export const RESTAURANT_ORDER_FILTER_GROUPS = [
  'all',
  'to_process',
  'preparing',
  'in_delivery',
  'completed',
] as const;

export type RestaurantOrderFilterGroup = typeof RESTAURANT_ORDER_FILTER_GROUPS[number];

export const RESTAURANT_ORDER_FILTER_GROUP_LABELS: Record<RestaurantOrderFilterGroup, string> = {
  all: 'Toutes',
  to_process: 'À traiter',
  preparing: 'En préparation',
  in_delivery: 'En livraison',
  completed: 'Terminées',
};

export const RESTAURANT_ORDER_FILTERS = [
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
] as const;

export const RESTAURANT_REJECTABLE_STATUSES: FoodOrderStatus[] = [
  'pending',
  'confirmed',
  'accepted',
  'preparing',
  'ready',
  'no_driver_available',
];

const RESTAURANT_ORDER_FILTER_STATUS_SETS: Record<Exclude<RestaurantOrderFilterGroup, 'all'>, FoodOrderStatus[]> = {
  to_process: ['pending_payment', 'pending', 'confirmed', 'accepted'],
  preparing: ['preparing', 'ready'],
  in_delivery: [
    'driver_heading_to_restaurant',
    'driver_arrived_restaurant',
    'picked_up',
    'out_for_delivery',
    'arriving',
    'delivering',
  ],
  completed: ['delivered', 'no_driver_available', 'cancelled', 'cancelled_by_restaurant'],
};

export const RESTAURANT_ORDER_STATUS_LABELS: Record<FoodOrderStatus | 'all', string> = {
  all: 'Toutes',
  pending_payment: 'Paiement en attente',
  pending: 'En attente',
  confirmed: 'Confirmée',
  accepted: 'Acceptée',
  preparing: 'Préparation',
  ready: 'Prête',
  driver_heading_to_restaurant: 'Livreur en route',
  driver_arrived_restaurant: 'Livreur au resto',
  picked_up: 'Récupérée',
  out_for_delivery: 'En livraison',
  arriving: 'Livreur proche',
  delivering: 'En livraison',
  delivered: 'Livrée',
  no_driver_available: 'Aucun livreur',
  cancelled: 'Annulée',
  cancelled_by_restaurant: 'Refusée restaurant',
};

export function getRestaurantOrderStatusLabel(status: FoodOrderStatus | 'all'): string {
  return RESTAURANT_ORDER_STATUS_LABELS[status] ?? status;
}

export function getRestaurantOrderFilterGroupLabel(group: RestaurantOrderFilterGroup): string {
  return RESTAURANT_ORDER_FILTER_GROUP_LABELS[group];
}

export function getRestaurantOrderFilterStatusSet(group: RestaurantOrderFilterGroup): FoodOrderStatus[] | null {
  return group === 'all' ? null : RESTAURANT_ORDER_FILTER_STATUS_SETS[group];
}

export function getRestaurantOrderFilterClassName(isActive: boolean): string {
  return `min-h-10 shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold leading-5 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
    isActive
      ? 'border-primary bg-primary text-[#1a1305] shadow-[0_8px_20px_rgba(242,146,0,0.18)]'
      : 'glass-card border-white/10 text-slate-200 hover:border-primary/40 hover:bg-white/10 hover:text-white'
  }`;
}
