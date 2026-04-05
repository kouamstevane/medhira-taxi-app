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

export default function DriverHistoriquePage() {
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
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const snap = await getDocs(q);
        setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() } as TripRecord)));
      } catch (e) {
        console.error('Erreur chargement historique:', e);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const statusLabel: Record<string, { label: string; color: string }> = {
    completed: { label: 'Terminée', color: 'text-green-400 bg-green-400/10' },
    cancelled: { label: 'Annulée', color: 'text-red-400 bg-red-400/10' },
    accepted: { label: 'En cours', color: 'text-blue-400 bg-blue-400/10' },
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-white/5 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-white/5 transition">
          <MaterialIcon name="arrow_back" size="md" className="text-white" />
        </button>
        <h1 className="text-xl font-bold text-white flex-1">Historique des courses</h1>
      </header>

      <main className="max-w-[430px] mx-auto px-4 py-6 space-y-3">
        {loading ? (
          <div className="flex justify-center py-20">
            <MaterialIcon name="progress_activity" size="xl" className="animate-spin text-primary" />
          </div>
        ) : trips.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center border border-white/5 mt-10">
            <div className="bg-primary/10 p-5 rounded-full w-fit mx-auto mb-4">
              <MaterialIcon name="history" size="xl" className="text-primary" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Aucune course</h3>
            <p className="text-slate-400 text-sm">Votre historique apparaîtra ici.</p>
          </div>
        ) : (
          trips.map(trip => {
            const s = statusLabel[trip.status] ?? { label: trip.status, color: 'text-slate-400 bg-white/5' };
            return (
              <div key={trip.id} className="glass-card p-4 rounded-2xl border border-white/5">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Course #{trip.id.slice(-4)}</span>
                    <p className="text-xs text-slate-500 mt-0.5">{formatFirestoreDate(trip.createdAt)}</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${s.color}`}>{s.label}</span>
                </div>
                <div className="space-y-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="size-2 rounded-full bg-primary shrink-0" />
                    <p className="text-sm text-slate-300 truncate">{trip.pickup}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="size-2 rounded-full bg-white/40 shrink-0" />
                    <p className="text-sm text-slate-300 truncate">{trip.destination}</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <span className="font-bold text-white">{formatCurrencyWithCode(trip.price)}</span>
                </div>
              </div>
            );
          })
        )}
      </main>
      <BottomNav items={driverNavItems} />
    </div>
  );
}
