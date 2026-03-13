'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { FoodOrder } from '@/types/food-delivery';
import { OrderStatusBadge } from '@/components/food/OrderStatusBadge';
import { ArrowLeft, Loader2, ChevronRight, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { CURRENCY_CODE } from '@/utils/constants';

export default function OrdersHistoryPage() {
  const router = useRouter();
  const { currentUser: user } = useAuth() || { currentUser: { uid: 'user_123' } as unknown };
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.uid) {
      loadOrders();
    }
  }, [user]);

  const loadOrders = async () => {
    try {
      const data = await FoodDeliveryService.getUserFoodOrders(user!.uid);
      setOrders(data);
    } catch (error) {
      console.error('Erreur chargement commandes:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: { toDate?: () => Date } | Date | string | number | null | undefined) => {
    if (!timestamp) return '';
    const date = typeof timestamp === 'object' && 'toDate' in timestamp && typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp as string | number | Date);
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 p-4 sticky top-0 z-10 flex items-center justify-between shadow-sm">
        <button onClick={() => router.push('/food')} className="p-2 -ml-2 text-gray-900 bg-gray-50 rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Mes Commandes</h1>
        <div className="w-10"></div>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-gray-100 shadow-sm mt-10">
            <div className="flex justify-center mb-6">
              <div className="bg-primary/5 p-5 rounded-full">
                <ShoppingBag className="w-12 h-12 text-primary" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Aucune commande</h3>
            <p className="text-gray-500 text-sm mb-6">Vous n'avez pas encore passé de commande.</p>
            <button 
              onClick={() => router.push('/food')}
              className="bg-primary text-white font-bold px-6 py-3 rounded-xl shadow-md"
            >
              Découvrir les restaurants
            </button>
          </div>
        ) : (
          orders.map((order) => (
            <div 
              key={order.id} 
              onClick={() => router.push(`/food/orders/${order.id}`)}
              className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{order.restaurantName}</h3>
                  <p className="text-xs text-gray-500 mt-1">{formatDate(order.createdAt)}</p>
                </div>
                <OrderStatusBadge status={order.status} className="shrink-0" />
              </div>

              <div className="border-t border-gray-50 my-3"></div>

              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600 font-medium truncate max-w-[70%]">
                  {order.orderItems.map(i => `${i.itemQuantity}x ${i.itemName}`).join(', ')}
                </p>
                <div className="flex items-center gap-1 font-bold text-gray-900">
                  {order.totalOrderPrice.toFixed(2)} {CURRENCY_CODE}
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
