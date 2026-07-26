'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { StripeConnectBanner } from '@/components/restaurant/StripeConnectBanner';
import { RoleSwitcher } from '@/components/role/RoleSwitcher';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import toast from 'react-hot-toast';
import type { StripeConnectStatus, RestaurantStatus } from '@/services/roles.service';

function RestaurantDashboardContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { currentUser, userData, loading: authLoading } = useAuth();
  const [restaurantData, setRestaurantData] = useState<{
    id: string;
    status: RestaurantStatus;
    stripeConnectStatus: StripeConnectStatus;
    name: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.get('welcome') === '1') {
      toast.success('Bienvenue ! Votre restaurant a été approuvé.');
    }
  }, [params]);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      router.replace('/login');
      return;
    }
    const restaurantId = userData?.roles?.restaurant?.restaurantId;
    if (!restaurantId) {
      router.replace('/dashboard');
      return;
    }

    const u = onSnapshot(doc(db, 'restaurants', restaurantId), (snap) => {
      if (!snap.exists()) {
        router.replace('/dashboard');
        return;
      }
      const d = snap.data();
      const status = (d.status ?? 'pending_approval') as RestaurantStatus;
      const stripeConnectStatus = (d.stripeConnectStatus ?? 'not_started') as StripeConnectStatus;

      if (status === 'pending_approval' || status === 'rejected') {
        router.replace('/restaurant/pending');
        return;
      }
      if (status === 'suspended') {
        router.replace('/restaurant/suspended');
        return;
      }

      setRestaurantData({ id: snap.id, status, stripeConnectStatus, name: d.name ?? '' });
      setLoading(false);
      
      // Auto-redirection vers le portail actif si le restaurant est approuvé
      if (status === 'approved') {
        router.replace(`/food/portal/${snap.id}`);
      }
    });

    return () => u();
  }, [authLoading, currentUser, userData, router]);

  if (authLoading || loading || !restaurantData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased pb-20">
      <div className="max-w-[430px] mx-auto">
        <div className="h-12" />
        <div className="px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-lg">
              <MaterialIcon name="restaurant" className="text-primary" />
            </div>
            <div>
              <p className="text-white font-semibold">{restaurantData.name}</p>
              <p className="text-slate-400 text-xs">Espace Gérant Restaurant</p>
            </div>
          </div>
          <RoleSwitcher />
        </div>

        <div className="px-6 mt-6 space-y-4">
          <StripeConnectBanner status={restaurantData.stripeConnectStatus} />

          {/* Raccordement direct vers le Portail Restaurateur Fonctionnel */}
          <div className="glass-card p-6 rounded-3xl border border-white/10 space-y-4 text-center">
            <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-primary">
              <MaterialIcon name="storefront" size="xl" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Portail Restaurateur</h3>
              <p className="text-slate-400 text-sm">Gérez vos commandes en direct, votre menu et vos statistiques de vente.</p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={() => router.push(`/food/portal/${restaurantData.id}`)}
                className="w-full bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 primary-glow hover:opacity-90 transition"
              >
                <MaterialIcon name="dashboard" size="md" />
                Accéder au Portail Restaurant
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => router.push(`/food/portal/${restaurantData.id}/orders`)}
                  className="glass-card p-3 rounded-xl border border-white/5 hover:bg-white/5 transition flex items-center justify-center gap-2 text-xs font-semibold text-white"
                >
                  <MaterialIcon name="shopping_bag" size="sm" className="text-primary" />
                  Commandes
                </button>

                <button
                  onClick={() => router.push(`/food/portal/${restaurantData.id}/menu`)}
                  className="glass-card p-3 rounded-xl border border-white/5 hover:bg-white/5 transition flex items-center justify-center gap-2 text-xs font-semibold text-white"
                >
                  <MaterialIcon name="menu_book" size="sm" className="text-primary" />
                  Gérer le Menu
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RestaurantDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    }>
      <RestaurantDashboardContent />
    </Suspense>
  );
}
