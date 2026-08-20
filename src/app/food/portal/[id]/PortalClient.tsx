"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { auth } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import type { Restaurant } from '@/types';
import { formatCurrencyWithCode } from '@/utils/format';
import { getOpeningHoursForDate, isRestaurantOpenAt, normalizeOpeningHours } from '@/utils/restaurant-hours';
import Link from 'next/link';
import { BottomNav, portalNavItems } from '@/components/ui/BottomNav';
import { RestaurantPortalPayoutBanner } from '@/components/restaurant/RestaurantPortalPayoutBanner';
import { RestaurantPortalHeader } from './RestaurantPortalHeader';
import { getRestaurantPortalPath } from '../restaurant-portal-paths';

export default function PortalClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('restaurantId')?.trim() || null;
  const { showError, toasts, removeToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [stats, setStats] = useState({
    todayOrders: 0,
    pendingOrders: 0,
    todayRevenue: 0,
    totalReviews: 0,
    avgRating: 0
  });

  useEffect(() => {
    if (!id) {
      router.replace('/restaurant/dashboard');
    }
  }, [id, router]);

  useEffect(() => {
    if (!id) return;
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  if (!restaurant || !id) return null;

  const now = new Date();
  const todayHours = getOpeningHoursForDate(
    normalizeOpeningHours(restaurant.openingHours),
    now,
  );
  const isRestaurantOpen = isRestaurantOpenAt(restaurant, now);

  return (
    <div className="min-h-screen bg-background">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <RestaurantPortalHeader restaurantName={restaurant.name} logoUrl={restaurant.logoUrl} />

      <main className="max-w-6xl mx-auto p-4 sm:p-8">

        {/* Verification Alert if Pending */}
        {restaurant.status !== 'approved' && (
          <div className="mb-8 p-4 bg-primary/10 border border-primary/20 rounded-2xl flex items-center gap-4 animate-pulse">
            <MaterialIcon name="error" size="lg" className="text-primary shrink-0" />
            <p className="text-sm text-primary font-medium">
              Votre restaurant est en attente de validation. Certaines fonctionnalités seront limitées tant que l'administration n'aura pas approuvé votre compte.
            </p>
          </div>
        )}

        <RestaurantPortalPayoutBanner
          status={restaurant.status}
          stripeConnectStatus={restaurant.stripeConnectStatus}
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="glass-card p-5 rounded-3xl border border-white/5">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4">
              <MaterialIcon name="inventory_2" size="md" className="text-blue-400" />
            </div>
            <p className="text-sm text-slate-400 font-medium mb-1">Commandes aujourd'hui</p>
            <h3 className="text-2xl font-bold text-white">{stats.todayOrders}</h3>
          </div>

          <div className="glass-card p-5 rounded-3xl border border-white/5">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
              <MaterialIcon name="schedule" size="md" className="text-primary" />
            </div>
            <p className="text-sm text-slate-400 font-medium mb-1">En cours</p>
            <h3 className="text-2xl font-bold text-primary">{stats.pendingOrders}</h3>
          </div>

          <div className="glass-card p-5 rounded-3xl border border-white/5">
            <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center mb-4">
              <MaterialIcon name="trending_up" size="md" className="text-green-400" />
            </div>
            <p className="text-sm text-slate-400 font-medium mb-1">Chiffre d'aff. (Aujourd'hui)</p>
            <h3 className="text-2xl font-bold text-white">{formatCurrencyWithCode(stats.todayRevenue)}</h3>
          </div>

          <div className="glass-card p-5 rounded-3xl border border-white/5">
            <div className="w-10 h-10 bg-yellow-500/10 rounded-xl flex items-center justify-center mb-4">
              <MaterialIcon name="check_circle" size="md" className="text-yellow-400" />
            </div>
            <p className="text-sm text-slate-400 font-medium mb-1">Note moyenne</p>
            <h3 className="text-2xl font-bold text-white">{stats.avgRating.toFixed(1)} / 5</h3>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main Actions */}
          <div className="lg:col-span-2 space-y-6">
            <div className="hidden lg:grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={() => router.push(getRestaurantPortalPath(id, 'menu'))}
                className="p-6 glass-card border border-white/5 rounded-3xl hover:scale-[1.02] transition cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                    <MaterialIcon name="menu_book" size="lg" className="text-primary" />
                  </div>
                  <MaterialIcon name="arrow_forward" size="md" className="text-slate-500 group-hover:translate-x-1 transition" />
                </div>
                <h4 className="text-xl font-bold text-white mb-2">Gérer le Menu</h4>
                <p className="text-slate-400 text-sm">Ajoutez des plats, modifiez les prix et gérez les disponibilités en temps réel.</p>
              </div>

              <div
                onClick={() => router.push(getRestaurantPortalPath(id, 'orders'))}
                className="p-6 glass-card border border-white/5 rounded-3xl hover:scale-[1.02] transition cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
                    <MaterialIcon name="list_alt" size="lg" className="text-blue-400" />
                  </div>
                  <MaterialIcon name="arrow_forward" size="md" className="text-slate-500 group-hover:translate-x-1 transition" />
                </div>
                <h4 className="text-xl font-bold text-white mb-2">Commandes</h4>
                <p className="text-slate-400 text-sm">Suivez les commandes actives, changez les statuts et consultez l'historique.</p>
              </div>
            </div>

          </div>

          {/* Sidebar / Quick Settings */}
          <div className="space-y-6">
            <div className="glass-card p-6 rounded-3xl border border-white/5">
              <h3 className="font-bold text-white mb-6 flex items-center gap-2">
                <MaterialIcon name="settings" size="md" className="text-slate-400" />
                Gérer le Point de Vente
              </h3>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-300">Ouvert actuellement</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${isRestaurantOpen ? 'bg-green-500/15 text-green-400' : 'bg-slate-600/30 text-slate-400'}`}>
                    {isRestaurantOpen ? 'Oui' : 'Non'}
                  </span>
                </div>
                <div className="h-px bg-white/5"></div>
                <div>
                  <p className="text-xs text-slate-500 mb-2">Horaires aujourd'hui</p>
                  <p className="text-sm font-bold text-slate-300">
                    {todayHours.closed ? 'Fermé aujourd’hui' : `${todayHours.open} – ${todayHours.close}`}
                  </p>
                  <Link
                    href={getRestaurantPortalPath(id, 'settings')}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                  >
                    Modifier les horaires
                    <MaterialIcon name="arrow_forward" size="sm" />
                  </Link>
                  <p className="mt-3 text-xs text-slate-500">Les commandes suivent automatiquement les horaires configurés.</p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden glass-card p-6 rounded-3xl border border-primary/20">
              <div className="absolute -top-16 -right-16 w-48 h-48 bg-primary/25 blur-3xl rounded-full pointer-events-none" />
              <div className="absolute -bottom-20 -left-10 w-40 h-40 bg-primary/10 blur-3xl rounded-full pointer-events-none" />

              <div className="relative flex items-center gap-3 mb-3">
                <div className="size-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                  <MaterialIcon name="support_agent" className="text-primary" />
                </div>
                <h3 className="font-bold text-lg text-white">Support Partenaire</h3>
              </div>
              <p className="relative text-slate-400 text-sm mb-6">
                Besoin d&apos;aide avec une commande ou votre compte ?
              </p>
              <button
                onClick={() => window.open('mailto:business@medjira.com', '_blank')}
                className="relative w-full py-3 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform text-sm"
              >
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
      <BottomNav items={portalNavItems(id)} />
    </div>
  );
}
