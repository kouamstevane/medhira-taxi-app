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

      setRestaurantData({ status, stripeConnectStatus, name: d.name ?? '' });
      setLoading(false);
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
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="max-w-[430px] mx-auto">
        <div className="h-12" />
        <div className="px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-lg">
              <MaterialIcon name="restaurant" className="text-primary" />
            </div>
            <div>
              <p className="text-white font-semibold">{restaurantData.name}</p>
              <p className="text-slate-400 text-xs">Dashboard restaurateur</p>
            </div>
          </div>
          <RoleSwitcher />
        </div>

        <div className="px-6 mt-6 space-y-4">
          <StripeConnectBanner status={restaurantData.stripeConnectStatus} />
        </div>

        <div className="px-6 mt-8">
          <p className="text-slate-500 text-sm text-center">Dashboard restaurant — contenu à venir en P5</p>
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
