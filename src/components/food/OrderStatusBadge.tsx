import React from 'react';
import { FoodOrderStatus } from '@/types/food-delivery';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';

interface OrderStatusBadgeProps {
  status: FoodOrderStatus;
  className?: string;
}

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ status, className = '' }) => {
  const { t } = useTranslation();

  const getStatusConfig = (status: FoodOrderStatus) => {
    switch (status) {
      case 'pending_payment':
        return {
          label: t('food.statuses.pending_payment'),
          color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          icon: 'schedule'
        };
      case 'pending':
        return {
          label: t('food.statuses.pending'),
          color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
          icon: 'schedule'
        };
      case 'confirmed':
        return {
          label: t('food.statuses.confirmed'),
          color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          icon: 'check_circle'
        };
      case 'accepted':
        return {
          label: t('food.statuses.accepted'),
          color: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
          icon: 'check_circle'
        };
      case 'preparing':
        return {
          label: t('food.statuses.preparing'),
          color: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
          icon: 'restaurant'
        };
      case 'ready':
        return {
          label: t('food.statuses.ready'),
          color: 'bg-green-500/10 text-green-400 border-green-500/20',
          icon: 'shopping_bag'
        };
      case 'driver_heading_to_restaurant':
        return {
          label: t('food.statuses.driver_heading_to_restaurant'),
          color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
          icon: 'directions_car'
        };
      case 'driver_arrived_restaurant':
        return {
          label: t('food.statuses.driver_arrived_restaurant'),
          color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
          icon: 'storefront'
        };
      case 'picked_up':
        return {
          label: t('food.statuses.picked_up'),
          color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          icon: 'directions_bike'
        };
      case 'out_for_delivery':
      case 'delivering':
        return {
          label: t('food.statuses.out_for_delivery'),
          color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          icon: 'delivery_dining'
        };
      case 'arriving':
        return {
          label: t('food.statuses.arriving'),
          color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          icon: 'location_on'
        };
      case 'delivered':
        return {
          label: t('food.statuses.delivered'),
          color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          icon: 'check_circle'
        };
      case 'no_driver_available':
        return {
          label: t('food.statuses.no_driver_available'),
          color: 'bg-destructive/10 text-destructive border-destructive/20',
          icon: 'warning'
        };
      case 'cancelled':
        return {
          label: t('food.statuses.cancelled'),
          color: 'bg-destructive/10 text-destructive border-destructive/20',
          icon: 'cancel'
        };
      case 'cancelled_by_restaurant':
        return {
          label: t('food.statuses.cancelled_by_restaurant'),
          color: 'bg-destructive/10 text-destructive border-destructive/20',
          icon: 'cancel'
        };
      default:
        return {
          label: t('food.statuses.unknown'),
          color: 'bg-white/5 text-slate-400 border-white/10',
          icon: 'schedule'
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${config.color} ${className}`}>
      <MaterialIcon name={config.icon} size="sm" />
      <span>{config.label}</span>
    </div>
  );
};
