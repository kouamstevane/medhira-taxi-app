"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  FiShoppingBag, FiPackage, FiUsers, FiTrendingUp, 
  FiClock, FiCheckCircle, FiAlertCircle, FiSettings,
  FiPlus, FiMenu, FiGrid, FiList, FiArrowRight
} from 'react-icons/fi';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { auth } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import type { Restaurant, FoodOrder } from '@/types';
import { formatCurrencyWithCode } from '@/utils/format';
import Link from 'next/link';

export function generateStaticParams() {
  return [];
}

export default function RestaurantPortalPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { showError, toasts, removeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [stats, setStats] = useState({
    todayOrders: 0,
    pendingOrders: 0,
    todayRevenue: 0,
    totalReviews: 0,
    avgRating: 0
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }

      try {
        const res = await FoodDeliveryService.getRestaurantById(id);
        if (!res) {
          showError("Restaurant introuvable");
          router.push('/dashboard');
          return;
        }

        if (res.ownerId !== user.uid) {
          showError("Accès non autorisé");
          router.push('/dashboard');
          return;
        }

        setRestaurant(res);
        
        // Fetch orders for stats
        const restaurantOrders = await FoodDeliveryService.getRestaurantOrders(id);
        setOrders(restaurantOrders);

        // Calculate stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayOrders = restaurantOrders.filter(o => {
          const orderDate = new Date(o.createdAt.seconds * 1000);
          return orderDate >= today;
        });

        const pendingOrders = restaurantOrders.filter(o => 
          ['confirmed', 'preparing', 'ready'].includes(o.status)
        );

        const todayRevenue = todayOrders
          .filter(o => o.status === 'delivered')
          .reduce((sum, o) => sum + o.totalOrderPrice, 0);

        setStats({
          todayOrders: todayOrders.length,
          pendingOrders: pendingOrders.length,
          todayRevenue,
          totalReviews: res.totalReviews || 0,
          avgRating: res.rating || 0
        });

      } catch (error) {
        console.error("Error loading portal:", error);
        showError("Erreur lors du chargement des données");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [id, router, showError]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner />
      </div>
    );
  }

  if (!restaurant) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-20 px-4 py-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <FiShoppingBag className="text-red-600 h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#101010]">{restaurant.name}</h1>
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Tableau de bord gérant</p>
          </div>
        </div>
        <button 
          onClick={() => router.push('/dashboard')}
          className="text-sm font-bold text-gray-500 hover:text-[#101010] transition"
        >
          Quitter le portail
        </button>
      </div>

      <main className="max-w-6xl mx-auto p-4 sm:p-8">
        
        {/* Verification Alert if Pending */}
        {restaurant.status !== 'approved' && (
          <div className="mb-8 p-4 bg-orange-50 border border-orange-200 rounded-2xl flex items-center gap-4 animate-pulse">
            <FiAlertCircle className="h-6 w-6 text-orange-500 shrink-0" />
            <p className="text-sm text-orange-800 font-medium">
              Votre restaurant est en attente de validation. Certaines fonctionnalités seront limitées tant que l'administration n'aura pas approuvé votre compte.
            </p>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
              <FiPackage className="text-blue-500" />
            </div>
            <p className="text-sm text-gray-500 font-medium mb-1">Commandes aujourd'hui</p>
            <h3 className="text-2xl font-bold text-[#101010]">{stats.todayOrders}</h3>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center mb-4">
              <FiClock className="text-orange-500" />
            </div>
            <p className="text-sm text-gray-500 font-medium mb-1">En cours</p>
            <h3 className="text-2xl font-bold text-[#101010] text-orange-600">{stats.pendingOrders}</h3>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center mb-4">
              <FiTrendingUp className="text-green-500" />
            </div>
            <p className="text-sm text-gray-500 font-medium mb-1">Chiffre d'aff. (Aujourd'hui)</p>
            <h3 className="text-2xl font-bold text-[#101010]">{formatCurrencyWithCode(stats.todayRevenue)}</h3>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
            <div className="w-10 h-10 bg-yellow-50 rounded-xl flex items-center justify-center mb-4">
              <FiCheckCircle className="text-yellow-600" />
            </div>
            <p className="text-sm text-gray-500 font-medium mb-1">Note moyenne</p>
            <h3 className="text-2xl font-bold text-[#101010]">{stats.avgRating.toFixed(1)} / 5</h3>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Actions */}
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div 
                onClick={() => router.push(`/food/portal/${id}/menu`)}
                className="p-6 bg-[#101010] text-white rounded-3xl shadow-xl hover:scale-[1.02] transition cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                    <FiMenu className="h-6 w-6" />
                  </div>
                  <FiArrowRight className="h-5 w-5 text-gray-400 group-hover:translate-x-1 transition" />
                </div>
                <h4 className="text-xl font-bold mb-2">Gérer le Menu</h4>
                <p className="text-gray-400 text-sm">Ajoutez des plats, modifiez les prix et gérez les disponibilités en temps réel.</p>
              </div>

              <div 
                onClick={() => router.push(`/food/portal/${id}/orders`)}
                className="p-6 bg-white border border-gray-100 rounded-3xl shadow-sm hover:scale-[1.02] transition cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                    <FiList className="h-6 w-6" />
                  </div>
                  <FiArrowRight className="h-5 w-5 text-gray-400 group-hover:translate-x-1 transition" />
                </div>
                <h4 className="text-xl font-bold text-[#101010] mb-2">Commandes</h4>
                <p className="text-gray-500 text-sm">Suivez les commandes actives, changez les statuts et consultez l'historique.</p>
              </div>
            </div>

            {/* Recent Orders List */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <h3 className="font-bold text-[#101010]">Commandes Récentes</h3>
                <Link href={`/food/portal/${id}/orders`} className="text-sm font-bold text-red-600 hover:underline">Voir tout</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {orders.slice(0, 5).map((order) => (
                  <div key={order.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        order.status === 'delivered' ? 'bg-green-100 text-green-600' :
                        order.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                        'bg-blue-100 text-blue-600'
                      }`}>
                        <FiPackage />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#101010]">#{order.id.slice(-6).toUpperCase()}</p>
                        <p className="text-xs text-gray-500">{order.orderItems.length} articles • {formatCurrencyWithCode(order.totalOrderPrice)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                          order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                          order.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                          order.status === 'preparing' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {order.status}
                        </span>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(order.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                  </div>
                ))}
                {orders.length === 0 && (
                  <div className="p-12 text-center text-gray-500">
                    <FiPackage className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>Aucune commande pour le moment</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar / Quick Settings */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="font-bold text-[#101010] mb-6 flex items-center gap-2">
                <FiSettings className="text-gray-400" /> 
                Gérer le Point de Vente
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Ouvert actuellement</span>
                  <button 
                    className={`w-12 h-6 rounded-full transition relative ${restaurant.isOpen ? 'bg-green-500' : 'bg-gray-300'}`}
                    onClick={async () => {
                      try {
                        await FoodDeliveryService.updateRestaurantStatus(id, restaurant.status, { isOpen: !restaurant.isOpen });
                        setRestaurant(prev => prev ? { ...prev, isOpen: !prev.isOpen } : null);
                      } catch (err) {
                        showError("Erreur lors de la mise à jour");
                      }
                    }}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${restaurant.isOpen ? 'left-7' : 'left-1'}`}></div>
                  </button>
                </div>
                <div className="h-px bg-gray-50"></div>
                <div>
                  <p className="text-xs text-gray-400 mb-2">Horaires aujourd'hui</p>
                  <p className="text-sm font-bold text-gray-700">08:00 - 22:00</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-red-500 to-red-600 p-6 rounded-3xl text-white shadow-lg shadow-red-200">
              <h3 className="font-bold text-lg mb-2">Support Partenaire</h3>
              <p className="text-white/80 text-sm mb-6 flex items-center gap-2">
                Besoin d'aide avec une commande ou votre compte ?
              </p>
              <button className="w-full py-3 bg-white text-red-600 font-bold rounded-2xl hover:bg-gray-100 transition shadow-sm text-sm">
                Contacter Medjira Business
              </button>
            </div>
          </div>

        </div>

      </main>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
