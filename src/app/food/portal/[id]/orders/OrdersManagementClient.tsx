"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FiChevronLeft, FiClock, FiCheckCircle, 
  FiTruck, FiXCircle, FiMoreVertical,
  FiShoppingBag, FiUser
} from 'react-icons/fi';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { auth } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import type { Restaurant, FoodOrder } from '@/types';
import { formatCurrencyWithCode } from '@/utils/format';

interface OrdersManagementClientProps {
  id: string;
}

export default function OrdersManagementClient({ id }: OrdersManagementClientProps) {
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

        // Subscriptions would be better for real-time, but for now we poll/load
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

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;

  const getStatusColor = (status: FoodOrder['status']) => {
    switch (status) {
      case 'pending': return 'bg-orange-100 text-orange-600';
      case 'confirmed': return 'bg-green-100 text-green-600';
      case 'preparing': return 'bg-blue-100 text-blue-600';
      case 'ready': return 'bg-purple-100 text-purple-600';
      case 'delivering': return 'bg-indigo-100 text-indigo-600';
      case 'delivered': return 'bg-emerald-100 text-emerald-600';
      case 'cancelled': return 'bg-red-100 text-red-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusIcon = (status: FoodOrder['status']) => {
    switch (status) {
      case 'pending': return <FiClock />;
      case 'confirmed': return <FiCheckCircle />;
      case 'preparing': return <FiShoppingBag />;
      case 'ready': return <FiCheckCircle />;
      case 'picked_up': return <FiTruck />;
      case 'delivering': return <FiTruck />;
      case 'delivered': return <FiCheckCircle />;
      case 'cancelled': return <FiXCircle />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-20 px-4 py-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push(`/food/portal/${id}`)} className="p-2 hover:bg-gray-100 rounded-full transition">
            <FiChevronLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#101010]">Commandes</h1>
            <p className="text-xs text-gray-500">{orders.length} commandes au total</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-8">
        
        {/* Filters */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          {['all', 'pending', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s as any)}
              className={`px-4 py-2 rounded-2xl text-sm font-bold whitespace-nowrap transition ${
                filter === s ? 'bg-[#101010] text-white' : 'bg-white border border-gray-100 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? 'Toutes' : s}
            </button>
          ))}
        </div>

        {/* Orders List */}
        <div className="space-y-4">
          {filteredOrders.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()).map(order => (
            <div key={order.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition">
              <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-50">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${getStatusColor(order.status)}`}>
                    {getStatusIcon(order.status)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-[#101010]">Commande #{order.id.slice(-5).toUpperCase()}</h3>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                       <FiClock size={12} /> {order.createdAt.toDate().toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-gray-400 mb-1">Total</p>
                    <p className="font-bold text-red-600">{formatCurrencyWithCode(order.totalOrderPrice)}</p>
                  </div>
                  <div className="flex gap-2">
                    {order.status === 'confirmed' && (
                      <button 
                        onClick={() => updateOrderStatus(order.id, 'preparing')}
                        className="bg-[#101010] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-black transition"
                      >
                        Accepter
                      </button>
                    )}
                    {order.status === 'preparing' && (
                      <button 
                        onClick={() => updateOrderStatus(order.id, 'ready')}
                        className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition"
                      >
                        Prêt
                      </button>
                    )}
                    {order.status === 'pending' && (
                      <button 
                        onClick={() => updateOrderStatus(order.id, 'cancelled')}
                        className="border border-red-200 text-red-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-50 transition"
                      >
                        Refuser
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="p-5 bg-gray-50/50 flex flex-col sm:flex-row gap-6">
                <div className="flex-1">
                  <h4 className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-3">Articles</h4>
                  <div className="space-y-2">
                    {order.orderItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 bg-red-50 text-red-600 rounded-lg flex items-center justify-center text-xs font-bold">{item.itemQuantity}</span>
                          <span className="text-sm font-medium text-gray-700">{item.itemName}</span>
                        </div>
                        <span className="text-xs font-bold text-gray-500">{formatCurrencyWithCode(item.itemPrice * item.itemQuantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="sm:w-64 border-l sm:pl-6 border-gray-100">
                   <h4 className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-3">Client</h4>
                   <div className="flex items-center gap-3 mb-4">
                     <div className="w-10 h-10 bg-white border rounded-full flex items-center justify-center text-gray-400">
                       <FiUser />
                     </div>
                     <div>
                       <p className="text-sm font-bold text-[#101010]">Client ID: {order.userId.slice(0, 8)}</p>
                       <p className="text-xs text-blue-600 hover:underline cursor-pointer">Voir les coordonnées</p>
                     </div>
                   </div>
                   <div className="p-3 bg-white rounded-xl border border-gray-100">
                     <p className="text-[10px] uppercase font-bold text-gray-400 mb-1">Livraison</p>
                     <p className="text-xs text-gray-700 line-clamp-2">{order.deliveryAddress}</p>
                   </div>
                </div>
              </div>
            </div>
          ))}

          {filteredOrders.length === 0 && (
            <div className="py-20 text-center text-gray-400">
               <FiShoppingBag className="h-12 w-12 mx-auto mb-4 opacity-20" />
               <p>Aucune commande trouvée dans cette catégorie.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
