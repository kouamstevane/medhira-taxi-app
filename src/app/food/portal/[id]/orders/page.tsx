"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  FiPackage, FiClock, FiCheckCircle, FiXCircle, 
  FiChevronLeft, FiSearch, FiFilter, FiExternalLink,
  FiPhone, FiUser, FiMapPin, FiRefreshCw, FiList
} from 'react-icons/fi';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { auth } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import type { Restaurant, FoodOrder, FoodOrderStatus } from '@/types';
import { formatCurrencyWithCode } from '@/utils/format';

export function generateStaticParams() {
  return [];
}

type TabType = 'active' | 'completed' | 'cancelled';

export default function OrderManagementPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { showError, showSuccess, toasts, removeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [selectedOrder, setSelectedOrder] = useState<FoodOrder | null>(null);

  const fetchOrders = async () => {
    setRefreshing(true);
    try {
      let statuses: FoodOrderStatus[] = [];
      if (activeTab === 'active') {
        statuses = ['pending', 'confirmed', 'preparing', 'ready', 'picked_up'];
      } else if (activeTab === 'completed') {
        statuses = ['delivered'];
      } else {
        statuses = ['cancelled'];
      }

      const res = await FoodDeliveryService.getRestaurantOrders(id, statuses);
      setOrders(res);
    } catch (error) {
      console.error("Error fetching orders:", error);
      showError("Erreur lors de la récupération des commandes");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }

      const res = await FoodDeliveryService.getRestaurantById(id);
      if (!res || res.ownerId !== user.uid) {
        router.push('/dashboard');
        return;
      }
      setRestaurant(res);
      fetchOrders();
    });

    return () => unsubscribe();
  }, [id, activeTab]);

  const handleUpdateStatus = async (orderId: string, newStatus: FoodOrderStatus) => {
    try {
      await FoodDeliveryService.updateFoodOrderStatus(orderId, newStatus);
      showSuccess(`Statut mis à jour : ${newStatus}`);
      fetchOrders();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (error) {
      showError("Erreur lors de la mise à jour");
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col h-screen overflow-hidden">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <header className="bg-white border-b px-4 py-4 sm:px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push(`/food/portal/${id}`)} className="p-2 hover:bg-gray-100 rounded-full transition">
            <FiChevronLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#101010]">Gestion des Commandes</h1>
            <p className="text-xs text-gray-500">Gérez le flux de vos préparations</p>
          </div>
        </div>
        <button 
          onClick={fetchOrders}
          disabled={refreshing}
          className={`p-3 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 transition ${refreshing ? 'animate-spin' : ''}`}
        >
          <FiRefreshCw />
        </button>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b px-4 sm:px-8 shrink-0">
        <div className="flex gap-8">
          {(['active', 'completed', 'cancelled'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 text-sm font-bold border-b-2 transition relative ${
                activeTab === tab 
                  ? 'border-red-600 text-red-600' 
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'active' && orders.length > 0 && (
                <span className="ml-2 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {orders.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 flex overflow-hidden">
        
        {/* Orders List */}
        <div className="w-full lg:w-1/3 border-r bg-white overflow-y-auto">
          {orders.map((order) => (
            <div 
              key={order.id}
              onClick={() => setSelectedOrder(order)}
              className={`p-6 border-b cursor-pointer transition relative hover:bg-gray-50 ${
                selectedOrder?.id === order.id ? 'bg-red-50 border-r-4 border-r-red-600' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400">#{order.id.slice(-6).toUpperCase()}</span>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  order.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                  order.status === 'preparing' ? 'bg-blue-100 text-blue-700' :
                  order.status === 'ready' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {order.status}
                </span>
              </div>
              <h4 className="font-bold text-[#101010] mb-1">
                {order.orderItems.length} article{order.orderItems.length > 1 ? 's' : ''}
              </h4>
              <p className="text-sm text-gray-500 mb-3">{formatCurrencyWithCode(order.totalOrderPrice)}</p>
              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                <FiClock />
                <span>{new Date(order.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="mx-1">•</span>
                <span>{new Date(order.createdAt.seconds * 1000).toLocaleDateString()}</span>
              </div>
            </div>
          ))}

          {orders.length === 0 && (
            <div className="py-20 text-center text-gray-400 px-6">
              <FiPackage className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <h3 className="font-bold text-gray-800">Aucune commande</h3>
              <p className="text-sm">Les commandes {activeTab} apparaîtront ici.</p>
            </div>
          )}
        </div>

        {/* Order Details */}
        <div className="hidden lg:flex flex-1 bg-gray-50 overflow-y-auto p-8">
          {selectedOrder ? (
            <div className="max-w-3xl mx-auto w-full animate-fadeIn">
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-8">
                {/* Order Header */}
                <div className="p-8 bg-[#101010] text-white">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold">Commande #{selectedOrder.id.slice(-6).toUpperCase()}</h2>
                      <p className="text-gray-400 text-sm">{new Date(selectedOrder.createdAt.seconds * 1000).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 uppercase font-bold mb-1">Total</p>
                      <p className="text-3xl font-bold text-red-500">{formatCurrencyWithCode(selectedOrder.totalOrderPrice)}</p>
                    </div>
                  </div>

                  {/* Quick Status Actions */}
                  <div className="flex gap-2">
                    {selectedOrder.status === 'pending' && (
                      <button 
                        onClick={() => handleUpdateStatus(selectedOrder.id, 'confirmed')}
                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition shadow-lg shadow-blue-900/20"
                      >
                        Confirmer la commande
                      </button>
                    )}
                    {selectedOrder.status === 'confirmed' && (
                      <button 
                        onClick={() => handleUpdateStatus(selectedOrder.id, 'preparing')}
                        className="flex-1 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition shadow-lg shadow-orange-900/20"
                      >
                        Commencer la préparation
                      </button>
                    )}
                    {selectedOrder.status === 'preparing' && (
                      <button 
                        onClick={() => handleUpdateStatus(selectedOrder.id, 'ready')}
                        className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl transition shadow-lg shadow-green-900/20"
                      >
                        Prêt pour ramassage
                      </button>
                    )}
                    
                    {['pending', 'confirmed'].includes(selectedOrder.status) && (
                      <button 
                        onClick={() => handleUpdateStatus(selectedOrder.id, 'cancelled')}
                        className="px-6 py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-bold rounded-2xl transition"
                      >
                        Annuler
                      </button>
                    )}
                  </div>
                </div>

                {/* Items */}
                <div className="p-8 border-b">
                  <h3 className="font-bold text-[#101010] mb-6 flex items-center gap-2">
                    <FiList className="text-gray-400" /> Articles
                  </h3>
                  <div className="space-y-4">
                    {selectedOrder.orderItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center font-bold text-xs">
                            {item.itemQuantity}x
                          </div>
                          <div>
                            <p className="font-bold text-[#101010]">{item.itemName}</p>
                            <p className="text-xs text-gray-400">{formatCurrencyWithCode(item.itemPrice)} / unité</p>
                          </div>
                        </div>
                        <p className="font-bold">{formatCurrencyWithCode(item.itemPrice * item.itemQuantity)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Customer info */}
                <div className="p-8">
                  <h3 className="font-bold text-[#101010] mb-6 flex items-center gap-2">
                    <FiUser className="text-gray-400" /> Informations Client
                  </h3>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 shrink-0">
                          <FiPhone />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 font-bold uppercase mb-1">Contact</p>
                          <p className="text-sm font-bold">{selectedOrder.customerPhone || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 shrink-0">
                          <FiMapPin />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 font-bold uppercase mb-1">Adresse de livraison</p>
                          <p className="text-sm font-medium">{selectedOrder.deliveryAddress || 'Adresse non spécifiée'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm mb-6">
                <FiPackage size={40} className="opacity-20" />
              </div>
              <p className="font-medium">Sélectionnez une commande pour voir les détails</p>
            </div>
          )}
        </div>

      </main>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
