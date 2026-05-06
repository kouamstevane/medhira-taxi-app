'use client';
import { useEffect, useState } from 'react';
import { onSnapshot, doc, type Unsubscribe } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { DriverStatus, RestaurantStatus, StripeConnectStatus } from '@/services/roles.service';

export type EffectiveRoleStatuses = {
  driver: { status: DriverStatus; loading: boolean } | null;
  restaurant: {
    status: RestaurantStatus;
    stripeConnectStatus: StripeConnectStatus;
    restaurantId: string;
    loading: boolean;
  } | null;
};

export function useEffectiveRoleStatus(): EffectiveRoleStatuses {
  const { currentUser, userData } = useAuth();
  const [state, setState] = useState<EffectiveRoleStatuses>({
    driver: null,
    restaurant: null,
  });

  useEffect(() => {
    if (!currentUser || !userData) return;
    const unsubs: Unsubscribe[] = [];

    if (userData.roles?.driver) {
      const u = onSnapshot(doc(db, 'drivers', currentUser.uid), (snap) => {
        const d = snap.data();
        setState((s) => ({
          ...s,
          driver: {
            status: (d?.status ?? 'pending') as DriverStatus,
            loading: false,
          },
        }));
      });
      unsubs.push(u);
    }

    if (userData.roles?.restaurant?.restaurantId) {
      const restaurantId = userData.roles.restaurant.restaurantId;
      const u = onSnapshot(doc(db, 'restaurants', restaurantId), (snap) => {
        const d = snap.data();
        setState((s) => ({
          ...s,
          restaurant: {
            restaurantId,
            status: (d?.status ?? 'pending_approval') as RestaurantStatus,
            stripeConnectStatus: (d?.stripeConnectStatus ?? 'not_started') as StripeConnectStatus,
            loading: false,
          },
        }));
      });
      unsubs.push(u);
    }

    return () => unsubs.forEach((u) => u());
  }, [currentUser, userData]);

  return state;
}
