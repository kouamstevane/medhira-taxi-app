import React from 'react';
import { FoodOrderStatus } from '@/types/food-delivery';
import { 
  Clock, 
  CheckCircle2, 
  ChefHat, 
  ShoppingBag, 
  Bike, 
  MapPin, 
  CheckCircle, 
  XCircle 
} from 'lucide-react';

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
          color: 'bg-amber-100 text-amber-800 border-amber-200',
          icon: <Clock className="w-4 h-4" />
        };
      case 'pending':
        return {
          label: 'En attente',
          color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
          icon: <Clock className="w-4 h-4" />
        };
      case 'confirmed':
        return {
          label: 'Confirmée',
          color: 'bg-blue-100 text-blue-800 border-blue-200',
          icon: <CheckCircle2 className="w-4 h-4" />
        };
      case 'preparing':
        return {
          label: 'En préparation',
          color: 'bg-orange-100 text-orange-800 border-orange-200',
          icon: <ChefHat className="w-4 h-4" />
        };
      case 'ready':
        return {
          label: 'Prête',
          color: 'bg-green-100 text-green-800 border-green-200',
          icon: <ShoppingBag className="w-4 h-4" />
        };
      case 'picked_up':
        return {
          label: 'Récupérée',
          color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
          icon: <Bike className="w-4 h-4" />
        };
      case 'delivering':
        return {
          label: 'En livraison',
          color: 'bg-purple-100 text-purple-800 border-purple-200',
          icon: <MapPin className="w-4 h-4" />
        };
      case 'delivered':
        return {
          label: 'Livrée',
          color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          icon: <CheckCircle className="w-4 h-4" />
        };
      case 'cancelled':
        return {
          label: 'Annulée',
          color: 'bg-red-100 text-red-800 border-red-200',
          icon: <XCircle className="w-4 h-4" />
        };
      default:
        return {
          label: 'Inconnu',
          color: 'bg-gray-100 text-gray-800 border-gray-200',
          icon: <Clock className="w-4 h-4" />
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${config.color} ${className}`}>
      {config.icon}
      <span>{config.label}</span>
    </div>
  );
};
