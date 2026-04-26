import React from 'react';
import { FoodOrderStatus } from '@/types/food-delivery';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

interface OrderStatusBadgeProps {
  status: FoodOrderStatus;
  className?: string;
}

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ status, className = '' }) => {
  const getStatusConfig = (status: FoodOrderStatus) => {
    switch (status) {
      case 'pending_payment':
        return {
          label: 'Paiement en attente',
          color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          icon: 'schedule'
        };
      case 'pending':
        return {
          label: 'En attente',
          color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
          icon: 'schedule'
        };
      case 'confirmed':
        return {
          label: 'Confirmée',
          color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
          icon: 'check_circle'
        };
      case 'preparing':
        return {
          label: 'En préparation',
          color: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
          icon: 'restaurant'
        };
      case 'ready':
        return {
          label: 'Prête',
          color: 'bg-green-500/10 text-green-400 border-green-500/20',
          icon: 'shopping_bag'
        };
      case 'picked_up':
        return {
          label: 'Récupérée',
          color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
          icon: 'directions_bike'
        };
      case 'delivering':
        return {
          label: 'En livraison',
          color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          icon: 'delivery_dining'
        };
      case 'delivered':
        return {
          label: 'Livrée',
          color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          icon: 'check_circle'
        };
      case 'cancelled':
        return {
          label: 'Annulée',
          color: 'bg-destructive/10 text-destructive border-destructive/20',
          icon: 'cancel'
        };
      default:
        return {
          label: 'Inconnu',
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
