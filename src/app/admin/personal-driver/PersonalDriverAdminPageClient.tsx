'use client';

import React, { useEffect, useState } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import type { PersonalDriverSubscription, PersonalDriverTrip } from '@/types/personal-driver';

type SubscriptionRow = Partial<PersonalDriverSubscription> & { id: string };
type TripRow = Partial<PersonalDriverTrip> & { id: string };

export function PersonalDriverAdminPageClient() {
  const [subscriptionId, setSubscriptionId] = useState('');
  const [tripId, setTripId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [trips, setTrips] = useState<TripRow[]>([]);

  // Urgent Replacement Modal State (Rule #5)
  const [urgentTripId, setUrgentTripId] = useState('');
  const [newDriverId, setNewDriverId] = useState('');
  const [newVehicleId, setNewVehicleId] = useState('');
  const [showUrgentModal, setShowUrgentModal] = useState(false);

  const loadOperations = async () => {
    setRefreshing(true);
    try {
      const [subscriptionSnap, tripSnap] = await Promise.all([
        getDocs(query(collection(db, 'personal_driver_subscriptions'), limit(30))),
        getDocs(query(collection(db, 'personal_driver_trips'), limit(60))),
      ]);

      setSubscriptions(
        subscriptionSnap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }) as SubscriptionRow)
          .filter((subscription) => ['pending_validation', 'pending_payment', 'active'].includes(subscription.status || ''))
          .slice(0, 8),
      );
      setTrips(
        tripSnap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }) as TripRow)
          .filter((trip) => ['scheduled', 'driver_assigned', 'driver_en_route', 'driver_arrived'].includes(trip.status || ''))
          .slice(0, 12),
      );
    } catch (err: any) {
      setMessage(`Impossible de charger les opérations: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadOperations();
  }, []);

  const handleValidateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscriptionId.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const callable = httpsCallable(functions, 'adminManagePersonalDriver');
      await callable({ action: 'validateSubscription', subscriptionId: subscriptionId.trim() });
      setMessage(`Abonnement ${subscriptionId} validé avec succès.`);
      setSubscriptionId('');
      void loadOperations();
    } catch (err: any) {
      setMessage(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripId.trim() || !driverId.trim() || !vehicleId.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const callable = httpsCallable(functions, 'adminManagePersonalDriver');
      await callable({
        action: 'assignTrip',
        tripId: tripId.trim(),
        driverId: driverId.trim(),
        vehicleId: vehicleId.trim(),
      });
      setMessage(`Trajet ${tripId} attribué au chauffeur ${driverId}.`);
      setTripId('');
      setDriverId('');
      setVehicleId('');
      void loadOperations();
    } catch (err: any) {
      setMessage(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEmergencyReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urgentTripId.trim() || !newDriverId.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const callable = httpsCallable(functions, 'adminManagePersonalDriver');
      await callable({
        action: 'reassignDriverEmergency',
        tripId: urgentTripId.trim(),
        newDriverId: newDriverId.trim(),
        newVehicleId: newVehicleId.trim() || 'VEH-SUR-DISPO',
      });
      setMessage(`Chauffeur de remplacement ${newDriverId} affecté d'urgence au trajet ${urgentTripId}. Réaffectation enregistrée.`);
      setShowUrgentModal(false);
      setUrgentTripId('');
      setNewDriverId('');
      setNewVehicleId('');
      void loadOperations();
    } catch (err: any) {
      setMessage(`Erreur réaffectation: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 rounded-2xl border border-white/10 bg-card p-6 shadow-xl text-slate-100 backdrop-blur-xl">
      <div>
        <div className="flex items-center gap-2">
          <MaterialIcon name="admin_panel_settings" size="md" className="text-primary" />
          <h1 className="text-2xl font-black text-white">
            Administration — Personal Driver Medjira
          </h1>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Validation des abonnements, affectations de la flotte et gestion des alertes d'urgence.
        </p>
      </div>

      {message && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-xs font-semibold text-primary">
          {message}
        </div>
      )}

      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-400">
            <MaterialIcon name="warning" size="md" className="animate-pulse" />
            <h2 className="text-sm font-bold text-white">
              Alertes Retard / Indisponibilité Chauffeur
            </h2>
          </div>
          <span className="rounded-md bg-red-500/20 px-2.5 py-0.5 text-xs font-bold text-red-300 border border-red-500/30">
            Action requise
          </span>
        </div>
        <p className="text-xs leading-relaxed text-slate-300">
          En cas de retard ou d'indisponibilité détectée, l'administrateur est notifié en urgence pour réaffecter un chauffeur de remplacement et informer le client.
        </p>
        <button
          type="button"
          onClick={() => setShowUrgentModal(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-bold text-white hover:bg-red-500 transition active:scale-95"
        >
          <MaterialIcon name="swap_horiz" size="sm" />
          Réaffecter un chauffeur d'urgence
        </button>
      </div>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Opérations Personal Driver">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-white">
              <MaterialIcon name="fact_check" size="sm" className="text-emerald-400" />
              Abonnements à traiter
            </h2>
            <button
              type="button"
              onClick={loadOperations}
              disabled={refreshing}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-300 disabled:opacity-50"
            >
              <MaterialIcon name="refresh" size="sm" />
              Actualiser
            </button>
          </div>
          <div className="space-y-2">
            {subscriptions.length === 0 ? (
              <p className="rounded-lg border border-white/5 bg-black/10 p-3 text-xs text-slate-400">
                Aucun abonnement récent à afficher.
              </p>
            ) : (
              subscriptions.map((subscription) => (
                <button
                  key={subscription.id}
                  type="button"
                  onClick={() => setSubscriptionId(subscription.id)}
                  className="w-full rounded-lg border border-white/10 bg-black/10 p-3 text-left transition hover:bg-white/5"
                >
                  <span className="block text-xs font-bold text-white">{subscription.id}</span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {subscription.status || 'statut inconnu'} · {subscription.planId || 'forfait inconnu'} · {subscription.pickupAddress || 'départ non renseigné'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
            <MaterialIcon name="route" size="sm" className="text-primary" />
            Trajets à affecter ou surveiller
          </h2>
          <div className="space-y-2">
            {trips.length === 0 ? (
              <p className="rounded-lg border border-white/5 bg-black/10 p-3 text-xs text-slate-400">
                Aucun trajet récent à afficher.
              </p>
            ) : (
              trips.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => {
                    setTripId(trip.id);
                    setUrgentTripId(trip.id);
                    if (trip.assignedDriverId) setDriverId(trip.assignedDriverId);
                    if (trip.assignedVehicleId) setVehicleId(trip.assignedVehicleId);
                  }}
                  className="w-full rounded-lg border border-white/10 bg-black/10 p-3 text-left transition hover:bg-white/5"
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
        </div>
      </section>

      <form onSubmit={handleValidateSubscription} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <MaterialIcon name="check_circle" size="sm" className="text-emerald-400" />
          Valider un abonnement client (Post-Paiement)
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="ID de l'abonnement (ex: sub-xyz)"
            value={subscriptionId}
            onChange={(e) => setSubscriptionId(e.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 text-xs text-white outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={loading || !subscriptionId.trim()}
            className="min-h-11 rounded-xl bg-emerald-600 px-6 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 transition"
          >
            {loading ? 'Validation...' : 'Valider l\'abonnement'}
          </button>
        </div>
      </form>

      <form onSubmit={handleAssignTrip} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <MaterialIcon name="person_add" size="sm" className="text-primary" />
          Affecter un chauffeur et un véhicule aux trajets
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="ID du trajet (Trip ID)"
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-xs text-white outline-none focus:border-primary"
          />
          <input
            type="text"
            placeholder="ID du chauffeur"
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-xs text-white outline-none focus:border-primary"
          />
          <input
            type="text"
            placeholder="Immatriculation / ID Véhicule"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-xs text-white outline-none focus:border-primary"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !tripId.trim() || !driverId.trim() || !vehicleId.trim()}
          className="min-h-11 rounded-xl bg-primary px-6 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-50 transition"
        >
          Affecter la mission
        </button>
      </form>

      {showUrgentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleEmergencyReassign}
            className="w-full max-w-md rounded-2xl border border-red-500/30 bg-card p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 text-red-400">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <MaterialIcon name="warning" size="md" />
                Réaffectation de Chauffeur d'Urgence
              </h3>
              <button
                type="button"
                onClick={() => setShowUrgentModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <MaterialIcon name="close" size="md" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                ID du trajet impacté
                <input
                  type="text"
                  required
                  placeholder="Ex: sub-123_0"
                  value={urgentTripId}
                  onChange={(e) => setUrgentTripId(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white outline-none focus:border-red-500"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-300">
                Nouveau Chauffeur de Remplacement (Driver ID)
                <input
                  type="text"
                  required
                  placeholder="Ex: driver-sub-007"
                  value={newDriverId}
                  onChange={(e) => setNewDriverId(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white outline-none focus:border-red-500"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-300">
                Véhicule de remplacement
                <input
                  type="text"
                  placeholder="Ex: VEH-REMPLACEMENT-01"
                  value={newVehicleId}
                  onChange={(e) => setNewVehicleId(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white outline-none focus:border-red-500"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowUrgentModal(false)}
                className="min-h-11 rounded-xl border border-white/10 px-4 text-xs font-semibold text-slate-300 hover:bg-white/5"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="min-h-11 rounded-xl bg-red-600 px-5 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {loading ? 'Réaffectation...' : 'Valider le remplacement d\'urgence'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
