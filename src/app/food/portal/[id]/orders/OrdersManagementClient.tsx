"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { auth, db } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import type { Restaurant, FoodOrder } from '@/types';
import { formatCurrencyWithCode } from '@/utils/format';
import { BottomNav, portalNavItems } from '@/components/ui/BottomNav';

export default function OrdersManagementClient() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter();
  const { showError, showSuccess, toasts, removeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [filter, setFilter] = useState<FoodOrder['status'] | 'all'>('all');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }

      try {
        const res = await FoodDeliveryService.getRestaurantById(id);
        if (!res || res.ownerId !== user.uid) {
          router.push('/dashboard');
          return;
        }
        setRestaurant(res);

        const items = await FoodDeliveryService.getRestaurantOrders(id);
        setOrders(items);
      } catch (error) {
        console.error("Error loading orders:", error);
        showError("Erreur lors du chargement des commandes");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [id, router, showError]);

  const updateOrderStatus = async (orderId: string, status: FoodOrder['status']) => {
    try {
      await FoodDeliveryService.updateFoodOrderStatus(orderId, status);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
      showSuccess(`Commande mise à jour : ${status}`);
    } catch (error) {
      showError("Erreur lors de la mise à jour");
    }
  };

  const filteredOrders = filter === 'all'
    ? orders
    : orders.filter(o => o.status === filter);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <LoadingSpinner />
    </div>
  );

  const getStatusColor = (status: FoodOrder['status']) => {
    switch (status) {
      case 'pending': return 'bg-orange-500/10 text-orange-400';
      case 'confirmed': return 'bg-green-500/10 text-green-400';
      case 'preparing': return 'bg-blue-500/10 text-blue-400';
      case 'ready': return 'bg-purple-500/10 text-purple-400';
      case 'delivering': return 'bg-indigo-500/10 text-indigo-400';
      case 'delivered': return 'bg-emerald-500/10 text-emerald-400';
      case 'cancelled': return 'bg-destructive/10 text-destructive';
      default: return 'bg-white/5 text-slate-400';
    }
  };

  const getStatusIcon = (status: FoodOrder['status']) => {
    switch (status) {
      case 'pending': return 'schedule';
      case 'confirmed': return 'check_circle';
      case 'preparing': return 'shopping_bag';
      case 'ready': return 'check_circle';
      case 'picked_up': return 'directions_car';
      case 'delivering': return 'delivery_dining';
      case 'delivered': return 'check_circle';
      case 'cancelled': return 'cancel';
      default: return 'schedule';
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <header className="bg-background/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-20 px-4 py-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push(`/food/portal/${id}`)} className="p-2 hover:bg-white/10 rounded-full transition">
            <MaterialIcon name="arrow_back" size="lg" className="text-slate-300" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Commandes</h1>
            <p className="text-xs text-slate-500">{orders.length} commandes au total</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-8">

        {/* Filters */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          {['all', 'pending', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s as FoodOrder['status'] | 'all')}
              className={`px-4 py-2 rounded-2xl text-sm font-bold whitespace-nowrap transition ${
                filter === s
                  ? 'bg-gradient-to-r from-primary to-[#ffae33] text-white'
                  : 'glass-card border border-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              {s === 'all' ? 'Toutes' : s}
            </button>
          ))}
        </div>

        {/* Orders List */}
        <div className="space-y-4">
          {filteredOrders.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()).map(order => (
            <div key={order.id} className="glass-card rounded-3xl border border-white/5 overflow-hidden hover:border-white/10 transition">
              <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${getStatusColor(order.status)}`}>
                    <MaterialIcon name={getStatusIcon(order.status)} size="md" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white">Commande #{order.id.slice(-5).toUpperCase()}</h3>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <MaterialIcon name="schedule" size="sm" /> {order.createdAt.toDate().toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-slate-500 mb-1">Total</p>
                    <p className="font-bold text-primary">{formatCurrencyWithCode(order.totalOrderPrice)}</p>
                  </div>
                  <div className="flex gap-2">
                    {order.status === 'confirmed' && (
                      <button
                        onClick={async () => {
                          await updateDoc(doc(db, 'food_orders', order.id), {
                            status: 'accepted',
                            updatedAt: serverTimestamp(),
                          });
                          setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'accepted' as FoodOrder['status'] } : o));
                          showSuccess('Commande acceptée — un livreur va être assigné');
                        }}
                        className="w-full h-10 bg-primary text-white text-sm font-bold rounded-xl"
                      >
                        Accepter la commande (assigner un livreur)
                      </button>
                    )}
                    {order.status === 'preparing' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'ready')}
                        className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-500/20 transition"
                      >
                        Prêt
                      </button>
                    )}
                    {order.status === 'pending' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'cancelled')}
                        className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2 rounded-xl text-xs font-bold hover:bg-destructive/20 transition"
                      >
                        Refuser
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-5 bg-white/[0.02] flex flex-col sm:flex-row gap-6">
                <div className="flex-1">
                  <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-3">Articles</h4>
                  <div className="space-y-2">
                    {order.orderItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 bg-primary/10 text-primary rounded-lg flex items-center justify-center text-xs font-bold">{item.itemQuantity}</span>
                          <span className="text-sm font-medium text-slate-300">{item.itemName}</span>
                        </div>
                        <span className="text-xs font-bold text-slate-400">{formatCurrencyWithCode(item.itemPrice * item.itemQuantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="sm:w-64 border-l sm:pl-6 border-white/5">
                  <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-3">Client</h4>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-slate-400">
                      <MaterialIcon name="person" size="md" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Client ID: {order.userId.slice(0, 8)}</p>
                      <p className="text-xs text-primary hover:underline cursor-pointer">Voir les coordonnées</p>
                    </div>
                  </div>
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Livraison</p>
                    <p className="text-xs text-slate-300 line-clamp-2">{order.deliveryAddress}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {filteredOrders.length === 0 && (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <MaterialIcon name="shopping_bag" size="xl" className="text-slate-500" />
              </div>
              <p className="text-slate-400">Aucune commande trouvée dans cette catégorie.</p>
            </div>
          )}
        </div>
      </main>
      <BottomNav items={portalNavItems(id)} />
    </div>
  );
}
