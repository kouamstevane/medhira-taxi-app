'use client';

import React, { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { getUserFacingCallableError } from '@/utils/callable-error';
import type { PersonalDriverSubscription, PersonalDriverTrip } from '@/types/personal-driver';
import { PersonalDriverPlansEditor } from './PersonalDriverPlansEditor';

type SubscriptionRow = Partial<PersonalDriverSubscription> & { id: string };
type TripRow = Partial<PersonalDriverTrip> & { id: string };
type DriverRow = { id: string; name?: string; status?: string; isAvailable?: boolean; availabilityStatus?: string };
type VehicleRow = { id: string; registration?: string; status?: string; isAvailable?: boolean; availabilityStatus?: string };
const OPERATION_PAGE_SIZE = 12;

function getSubscriptionPlanLabel(subscription: SubscriptionRow): string {
  return subscription.selectedPlanId || subscription.planId || 'forfait inconnu';
}

export function PersonalDriverAdminPageClient() {
  const [tripId, setTripId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [tripPage, setTripPage] = useState(0);
  const [tripFilter, setTripFilter] = useState('');

  // Urgent Replacement Modal State (Rule #5)
  const [showUrgentModal, setShowUrgentModal] = useState(false);

  const loadOperations = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [subscriptionSnap, tripSnap, driverSnap, vehicleSnap] = await Promise.all([
        getDocs(query(collection(db, 'personal_driver_subscriptions'), orderBy('createdAt', 'desc'), limit(50))),
        getDocs(query(
          collection(db, 'personal_driver_trips'),
          where('status', 'in', ['scheduled', 'driver_assigned', 'driver_en_route', 'driver_arrived']),
          orderBy('scheduledAtIso', 'asc'),
          limit(50),
        )),
        getDocs(query(collection(db, 'drivers'), where('status', '==', 'approved'), orderBy('name', 'asc'), limit(50))),
        getDocs(query(collection(db, 'vehicles'), where('status', '==', 'available'), orderBy('registration', 'asc'), limit(50))),
      ]);

      setSubscriptions(
        subscriptionSnap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }) as SubscriptionRow)
          .filter((subscription) => ['pending_payment', 'payment_failed', 'active', 'expired'].includes(subscription.status || '')),
      );
      setTrips(
        tripSnap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }) as TripRow)
          .filter((trip) => ['scheduled', 'driver_assigned', 'driver_en_route', 'driver_arrived'].includes(trip.status || '')),
      );
      setTripPage(0);
      setDrivers(driverSnap.docs
        .map((driver) => ({ id: driver.id, ...driver.data() }) as DriverRow)
        .filter((driver) => driver.isAvailable !== false && driver.availabilityStatus !== 'unavailable'));
      setVehicles(vehicleSnap.docs
        .map((vehicle) => ({ id: vehicle.id, ...vehicle.data() }) as VehicleRow)
        .filter((vehicle) => vehicle.isAvailable !== false && vehicle.availabilityStatus !== 'unavailable'));
    } catch (err: unknown) {
      setError(`Impossible de charger les opérations : ${getUserFacingCallableError(err)}`);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadOperations();
  }, []);

  const filteredTrips = trips.filter((trip) => {
    const term = tripFilter.trim().toLocaleLowerCase('fr-FR');
    return !term || [trip.id, trip.pickupAddress, trip.destinationAddress, trip.status]
      .some((value) => String(value || '').toLocaleLowerCase('fr-FR').includes(term));
  });
  const visibleTrips = filteredTrips.slice(tripPage * OPERATION_PAGE_SIZE, (tripPage + 1) * OPERATION_PAGE_SIZE);
  const hasPreviousTripPage = tripPage > 0;
  const hasNextTripPage = (tripPage + 1) * OPERATION_PAGE_SIZE < filteredTrips.length;

  const handleAssignTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripId.trim() || !driverId.trim() || !vehicleId.trim()) return;
    setLoading(true);
    setMessage(null);
    setError(null);
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
    } catch (err: unknown) {
      setError(getUserFacingCallableError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async (subId: string) => {
    setActionInProgressId(subId);
    setError(null);
    setMessage(null);
    try {
      const callable = httpsCallable(functions, 'adminManagePersonalDriver');
      await callable({
        action: 'cancelSubscription',
        subscriptionId: subId,
        reason: 'Refus administratif ou abandon avant paiement',
      });
      setMessage(`Abonnement ${subId} refusé et annulé avec succès.`);
      void loadOperations();
    } catch (err: unknown) {
      setError(getUserFacingCallableError(err));
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleResolveOperationalReview = async (targetTripId: string, decision: 'approve' | 'reject') => {
    setActionInProgressId(targetTripId);
    setError(null);
    setMessage(null);
    try {
      const callable = httpsCallable(functions, 'adminManagePersonalDriver');
      await callable({
        action: 'resolveOperationalReview',
        tripId: targetTripId,
        decision,
        reason: decision === 'approve' ? 'Validé par examen administrateur' : 'Refusé par examen administrateur',
      });
      setMessage(`Examen opérationnel du trajet ${targetTripId} : ${decision === 'approve' ? 'Validé (Approuvé)' : 'Refusé (Rejeté)'}.`);
      void loadOperations();
    } catch (err: unknown) {
      setError(getUserFacingCallableError(err));
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleCancelTrip = async (targetTripId: string) => {
    setActionInProgressId(targetTripId);
    setError(null);
    setMessage(null);
    try {
      const callable = httpsCallable(functions, 'adminManagePersonalDriver');
      await callable({
        action: 'cancelTrip',
        tripId: targetTripId,
        reason: 'Annulé par l’administrateur',
      });
      setMessage(`Trajet ${targetTripId} annulé.`);
      void loadOperations();
    } catch (err: unknown) {
      setError(getUserFacingCallableError(err));
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleEmergencyReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripId.trim() || !driverId.trim() || !vehicleId.trim()) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const callable = httpsCallable(functions, 'adminManagePersonalDriver');
      await callable({
        action: 'reassignDriverEmergency',
        tripId: tripId.trim(),
        newDriverId: driverId.trim(),
        newVehicleId: vehicleId.trim(),
      });
      setMessage(`Chauffeur de remplacement ${driverId} affecté d'urgence au trajet ${tripId}. Réaffectation enregistrée.`);
      setShowUrgentModal(false);
      void loadOperations();
    } catch (err: unknown) {
      setError(getUserFacingCallableError(err));
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
          Suivi des abonnements, affectations de la flotte et gestion des alertes d'urgence.
        </p>
      </div>

      <PersonalDriverPlansEditor />

      {message && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-xs font-semibold text-primary">
          {message}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-semibold text-red-200">
          {error}
          <button type="button" onClick={() => void loadOperations()} className="ml-3 underline">Réessayer</button>
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
          disabled={!tripId || !driverId || !vehicleId}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-bold text-white hover:bg-red-500 transition active:scale-95 disabled:opacity-50"
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
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/10 px-4 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"
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
              subscriptions.map((subscription) => {
                const isPendingPayment = subscription.status === 'pending_payment';
                return (
                  <div
                    key={subscription.id}
                    className="w-full rounded-lg border border-white/10 bg-black/10 p-3 transition hover:bg-white/5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => setMessage(`Abonnement ${subscription.id}: ${subscription.status || 'statut inconnu'}.`)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block text-xs font-bold text-white">{subscription.id}</span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {subscription.status || 'statut inconnu'} · {getSubscriptionPlanLabel(subscription)} · {subscription.pickupAddress || 'départ non renseigné'}
                      </span>
                    </button>
                    {isPendingPayment && (
                      <button
                        type="button"
                        aria-label={`Refuser l'abonnement ${subscription.id}`}
                        disabled={actionInProgressId === subscription.id || loading}
                        onClick={() => void handleCancelSubscription(subscription.id)}
                        className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition active:scale-95"
                      >
                        <MaterialIcon name="cancel" size="sm" />
                        Refuser / Annuler
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-white">
              <MaterialIcon name="route" size="sm" className="text-primary" />
              Trajets à affecter ou surveiller
            </h2>
            <input
              aria-label="Filtrer les trajets"
              value={tripFilter}
              onChange={(event) => { setTripFilter(event.target.value); setTripPage(0); }}
              placeholder="Filtrer un trajet"
              className="min-h-11 rounded-lg border border-white/10 bg-black/10 px-3 text-xs text-white outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-2">
            {trips.length === 0 ? (
              <p className="rounded-lg border border-white/5 bg-black/10 p-3 text-xs text-slate-400">
                Aucun trajet récent à afficher.
              </p>
            ) : (
              visibleTrips.map((trip) => {
                const isSelected = tripId === trip.id;
                return (
                  <div
                    key={trip.id}
                    className={`w-full rounded-lg border p-3 transition ${
                      isSelected ? 'border-primary bg-primary/10' : 'border-white/10 bg-black/10 hover:bg-white/5'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setTripId(trip.id);
                        if (trip.assignedDriverId) setDriverId(trip.assignedDriverId);
                        if (trip.assignedVehicleId) setVehicleId(trip.assignedVehicleId);
                      }}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="block text-xs font-bold text-white">{trip.id}</span>
                        <span className="text-xs text-slate-400">{trip.status || 'statut inconnu'}</span>
                      </div>
                      <span className="mt-1 block text-xs text-slate-400">
                        {trip.scheduledAtIso || 'horaire non renseigné'}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {trip.pickupAddress || 'départ'} → {trip.destinationAddress || 'destination'}
                      </span>
                    </button>

                    {trip.operationalReviewRequired && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-500/30 pt-3">
                        <span className="flex items-center gap-1 text-xs font-bold text-amber-300">
                          <MaterialIcon name="warning" size="sm" className="animate-pulse" />
                          Examen opérationnel requis
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`Valider le trajet ${trip.id}`}
                            disabled={actionInProgressId === trip.id || loading}
                            onClick={() => void handleResolveOperationalReview(trip.id, 'approve')}
                            className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 transition active:scale-95"
                          >
                            <MaterialIcon name="check" size="sm" />
                            Valider (Approuver)
                          </button>
                          <button
                            type="button"
                            aria-label={`Refuser le trajet ${trip.id}`}
                            disabled={actionInProgressId === trip.id || loading}
                            onClick={() => void handleResolveOperationalReview(trip.id, 'reject')}
                            className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-red-500/40 bg-red-500/20 px-3 text-xs font-bold text-red-200 hover:bg-red-500/30 disabled:opacity-50 transition active:scale-95"
                          >
                            <MaterialIcon name="close" size="sm" />
                            Refuser (Rejeter)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {trips.length > OPERATION_PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
              <button
                type="button"
                disabled={!hasPreviousTripPage}
                onClick={() => setTripPage((page) => page - 1)}
                className="inline-flex min-h-11 items-center px-3 font-semibold disabled:opacity-50"
              >
                Précédent
              </button>
              <span>Page {tripPage + 1}</span>
              <button
                type="button"
                disabled={!hasNextTripPage}
                onClick={() => setTripPage((page) => page + 1)}
                className="inline-flex min-h-11 items-center px-3 font-semibold disabled:opacity-50"
              >
                Suivant
              </button>
            </div>
          )}
        </div>
      </section>

      <form onSubmit={handleAssignTrip} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <MaterialIcon name="person_add" size="sm" className="text-primary" />
          Affecter un chauffeur et un véhicule aux trajets
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs text-slate-300">
            Trajet à affecter
            <select value={tripId} onChange={(e) => setTripId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-card px-3 text-xs text-white outline-none focus:border-primary">
              <option value="">Sélectionnez un trajet</option>
              {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.scheduledAtIso || 'Horaire inconnu'} — {trip.pickupAddress || trip.id}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-300">
            Chauffeur approuvé et disponible
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-card px-3 text-xs text-white outline-none focus:border-primary">
              <option value="">Sélectionnez un chauffeur</option>
              {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name || driver.id}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-300">
            Véhicule disponible
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-card px-3 text-xs text-white outline-none focus:border-primary">
              <option value="">Sélectionnez un véhicule</option>
              {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration || vehicle.id}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading || !tripId.trim() || !driverId.trim() || !vehicleId.trim()}
            className="min-h-11 rounded-xl bg-primary px-6 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-50 transition active:scale-95"
          >
            Affecter la mission
          </button>
          {tripId && (
            <button
              type="button"
              aria-label={`Annuler le trajet ${tripId}`}
              disabled={loading || actionInProgressId === tripId}
              onClick={() => void handleCancelTrip(tripId)}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 px-4 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition active:scale-95"
            >
              <MaterialIcon name="cancel" size="sm" />
              Annuler ce trajet
            </button>
          )}
        </div>
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

            <div className="space-y-3 rounded-lg border border-red-500/20 bg-black/10 p-3 text-xs text-slate-300">
              <p>Trajet sélectionné : <strong className="text-white">{tripId || 'aucun'}</strong></p>
              <p>Chauffeur sélectionné : <strong className="text-white">{driverId || 'aucun'}</strong></p>
              <p>Véhicule sélectionné : <strong className="text-white">{vehicleId || 'aucun'}</strong></p>
              <p>Sélectionnez un trajet, un chauffeur approuvé et un véhicule disponible dans le panneau d’affectation avant de confirmer.</p>
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
                disabled={loading || !tripId || !driverId || !vehicleId}
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
