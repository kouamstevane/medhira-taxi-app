'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { RestaurantStatus } from '@/services/roles.service';
import { getRestaurantPortalPath } from '@/app/food/portal/restaurant-portal-paths';

function RestaurantDashboardContent() {
  const router = useRouter();
  const { currentUser, userData, loading: authLoading } = useAuth();

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

    const unsubscribe = onSnapshot(doc(db, 'restaurants', restaurantId), (snap) => {
      if (!snap.exists()) {
        router.replace('/dashboard');
        return;
      }

      const status = (snap.data().status ?? 'pending_approval') as RestaurantStatus;
      if (status === 'pending_approval' || status === 'rejected') {
        router.replace('/restaurant/pending');
        return;
      }
      if (status === 'suspended') {
        router.replace('/restaurant/suspended');
        return;
      }

      if (status === 'approved') {
        router.replace(getRestaurantPortalPath(snap.id));
      }
    });

    return unsubscribe;
  }, [authLoading, currentUser, router, userData]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <LoadingSpinner />
    </div>
  );
}

export default function RestaurantDashboardPage() {
  return <RestaurantDashboardContent />;
}
