'use client';

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useAuth } from '@/hooks/useAuth';
import type { PersonalDriverTrip } from '@/types/personal-driver';

type TripRow = Partial<PersonalDriverTrip> & { id: string };

export function PersonalDriverDriverPageClient() {
  const { currentUser } = useAuth();
  const [tripId, setTripId] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [assignedTrips, setAssignedTrips] = useState<TripRow[]>([]);

  // Timer state for wait time
  const [isWaiting, setIsWaiting] = useState(false);
  const [waitStartTime, setWaitStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isWaiting && waitStartTime) {
      interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - waitStartTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isWaiting, waitStartTime]);

  const loadAssignedTrips = async () => {
    if (!currentUser?.uid) return;
    setLoadingTrips(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'personal_driver_trips'), where('assignedDriverId', '==', currentUser.uid)),
      );
      setAssignedTrips(
        snap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }) as TripRow)
          .filter((trip) => !['completed', 'cancelled'].includes(trip.status || ''))
          .sort((left, right) => String(left.scheduledAtIso || '').localeCompare(String(right.scheduledAtIso || ''))),
      );
    } catch (err: any) {
      setMessage(`Impossible de charger vos missions: ${err.message}`);
    } finally {
      setLoadingTrips(false);
    }
  };

  useEffect(() => {
    void loadAssignedTrips();
  }, [currentUser?.uid]);

  const handleUpdateStatus = async (status: string) => {
    if (!tripId.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const callable = httpsCallable(functions, 'driverUpdatePersonalDriverTrip');
      await callable({ tripId: tripId.trim(), status });

      if (status === 'driver_arrived') {
        setIsWaiting(true);
        setWaitStartTime(Date.now());
        setElapsedSeconds(0);
        setMessage(`Chauffeur arrivé sur place pour le trajet ${tripId}. Chronomètre d'attente démarré.`);
      } else if (status === 'passenger_picked_up') {
        setIsWaiting(false);
        const elapsedMinutes = Math.ceil(elapsedSeconds / 60);

        // Call Stripe overage charging callable
        const chargeCallable = httpsCallable(functions, 'chargePersonalDriverWaitTimeOverage');
        const chargeRes = (await chargeCallable({
          tripId: tripId.trim(),
          elapsedMinutes,
        })) as { data: { success: boolean; feeBilled: number; overageMinutes: number } };

        if (chargeRes.data?.overageMinutes > 0) {
          setMessage(
            `Passager à bord. Temps d'attente total : ${elapsedMinutes} min (${chargeRes.data.overageMinutes} min de dépassement). Prélèvement Stripe immédiat de ${chargeRes.data.feeBilled.toFixed(2)} $.`,
          );
        } else {
          setMessage(`Passager à bord. Attente de ${elapsedMinutes} min dans les limites gratuites du forfait.`);
        }
      } else {
        setMessage(`Statut du trajet ${tripId} mis à jour : ${status}`);
      }
      void loadAssignedTrips();
    } catch (err: any) {
      setMessage(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-white/10 bg-card p-6 shadow-xl backdrop-blur-xl text-slate-100">
      <div>
        <div className="flex items-center gap-2">
          <MaterialIcon name="local_taxi" size="md" className="text-primary" />
          <h1 className="text-2xl font-black text-white">
            Espace Chauffeur — Missions Personal Driver
          </h1>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Gestion des statuts en temps réel et chronomètre du temps d'attente.
        </p>
      </div>

      {message && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-xs font-semibold text-primary">
          {message}
        </div>
      )}

      <section className="rounded-xl border border-white/10 bg-white/5 p-4" aria-label="Missions attribuées">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <MaterialIcon name="assignment" size="sm" className="text-primary" />
            Mes missions
          </h2>
          <button
            type="button"
            onClick={loadAssignedTrips}
            disabled={loadingTrips || !currentUser?.uid}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-300 disabled:opacity-50"
          >
            <MaterialIcon name="refresh" size="sm" />
            Actualiser
          </button>
        </div>
        <div className="space-y-2">
          {assignedTrips.length === 0 ? (
            <p className="rounded-lg border border-white/5 bg-black/10 p-3 text-xs text-slate-400">
              Aucune mission active attribuée pour le moment.
            </p>
          ) : (
            assignedTrips.map((trip) => (
              <button
                key={trip.id}
                type="button"
                onClick={() => setTripId(trip.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  tripId === trip.id ? 'border-primary bg-primary/10' : 'border-white/10 bg-black/10 hover:bg-white/5'
                }`}
              >
                <span className="block text-xs font-bold text-white">{trip.id}</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {trip.status || 'statut inconnu'} · {trip.scheduledAtIso || 'horaire non renseigné'}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {trip.pickupAddress || 'départ'} → {trip.destinationAddress || 'destination'}
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      {isWaiting && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-center space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center justify-center gap-1">
            <MaterialIcon name="timer" size="sm" className="animate-spin" />
            Chronomètre d'attente en cours
          </span>
          <div className="text-4xl font-black text-amber-300 font-mono">
            {formatTimer(elapsedSeconds)}
          </div>
          <p className="text-xs text-slate-400">
            Le décompte a démarré à votre arrivée. Le dépassement sera prélevé automatiquement à la prise en charge du passager.
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Identifiant du trajet attribué
          </label>
          <input
            type="text"
            placeholder="Ex: sub-123_0"
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            className="min-h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          <button
            type="button"
            onClick={() => handleUpdateStatus('driver_en_route')}
            disabled={loading || !tripId.trim()}
            className="min-h-12 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-xs transition"
          >
            En route
          </button>

          <button
            type="button"
            onClick={() => handleUpdateStatus('driver_arrived')}
            disabled={loading || !tripId.trim()}
            className="min-h-12 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-xs transition"
          >
            Arrivé sur place
          </button>

          <button
            type="button"
            onClick={() => handleUpdateStatus('passenger_picked_up')}
            disabled={loading || !tripId.trim()}
            className="min-h-12 rounded-xl font-bold text-white bg-purple-600 hover:bg-purple-500 active:scale-95 disabled:opacity-50 text-xs transition"
          >
            Passager récupéré
          </button>

          <button
            type="button"
            onClick={() => handleUpdateStatus('in_progress')}
            disabled={loading || !tripId.trim()}
            className="min-h-12 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-500 active:scale-95 disabled:opacity-50 text-xs transition"
          >
            Trajet en cours
          </button>

          <button
            type="button"
            onClick={() => handleUpdateStatus('completed')}
            disabled={loading || !tripId.trim()}
            className="min-h-12 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-xs transition"
          >
            Trajet terminé
          </button>
        </div>
      </div>
    </div>
  );
}
