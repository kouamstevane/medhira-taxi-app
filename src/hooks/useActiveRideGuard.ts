'use client';
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';

const ACTIVE_RIDE_STATUSES = ['accepted', 'in_progress', 'en_route'] as const;

export function useActiveRideGuard(): { hasActiveRide: boolean; loading: boolean } {
  const { currentUser, userData } = useAuth();
  const [hasActiveRide, setHasActiveRide] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const isDriver = Boolean(currentUser && userData?.roles?.driver);

  useEffect(() => {
    if (!isDriver || !currentUser) return;
    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', currentUser.uid),
      where('status', 'in', ACTIVE_RIDE_STATUSES as unknown as string[])
    );
    const u: Unsubscribe = onSnapshot(q, (snap) => {
      setHasActiveRide(!snap.empty);
      setSnapshotLoading(false);
    });
    return () => u();
  }, [currentUser, isDriver]);

  return { hasActiveRide: isDriver ? hasActiveRide : false, loading: isDriver ? snapshotLoading : false };
}
