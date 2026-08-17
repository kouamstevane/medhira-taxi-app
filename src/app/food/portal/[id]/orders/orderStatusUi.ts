import type { FoodOrderStatus } from '@/types/food-delivery';
export {
  RESTAURANT_ORDER_HISTORY_STATUSES,
  RESTAURANT_ORDER_OPERATIONAL_STATUSES,
} from '@/utils/food-order-status';

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
  'delivering',
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

export function getRestaurantOrderFilterCount(
  statuses: readonly FoodOrderStatus[],
  group: RestaurantOrderFilterGroup,
): number {
  const statusSet = getRestaurantOrderFilterStatusSet(group);
  return statusSet === null ? statuses.length : statuses.filter((status) => statusSet.includes(status)).length;
}

export function getRestaurantOrderStatusTone(status: FoodOrderStatus): {
  colorClassName: string;
  icon: string;
} {
  switch (status) {
    case 'pending_payment':
    case 'pending':
      return { colorClassName: 'bg-orange-500/10 text-orange-400', icon: 'schedule' };
    case 'confirmed':
    case 'accepted':
      return { colorClassName: 'bg-green-500/10 text-green-400', icon: 'check_circle' };
    case 'preparing':
      return { colorClassName: 'bg-blue-500/10 text-blue-400', icon: 'shopping_bag' };
    case 'ready':
      return { colorClassName: 'bg-purple-500/10 text-purple-400', icon: 'check_circle' };
    case 'driver_heading_to_restaurant':
    case 'driver_arrived_restaurant':
    case 'picked_up':
    case 'out_for_delivery':
    case 'arriving':
    case 'delivering':
      return { colorClassName: 'bg-indigo-500/10 text-indigo-400', icon: 'delivery_dining' };
    case 'delivered':
      return { colorClassName: 'bg-emerald-500/10 text-emerald-400', icon: 'check_circle' };
    case 'no_driver_available':
      return { colorClassName: 'bg-orange-500/10 text-orange-400', icon: 'warning' };
    case 'cancelled':
    case 'cancelled_by_restaurant':
      return { colorClassName: 'bg-destructive/10 text-destructive', icon: 'cancel' };
    default:
      return { colorClassName: 'bg-white/5 text-slate-400', icon: 'schedule' };
  }
}

export function getRestaurantOrderDetailsClassName(isExpanded: boolean): string {
  return `${isExpanded ? 'block' : 'hidden'} lg:block`;
}

export function getRestaurantOrderFilterStatusSet(group: RestaurantOrderFilterGroup): FoodOrderStatus[] | null {
  return group === 'all' ? null : RESTAURANT_ORDER_FILTER_STATUS_SETS[group];
}

export function getRestaurantOrderFilterClassName(isActive: boolean): string {
  return `min-h-10 shrink-0 rounded-xl border px-3.5 py-2 text-sm font-semibold leading-5 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
    isActive
      ? 'border-primary bg-primary text-[#1a1305] shadow-[0_8px_20px_rgba(242,146,0,0.18)]'
      : 'glass-card border-white/10 text-slate-200 hover:border-primary/40 hover:bg-white/10 hover:text-white'
  }`;
}

export function getRestaurantHistoryDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function openRestaurantHistoryDatePicker(input: HTMLInputElement): void {
  input.showPicker?.();
}
