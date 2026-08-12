import type { FoodOrderStatus } from '@/types/food-delivery';

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

export function getRestaurantOrderFilterClassName(isActive: boolean): string {
  return `min-h-10 shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold leading-5 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
    isActive
      ? 'border-primary bg-primary text-[#1a1305] shadow-[0_8px_20px_rgba(242,146,0,0.18)]'
      : 'glass-card border-white/10 text-slate-200 hover:border-primary/40 hover:bg-white/10 hover:text-white'
  }`;
}
