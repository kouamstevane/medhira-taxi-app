'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav, driverNavItems } from '@/components/ui/BottomNav';
import { formatCurrencyWithCode, formatFirestoreDate } from '@/utils/format';
import { type TripRecord } from '../_shared';

export default function DriverGainsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/driver/login'); return; }

      try {
        const q = query(
          collection(db, 'bookings'),
          where('driverId', '==', user.uid),
          where('status', '==', 'completed'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const snap = await getDocs(q);
        setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() } as TripRecord)));
      } catch (e) {
        console.error('Erreur chargement gains:', e);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const toDate = (ts: { seconds: number } | Date | null): Date | null => {
    if (!ts) return null;
    return ts instanceof Date ? ts : new Date((ts as { seconds: number }).seconds * 1000);
  };

  const today = new Date().toDateString();
  const { totalGains, todayGains } = trips.reduce(
    (acc, t) => {
      const price = t.price || 0;
      acc.totalGains += price;
      const d = toDate(t.createdAt);
      if (d && d.toDateString() === today) acc.todayGains += price;
      return acc;
    },
    { totalGains: 0, todayGains: 0 }
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-white/5 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-white/5 transition">
          <MaterialIcon name="arrow_back" size="md" className="text-white" />
        </button>
        <h1 className="text-xl font-bold text-white flex-1">Mes gains</h1>
      </header>

      <main className="max-w-[430px] mx-auto px-4 py-6 space-y-6">
        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="glass-card p-4 rounded-2xl border border-white/5">
            <p className="text-xs text-slate-400 mb-1">Aujourd'hui</p>
            <p className="text-2xl font-black text-primary">{formatCurrencyWithCode(todayGains)}</p>
          </div>
          <div className="glass-card p-4 rounded-2xl border border-white/5">
            <p className="text-xs text-slate-400 mb-1">Total ({trips.length} courses)</p>
            <p className="text-2xl font-black text-white">{formatCurrencyWithCode(totalGains)}</p>
          </div>
        </div>

        {/* Trip list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <MaterialIcon name="progress_activity" size="xl" className="animate-spin text-primary" />
          </div>
        ) : trips.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center border border-white/5">
            <div className="bg-primary/10 p-5 rounded-full w-fit mx-auto mb-4">
              <MaterialIcon name="payments" size="xl" className="text-primary" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Aucun gain</h3>
            <p className="text-slate-400 text-sm">Vos gains apparaîtront ici après vos premières courses.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-white">Détail des courses</h2>
            {trips.map(trip => (
              <div key={trip.id} className="glass-card p-4 rounded-2xl border border-white/5 flex items-center gap-4">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <MaterialIcon name="local_taxi" size="md" className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{trip.pickup} → {trip.destination}</p>
                  <p className="text-xs text-slate-500">{formatFirestoreDate(trip.createdAt)}</p>
                </div>
                <span className="font-bold text-green-400 shrink-0">+{formatCurrencyWithCode(trip.price)}</span>
              </div>
            ))}
          </div>
        )}
      </main>
      <BottomNav items={driverNavItems} />
    </div>
  );
}
