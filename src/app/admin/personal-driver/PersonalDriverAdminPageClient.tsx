'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
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
type OperationView = 'subscriptions' | 'trips' | 'emergency';
type TripPanel = 'trips' | 'assignment' | null;
export type DateFilterPreset = '30d' | '90d' | 'year' | 'month' | 'all';
export type DateFilterState = { preset: DateFilterPreset; month: string };
const OPERATION_PAGE_SIZE = 12;
const DEFAULT_DATE_FILTER: DateFilterState = { preset: '30d', month: '' };

export function getDateRange(filter: DateFilterState, now = new Date()) {
  if (filter.preset === 'all') return { start: null, end: null };
  if (filter.preset === 'month' && /^\d{4}-\d{2}$/.test(filter.month)) {
    const [year, month] = filter.month.split('-').map(Number);
    return {
      start: new Date(Date.UTC(year, month - 1, 1)),
      end: new Date(Date.UTC(year, month, 1)),
    };
  }
  if (filter.preset === 'year') {
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
      end: new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)),
    };
  }
  const days = filter.preset === '90d' ? 90 : 30;
  return { start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), end: now };
}

function getDateFilterLabel(filter: DateFilterState): string {
  if (filter.preset === '30d') return '30 jours';
  if (filter.preset === '90d') return '90 jours';
  if (filter.preset === 'year') return 'Cette année';
  if (filter.preset === 'month' && filter.month) {
    return new Date(`${filter.month}-01T00:00:00.000Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }
  return 'Tout';
}

function getCurrentMonthValue(): string {
  return new Date().toISOString().slice(0, 7);
}

function getSubscriptionPlanLabel(subscription: SubscriptionRow): string {
  const planLabel = subscription.planSnapshot?.name || subscription.selectedPlanId || subscription.planId || 'forfait inconnu';
  return planLabel.charAt(0).toUpperCase() + planLabel.slice(1);
}

function getSubscriptionStatusLabel(status?: string): string {
  const labels: Record<string, string> = {
    pending_payment: 'Paiement en attente',
    payment_failed: 'Paiement échoué',
    active: 'Actif',
    expired: 'Expiré',
  };

  return labels[status || ''] || status || 'Statut inconnu';
}

function getTripDirectionLabel(direction?: string): string {
  if (direction === 'return') return 'Retour';
  if (direction === 'special') return 'Trajet spécial';
  return 'Aller';
}

function getTripStatusLabel(status?: string): string {
  const labels: Record<string, string> = {
    scheduled: 'Planifié',
    driver_assigned: 'Chauffeur affecté',
    driver_en_route: 'Chauffeur en route',
    driver_arrived: 'Chauffeur arrivé',
  };

  return labels[status || ''] || status || 'Statut inconnu';
}

function getTripScheduleLabel(scheduledAtIso?: string): string {
  if (!scheduledAtIso) return 'Horaire non renseigné';
  const date = new Date(scheduledAtIso);
  if (Number.isNaN(date.getTime())) return 'Horaire non renseigné';

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const [activeOperationView, setActiveOperationView] = useState<OperationView>('subscriptions');
  const [openTripPanel, setOpenTripPanel] = useState<TripPanel>('trips');
  const [dateFilter, setDateFilter] = useState<DateFilterState>(DEFAULT_DATE_FILTER);
  const [draftDateFilter, setDraftDateFilter] = useState<DateFilterState>(DEFAULT_DATE_FILTER);
  const [showDateFilters, setShowDateFilters] = useState(false);

  // Urgent Replacement Modal State (Rule #5)
  const [showUrgentModal, setShowUrgentModal] = useState(false);

  const loadOperations = useCallback(async (filter: DateFilterState = dateFilter) => {
    setRefreshing(true);
    setError(null);
    try {
      const { start, end } = getDateRange(filter);
      const subscriptionConstraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(50)];
      const tripConstraints: QueryConstraint[] = [
        where('status', 'in', ['scheduled', 'driver_assigned', 'driver_en_route', 'driver_arrived']),
        orderBy('scheduledAtIso', 'asc'),
        limit(50),
      ];
      if (start && end) {
        subscriptionConstraints.unshift(where('createdAt', '>=', start), where('createdAt', '<', end));
        tripConstraints.splice(1, 0, where('scheduledAtIso', '>=', start.toISOString()), where('scheduledAtIso', '<', end.toISOString()));
      }
      const [subscriptionSnap, tripSnap, driverSnap, vehicleSnap] = await Promise.all([
        getDocs(query(collection(db, 'personal_driver_subscriptions'), ...subscriptionConstraints)),
        getDocs(query(collection(db, 'personal_driver_trips'), ...tripConstraints)),
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
  }, [dateFilter]);

  useEffect(() => {
    void loadOperations();
  }, [loadOperations]);

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

  const applyDateFilter = (nextFilter: DateFilterState) => {
    setDateFilter(nextFilter);
    setShowDateFilters(false);
    setTripPage(0);
  };

  const handleApplyDateFilter = () => {
    if (draftDateFilter.preset === 'month' && !/^\d{4}-\d{2}$/.test(draftDateFilter.month)) return;
    applyDateFilter(draftDateFilter);
  };

  const handleResetDateFilter = () => {
    setDraftDateFilter(DEFAULT_DATE_FILTER);
    applyDateFilter(DEFAULT_DATE_FILTER);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 text-slate-100">
      <PersonalDriverPlansEditor />

      {(message || error) && (
        <div className={error ? 'rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-200' : 'rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs font-semibold text-primary'} role={error ? 'alert' : 'status'}>
          {error || message}
          {error && <button type="button" onClick={() => void loadOperations()} className="ml-3 underline">Réessayer</button>}
        </div>
      )}

      <section className="space-y-4" aria-label="Opérations Personal Driver">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Pilotage</p>
            <h2 className="mt-1 text-lg font-black text-white">Opérations Personal Driver</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={`Filtres${dateFilter.preset !== 'all' ? ' (actif)' : ''}`}
              onClick={() => { setDraftDateFilter(dateFilter); setShowDateFilters(true); }}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:border-primary/40 hover:text-primary"
            >
              <MaterialIcon name="filter_list" size="sm" />
              Filtres
              {dateFilter.preset !== 'all' && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">{getDateFilterLabel(dateFilter)}</span>}
            </button>
            <button
              type="button"
              onClick={() => void loadOperations()}
              disabled={refreshing}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
            >
              <MaterialIcon name="refresh" size="sm" />
              Actualiser
            </button>
          </div>
        </div>

        <div role="tablist" aria-label="Vues opérationnelles" className="grid grid-cols-3 gap-1 rounded-2xl bg-white/5 p-1">
          {([
            ['subscriptions', 'fact_check', 'Abonnements'],
            ['trips', 'route', 'Trajets'],
            ['emergency', 'warning', 'Urgences'],
          ] as const).map(([view, icon, label]) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={activeOperationView === view}
              onClick={() => setActiveOperationView(view)}
              className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-bold transition ${activeOperationView === view ? 'bg-card text-primary shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              <MaterialIcon name={icon} size="sm" />
              {label}
            </button>
          ))}
        </div>

        {activeOperationView === 'subscriptions' && (
          <div className="rounded-2xl bg-card/70 p-3 sm:p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <MaterialIcon name="fact_check" size="sm" className="text-emerald-400" />
              Abonnements à traiter
            </h3>
            <div className="mt-3 divide-y divide-white/10">
              {subscriptions.length === 0 ? (
                <p className="rounded-xl bg-white/5 p-3 text-xs text-slate-400">Aucun abonnement récent à afficher.</p>
              ) : subscriptions.map((subscription) => {
                const isPendingPayment = subscription.status === 'pending_payment';
                const planLabel = getSubscriptionPlanLabel(subscription);
                const statusLabel = getSubscriptionStatusLabel(subscription.status);
                const routeLabel = `${subscription.pickupAddress || 'Départ non renseigné'} → ${subscription.destinationAddress || 'Destination non renseignée'}`;
                return (
                  <div key={subscription.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <button type="button" onClick={() => setMessage(`Forfait ${planLabel} : ${statusLabel}.`)} className="min-w-0 flex-1 text-left">
                      <span className="block text-xs font-bold text-white">Forfait {planLabel}</span>
                      <span className="mt-1 block truncate text-xs text-slate-400">{statusLabel} · {routeLabel}</span>
                    </button>
                    {isPendingPayment && (
                      <button type="button" aria-label={`Refuser l'abonnement ${subscription.id}`} disabled={actionInProgressId === subscription.id || loading} onClick={() => void handleCancelSubscription(subscription.id)} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-3 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50">
                        <MaterialIcon name="cancel" size="sm" />
                        Refuser / Annuler
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeOperationView === 'trips' && (
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <article className="rounded-2xl bg-card/70 p-3 sm:p-4">
              <button
                type="button"
                aria-expanded={openTripPanel === 'trips'}
                aria-controls="personal-driver-trips-panel"
                aria-label={openTripPanel === 'trips' ? 'Réduire la liste des trajets' : 'Afficher la liste des trajets'}
                onClick={() => setOpenTripPanel(openTripPanel === 'trips' ? null : 'trips')}
                className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-white"><MaterialIcon name="route" size="sm" className="text-primary" />Trajets à affecter ou surveiller</span>
                <MaterialIcon name={openTripPanel === 'trips' ? 'expand_less' : 'expand_more'} size="sm" className="shrink-0 text-slate-400" />
              </button>
              {openTripPanel === 'trips' && (
                <div id="personal-driver-trips-panel" className="mt-3">
                  <input aria-label="Filtrer les trajets" value={tripFilter} onChange={(event) => { setTripFilter(event.target.value); setTripPage(0); }} placeholder="Filtrer un trajet" className="min-h-10 w-full rounded-full border border-white/10 bg-black/20 px-3 text-xs text-white outline-none focus:border-primary" />
                  <div className="mt-3 max-h-[28rem] overflow-y-auto divide-y divide-white/10 pr-1">
                    {trips.length === 0 ? (
                      <p className="rounded-xl bg-white/5 p-3 text-xs text-slate-400">Aucun trajet récent à afficher.</p>
                    ) : visibleTrips.map((trip) => {
                      const isSelected = tripId === trip.id;
                      return (
                        <div key={trip.id} className={`py-3 first:pt-0 last:pb-0 ${isSelected ? 'text-primary' : ''}`}>
                          <button type="button" onClick={() => { setTripId(trip.id); if (trip.assignedDriverId) setDriverId(trip.assignedDriverId); if (trip.assignedVehicleId) setVehicleId(trip.assignedVehicleId); setOpenTripPanel('assignment'); }} className="w-full text-left">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2"><span className="block text-xs font-bold text-white">{getTripDirectionLabel(trip.direction)} · {getTripStatusLabel(trip.status)}</span><span className="text-[11px] text-slate-400">{getTripScheduleLabel(trip.scheduledAtIso)}</span></div>
                            <span className="mt-1 block text-xs text-slate-400">{trip.pickupAddress || 'Départ non renseigné'} → {trip.destinationAddress || 'Destination non renseignée'}</span>
                          </button>
                          {trip.operationalReviewRequired && (
                            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-amber-400/10 p-2">
                              <span className="flex items-center gap-1 text-xs font-bold text-amber-300"><MaterialIcon name="warning" size="sm" />Examen requis</span>
                              <div className="ml-auto flex items-center gap-2">
                                <button type="button" aria-label={`Valider le trajet ${trip.id}`} disabled={actionInProgressId === trip.id || loading} onClick={() => void handleResolveOperationalReview(trip.id, 'approve')} className="inline-flex min-h-10 items-center gap-1 rounded-full bg-emerald-600 px-3 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"><MaterialIcon name="check" size="sm" />Approuver</button>
                                <button type="button" aria-label={`Refuser le trajet ${trip.id}`} disabled={actionInProgressId === trip.id || loading} onClick={() => void handleResolveOperationalReview(trip.id, 'reject')} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-red-500/40 bg-red-500/20 px-3 text-xs font-bold text-red-200 transition hover:bg-red-500/30 disabled:opacity-50"><MaterialIcon name="close" size="sm" />Rejeter</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {trips.length > OPERATION_PAGE_SIZE && <div className="mt-3 flex items-center justify-between text-xs text-slate-400"><button type="button" disabled={!hasPreviousTripPage} onClick={() => setTripPage((page) => page - 1)} className="min-h-10 px-2 font-semibold disabled:opacity-50">Précédent</button><span>Page {tripPage + 1}</span><button type="button" disabled={!hasNextTripPage} onClick={() => setTripPage((page) => page + 1)} className="min-h-10 px-2 font-semibold disabled:opacity-50">Suivant</button></div>}
                </div>
              )}
            </article>

            <article className="rounded-2xl bg-card/70 p-3 sm:p-4">
              <button
                type="button"
                aria-expanded={openTripPanel === 'assignment'}
                aria-controls="personal-driver-assignment-panel"
                aria-label={openTripPanel === 'assignment' ? 'Réduire le formulaire d’affectation' : 'Afficher le formulaire d’affectation'}
                onClick={() => setOpenTripPanel(openTripPanel === 'assignment' ? null : 'assignment')}
                className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-white"><MaterialIcon name="person_add" size="sm" className="text-primary" />Affecter un chauffeur et un véhicule</span>
                <MaterialIcon name={openTripPanel === 'assignment' ? 'expand_less' : 'expand_more'} size="sm" className="shrink-0 text-slate-400" />
              </button>
              {openTripPanel === 'assignment' && (
                <form id="personal-driver-assignment-panel" onSubmit={handleAssignTrip} className="mt-3 space-y-3">
                  <label className="block text-xs text-slate-300">Trajet à affecter<select value={tripId} onChange={(e) => setTripId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white outline-none focus:border-primary"><option value="">Sélectionnez un trajet</option>{trips.map((trip) => <option key={trip.id} value={trip.id}>{getTripScheduleLabel(trip.scheduledAtIso)} — {trip.pickupAddress || 'Départ non renseigné'}</option>)}</select></label>
                  <label className="block text-xs text-slate-300">Chauffeur approuvé et disponible<select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white outline-none focus:border-primary"><option value="">Sélectionnez un chauffeur</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name || driver.id}</option>)}</select></label>
                  <label className="block text-xs text-slate-300">Véhicule disponible<select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white outline-none focus:border-primary"><option value="">Sélectionnez un véhicule</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registration || vehicle.id}</option>)}</select></label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="submit" disabled={loading || !tripId.trim() || !driverId.trim() || !vehicleId.trim()} className="min-h-11 rounded-full bg-primary px-5 text-xs font-bold text-white transition hover:bg-primary/90 disabled:opacity-50">Affecter la mission</button>
                    {tripId && <button type="button" aria-label={`Annuler le trajet ${tripId}`} disabled={loading || actionInProgressId === tripId} onClick={() => void handleCancelTrip(tripId)} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-4 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"><MaterialIcon name="cancel" size="sm" />Annuler</button>}
                  </div>
                </form>
              )}
            </article>
          </div>
        )}

        {activeOperationView === 'emergency' && (
          <div className="rounded-2xl border border-amber-300/30 bg-amber-200/[0.08] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <MaterialIcon name="warning" size="md" className="mt-0.5 shrink-0 text-amber-300" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-white">Retard ou indisponibilité chauffeur</h3><span className="rounded-full bg-amber-300/15 px-2.5 py-1 text-[10px] font-bold text-amber-100">Action requise</span></div>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">Sélectionnez d’abord un trajet, un chauffeur et un véhicule dans l’onglet Trajets, puis confirmez la réaffectation urgente.</p>
                <button type="button" onClick={() => setShowUrgentModal(true)} disabled={!tripId || !driverId || !vehicleId} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-xs font-bold text-white transition hover:bg-primary/90 disabled:opacity-50"><MaterialIcon name="swap_horiz" size="sm" />Réaffecter un chauffeur d'urgence</button>
              </div>
            </div>
          </div>
        )}
      </section>

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

      {showDateFilters && (
        <div className="fixed inset-0 z-[60] flex h-[100dvh] items-end justify-center overflow-hidden bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="personal-driver-date-filter-title" className="w-full max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-3xl rounded-b-none border border-white/10 bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-2xl sm:pb-5">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="personal-driver-date-filter-title" className="text-base font-bold text-white">Filtrer les opérations</h3>
                <p className="mt-1 text-xs text-slate-400">Réduisez la liste à une période précise.</p>
              </div>
              <button type="button" aria-label="Fermer les filtres" onClick={() => setShowDateFilters(false)} className="min-h-10 min-w-10 rounded-full text-slate-400 transition hover:bg-white/5 hover:text-white">
                <MaterialIcon name="close" size="sm" />
              </button>
            </div>
            <fieldset className="mt-4 space-y-2">
              <legend className="sr-only">Période</legend>
              {([
                ['30d', '30 derniers jours'],
                ['90d', '90 derniers jours'],
                ['year', 'Cette année'],
                ['month', 'Un mois précis'],
                ['all', 'Tout l’historique'],
              ] as const).map(([preset, label]) => (
                <label key={preset} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 px-3 text-xs text-slate-200 transition has-[:checked]:border-primary/50 has-[:checked]:bg-primary/10">
                  <input type="radio" name="personal-driver-date-preset" value={preset} checked={draftDateFilter.preset === preset} onChange={() => setDraftDateFilter((current) => ({ ...current, preset, month: preset === 'month' && !current.month ? getCurrentMonthValue() : current.month }))} />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <label className={`mt-3 block text-xs font-semibold ${draftDateFilter.preset === 'month' ? 'text-slate-200' : 'text-slate-500'}`}>
              Mois
              <input aria-label="Mois" type="month" value={draftDateFilter.month} onChange={(event) => setDraftDateFilter((current) => ({ ...current, month: event.target.value }))} disabled={draftDateFilter.preset !== 'month'} className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-40" />
            </label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={handleResetDateFilter} className="min-h-11 rounded-xl border border-white/10 px-4 text-xs font-semibold text-slate-300 transition hover:bg-white/5">Réinitialiser</button>
              <button type="button" onClick={handleApplyDateFilter} disabled={draftDateFilter.preset === 'month' && !/^\d{4}-\d{2}$/.test(draftDateFilter.month)} className="min-h-11 rounded-xl bg-primary px-4 text-xs font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">Appliquer les filtres</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
