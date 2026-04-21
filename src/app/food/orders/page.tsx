'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { FoodOrder } from '@/types/food-delivery';
import { OrderStatusBadge } from '@/components/food/OrderStatusBadge';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav } from '@/components/ui/BottomNav';
import { useAuth } from '@/hooks/useAuth';
import { CURRENCY_CODE } from '@/utils/constants';

export default function OrdersHistoryPage() {
  const router = useRouter();
  const { currentUser: user } = useAuth();
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
    <div className="min-h-screen bg-background pb-20 max-w-[430px] mx-auto">
      {/* Header */}
      <div className="bg-background/80 backdrop-blur-xl border-b border-white/5 p-4 sticky top-0 z-20 flex items-center justify-between">
        <button onClick={() => router.push('/food')} className="p-2 -ml-2 text-white bg-white/5 rounded-full hover:bg-white/10">
          <MaterialIcon name="arrow_back" size="lg" />
        </button>
        <h1 className="text-xl font-bold text-white">Mes Commandes</h1>
        <div className="w-10"></div>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <MaterialIcon name="progress_activity" size="xl" className="animate-spin text-primary" />
          </div>
        ) : orders.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center border border-white/5 mt-10">
            <div className="flex justify-center mb-6">
              <div className="bg-primary/10 p-5 rounded-full">
                <MaterialIcon name="shopping_bag" size="xl" className="text-primary" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Aucune commande</h3>
            <p className="text-slate-400 text-sm mb-6">Vous n'avez pas encore passé de commande.</p>
            <button
              onClick={() => router.push('/food')}
              className="bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold px-6 py-3 rounded-xl"
            >
              Découvrir les restaurants
            </button>
          </div>
        ) : (
          orders.map((order) => (
            <div
              key={order.id}
              onClick={() => router.push(`/food/orders/${order.id}`)}
              className="glass-card p-5 rounded-2xl border border-white/5 cursor-pointer hover:bg-white/5 transition-all active:scale-[0.98]"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-white text-lg">{order.restaurantName}</h3>
                  <p className="text-xs text-slate-500 mt-1">{formatDate(order.createdAt)}</p>
                </div>
                <OrderStatusBadge status={order.status} className="shrink-0" />
              </div>

              <div className="border-t border-white/5 my-3"></div>

              <div className="flex justify-between items-center">
                <p className="text-sm text-slate-300 font-medium truncate max-w-[70%]">
                  {order.orderItems.map(i => `${i.itemQuantity}x ${i.itemName}`).join(', ')}
                </p>
                <div className="flex items-center gap-1 font-bold text-white">
                  {order.totalOrderPrice.toFixed(2)} {CURRENCY_CODE}
                  <MaterialIcon name="chevron_right" size="sm" className="text-slate-500" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <BottomNav />
    </div>
  );
}
