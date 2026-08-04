'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { PERSONAL_DRIVER_PLANS } from '@/services/personal-driver/plans';
import { formatPersonalDriverCurrency } from '@/services/personal-driver/pricing.service';
import {
  cancelPersonalDriverTripByClient,
  getCurrentPersonalDriverSubscription,
  getPendingPersonalDriverRenewal,
  getPersonalDriverTripsForSubscription,
  requestSpecialTrip,
  renewPersonalDriverSubscriptionPayment,
  type RenewPersonalDriverSubscriptionPaymentResult,
} from '@/services/personal-driver/subscription.service';
import type {
  PersonalDriverPlanId,
  PersonalDriverSubscription,
  PersonalDriverTrip,
} from '@/types/personal-driver';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Paiement en attente', color: 'bg-amber-500/15 text-amber-400 border border-amber-500/30' },
  payment_failed: { label: 'Paiement échoué', color: 'bg-red-500/15 text-red-400 border border-red-500/30' },
  active: { label: 'Abonnement Actif', color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' },
  cancelled: { label: 'Annulé', color: 'bg-gray-500/15 text-gray-400 border border-gray-500/30' },
  expired: { label: 'Expiré', color: 'bg-red-500/15 text-red-400 border border-red-500/30' },
};

const TRIP_STATUS_BADGES: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Planifié', color: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' },
  driver_assigned: { label: 'Chauffeur attribué', color: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' },
  driver_en_route: { label: 'Chauffeur en route', color: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' },
  driver_arrived: { label: 'Chauffeur arrivé', color: 'bg-purple-500/10 text-purple-400 border border-purple-500/20' },
  passenger_picked_up: { label: 'Passager à bord', color: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' },
  in_progress: { label: 'En cours', color: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
  completed: { label: 'Terminé', color: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' },
  cancelled: { label: 'Annulé (Km perdus)', color: 'bg-red-500/10 text-red-400 border border-red-500/20' },
};

const StripePaymentElement = dynamic(
  () => import('@/components/stripe/StripePaymentElement').then((module) => ({ default: module.StripePaymentElement })),
  { ssr: false, loading: () => <div className="h-52 rounded-xl border border-white/10 bg-white/5" /> },
);

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isSubscriptionUsable(subscription: PersonalDriverSubscription): boolean {
  const periodStartAtUtc = toDate(subscription.periodStartAtUtc);
  const periodEndAtUtc = toDate(subscription.periodEndAtUtc);
  const now = new Date();
  return subscription.status === 'active'
    && subscription.paymentStatus === 'succeeded'
    && !!periodStartAtUtc
    && !!periodEndAtUtc
    && periodEndAtUtc > periodStartAtUtc
    && now >= periodStartAtUtc
    && now < periodEndAtUtc;
}

export function PersonalDriverClientDashboard() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<PersonalDriverSubscription | null>(null);
  const [pendingRenewal, setPendingRenewal] = useState<PersonalDriverSubscription | null>(null);
  const [trips, setTrips] = useState<PersonalDriverTrip[]>([]);
  const [selectedTripToCancel, setSelectedTripToCancel] = useState<PersonalDriverTrip | null>(null);
  const [showSpecialTripModal, setShowSpecialTripModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Form state for special trip
  const [specialPickup, setSpecialPickup] = useState('');
  const [specialDestination, setSpecialDestination] = useState('');
  const [specialDate, setSpecialDate] = useState('');
  const [specialTime, setSpecialTime] = useState('');
  const [specialDistance, setSpecialDistance] = useState('15');
  const [renewalLoading, setRenewalLoading] = useState(false);
  const [renewalPayment, setRenewalPayment] = useState<RenewPersonalDriverSubscriptionPaymentResult | null>(null);
  const [renewalError, setRenewalError] = useState<string | null>(null);
  const renewalRecoveryAttemptRef = useRef<string | null>(null);

  const reloadData = useCallback(async () => {
    if (!currentUser?.uid) return;
    try {
      const [sub, pending] = await Promise.all([
        getCurrentPersonalDriverSubscription(currentUser.uid),
        getPendingPersonalDriverRenewal(currentUser.uid),
      ]);
      setSubscription(sub);
      setPendingRenewal(pending);
      if (sub?.id) {
        const tripList = await getPersonalDriverTripsForSubscription(sub.id);
        setTrips(tripList);
      } else {
        setTrips([]);
      }
    } catch (err) {
      console.error('Erreur chargement abonnement:', err);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      await reloadData();
      setLoading(false);
    }
    loadData();
  }, [currentUser?.uid, reloadData]);

  useEffect(() => {
    if (
      !subscription
      || !pendingRenewal
      || renewalPayment
      || renewalLoading
      || renewalRecoveryAttemptRef.current === pendingRenewal.id
    ) return;
    renewalRecoveryAttemptRef.current = pendingRenewal.id;
    const sourceSubscriptionId = pendingRenewal.sourceSubscriptionId ?? subscription.id;
    setRenewalLoading(true);
    setRenewalError(null);
    renewPersonalDriverSubscriptionPayment(sourceSubscriptionId, `recover-${pendingRenewal.id}`)
      .then(setRenewalPayment)
      .catch((err) => {
        setRenewalError(err instanceof Error ? err.message : 'Impossible de récupérer le renouvellement.');
      })
      .finally(() => setRenewalLoading(false));
  }, [pendingRenewal, renewalLoading, renewalPayment, subscription]);

  const handleCancelTrip = async () => {
    if (!selectedTripToCancel) return;
    setActionLoading(true);
    try {
      await cancelPersonalDriverTripByClient(selectedTripToCancel.id);
      await reloadData();
      setSelectedTripToCancel(null);
    } catch (err) {
      console.error("Erreur d'annulation:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateSpecialTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscription || !isSubscriptionUsable(subscription) || !specialPickup || !specialDestination || !specialDate || !specialTime) return;

    setActionLoading(true);
    try {
      const scheduledIso = `${specialDate}T${specialTime}:00`;
      const planId = (subscription.planId || (subscription as unknown as { selectedPlanId: PersonalDriverPlanId }).selectedPlanId) ?? 'classic';
      await requestSpecialTrip(
        subscription.id,
        subscription.userId,
        planId,
        specialPickup,
        specialDestination,
        scheduledIso,
        Number(specialDistance) || 10,
      );
      await reloadData();
      setShowSpecialTripModal(false);
      setSpecialPickup('');
      setSpecialDestination('');
      setSpecialDate('');
      setSpecialTime('');
    } catch (err) {
      console.error('Erreur réservation trajet spécial:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRenewal = async () => {
    if (!subscription || renewalLoading || renewalPayment || pendingRenewal) return;
    setRenewalLoading(true);
    setRenewalError(null);
    try {
      const requestId = `renew-${subscription.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payment = await renewPersonalDriverSubscriptionPayment(subscription.id, requestId);
      setRenewalPayment(payment);
    } catch (err) {
      setRenewalError(err instanceof Error ? err.message : 'Impossible de préparer le renouvellement.');
    } finally {
      setRenewalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 p-8 text-slate-400">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm font-medium">Chargement de votre espace Personal Driver...</p>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="mx-auto my-12 max-w-xl rounded-2xl border border-white/10 bg-card p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <MaterialIcon name="directions_car" size="xl" className="text-primary" />
        </div>
        <h2 className="mb-3 text-2xl font-bold text-white">
          Aucun abonnement Personal Driver actif
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-slate-400">
          Planifiez vos déplacements récurrents du mois et profitez d&apos;un chauffeur dédié au meilleur tarif.
        </p>
        <Link
          href="/personal-driver"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold text-white transition hover:bg-primary/90 active:scale-95"
        >
          Configurer mon transport mensuel
        </Link>
      </div>
    );
  }

  const rawPlanId = subscription.planId || (subscription as unknown as { selectedPlanId: PersonalDriverPlanId }).selectedPlanId || 'classic';
  const planInfo = PERSONAL_DRIVER_PLANS[rawPlanId] || PERSONAL_DRIVER_PLANS.classic;
  const statusInfo = STATUS_LABELS[subscription.status] || STATUS_LABELS.pending_payment;
  const includedSpecialTrips = planInfo.includedSpecialTrips;
  const specialTripsUsed = subscription.specialTripsUsed ?? 0;
  const specialTripsRemaining = Math.max(0, includedSpecialTrips - specialTripsUsed);
  const subscriptionUsable = isSubscriptionUsable(subscription);
  const paymentStatusLabel = subscription.paymentStatus === 'succeeded'
    ? 'Paiement confirmé'
    : subscription.paymentStatus === 'requires_action'
      ? 'Action de paiement requise'
      : subscription.paymentStatus === 'failed'
        ? 'Paiement échoué'
        : subscription.paymentStatus === 'cancelled'
          ? 'Paiement annulé'
          : 'Paiement non confirmé';

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12 text-slate-100">
      {/* HEADER ABONNEMENT */}
      <div className="rounded-2xl border border-white/10 bg-card p-6 shadow-xl backdrop-blur-xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              MON ACCÈS PERSONAL DRIVER
            </span>
            <h1 className="mt-1 text-2xl font-black text-white">
              Abonnement Forfait {planInfo.name}
            </h1>
          </div>
          <span className={`rounded-full px-4 py-1.5 text-xs font-bold ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/5 bg-white/5 p-3.5">
            <span className="block text-xs font-medium text-slate-400">Forfait choisi</span>
            <span className="mt-1 block text-base font-bold text-white">{planInfo.name}</span>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/5 p-3.5">
            <span className="block text-xs font-medium text-slate-400">Kilométrage planifié</span>
            <span className="mt-1 block text-base font-bold text-white">{subscription.monthlyDistanceKm} km</span>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/5 p-3.5">
            <span className="block text-xs font-medium text-slate-400">Attente gratuite</span>
            <span className="mt-1 block text-base font-bold text-white">{planInfo.includedRegularWaitMinutes} min / trajet</span>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/5 p-3.5">
            <span className="block text-xs font-medium text-slate-400">Missions prévues</span>
            <span className="mt-1 block text-base font-bold text-white">{trips.length} trajets</span>
          </div>
        </div>

        {/* Trajet Principal */}
        <div className="mt-5 rounded-xl border border-white/5 bg-white/5 p-4 space-y-2 text-xs sm:text-sm">
          <div className="flex items-start gap-2">
            <MaterialIcon name="my_location" size="sm" className="mt-0.5 text-emerald-400 shrink-0" />
            <span className="text-slate-400 font-medium shrink-0 w-24">Départ habituel:</span>
            <span className="font-semibold text-white">{subscription.pickupAddress}</span>
          </div>
          <div className="flex items-start gap-2">
            <MaterialIcon name="location_on" size="sm" className="mt-0.5 text-primary shrink-0" />
            <span className="text-slate-400 font-medium shrink-0 w-24">Destination:</span>
            <span className="font-semibold text-white">{subscription.destinationAddress}</span>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">Renouveler votre forfait</h2>
            <p className="mt-1 text-xs text-slate-400">Un nouveau paiement crée une nouvelle période de 30 jours.</p>
          </div>
          <button
            type="button"
            onClick={handleRenewal}
            disabled={renewalLoading || !!renewalPayment || !!pendingRenewal}
            className="min-h-10 rounded-lg bg-primary px-4 text-xs font-bold text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            {renewalLoading ? 'Préparation...' : 'Renouveler'}
          </button>
        </div>
        <div className="mt-4 space-y-1 text-xs text-slate-400">
          <p>Période : {subscription.periodStartDate ?? 'inconnue'} → {subscription.periodEndDateExclusive ?? 'inconnue'}</p>
          <p>{paymentStatusLabel}</p>
          {!subscriptionUsable && <p className="text-amber-300">Les trajets spéciaux sont indisponibles tant que le forfait n’est pas payé et actif.</p>}
        </div>
        {renewalError && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
            {renewalError}
          </div>
        )}
        {renewalPayment && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 text-sm font-bold text-white">Paiement du renouvellement</h3>
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-400">
              <span>Taxes non calculées</span>
              <strong className="text-white">
                {formatPersonalDriverCurrency(renewalPayment.quote.totalAmount, renewalPayment.quote.currency)}{' '}
                {renewalPayment.quote.currency.toUpperCase()}
              </strong>
            </div>
            <StripePaymentElement
              clientSecret={renewalPayment.clientSecret}
              amount={renewalPayment.amount}
              currency={renewalPayment.currency}
              onSuccess={() => {
                setRenewalPayment(null);
                void reloadData();
              }}
              onError={setRenewalError}
              submitLabel={`Payer ${formatPersonalDriverCurrency(renewalPayment.quote.totalAmount, renewalPayment.quote.currency)}`}
            />
          </div>
        )}
      </section>

      {/* VOS AVANTAGES FORFAIT */}
      <div className="rounded-2xl border border-white/10 bg-card p-6 shadow-xl">
        <h2 className="mb-4 text-base font-bold text-white flex items-center gap-2">
          <MaterialIcon name="star" size="md" className="text-amber-400" />
          Vos avantages inclus ({planInfo.name})
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {planInfo.benefits.map((benefit, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/5 p-3 text-xs sm:text-sm text-slate-200">
              <MaterialIcon name="check_circle" size="sm" className="text-emerald-400 shrink-0" />
              <span>{benefit}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION TRAJETS SPÉCIAUX (Rule #2) */}
      <div className="rounded-2xl border border-white/10 bg-card p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <MaterialIcon name="event_available" size="md" className="text-primary" />
              Trajets Spéciaux Inclus ({includedSpecialTrips} par période)
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Déplacements occasionnels (médecin, aéroport, événements). Les kilomètres sont déduits du forfait.
            </p>
          </div>
          {includedSpecialTrips > 0 ? (
            <button
              type="button"
              onClick={() => setShowSpecialTripModal(true)}
              disabled={!subscriptionUsable || specialTripsRemaining <= 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-white transition hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <MaterialIcon name="add" size="sm" />
              Demander un trajet spécial ({specialTripsRemaining} restant{specialTripsRemaining > 1 ? 's' : ''})
            </button>
          ) : (
            <Link
              href="/personal-driver"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/50 bg-primary/10 px-4 text-xs font-bold text-primary transition hover:bg-primary/20"
            >
              Passer à Classic pour 2 trajets spéciaux
            </Link>
          )}
        </div>

        <div className="rounded-xl border border-white/5 bg-white/5 p-4 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-300">Quota de trajets spéciaux utilisés :</span>
          <span className="text-sm font-bold text-white">
            {specialTripsUsed} / {includedSpecialTrips} utilisés
          </span>
        </div>
      </div>

      {/* CALENDRIER DES 30 JOURS (Rule #4 - Cancellation with Lost KM) */}
      <div className="rounded-2xl border border-white/10 bg-card p-6 shadow-xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <MaterialIcon name="calendar_month" size="md" className="text-primary" />
              Calendrier de transport (30 jours)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Consultez vos missions quotidiennes et gérez vos présences.
            </p>
          </div>
          <span className="rounded-lg bg-white/5 px-3 py-1 text-xs font-bold text-slate-300 border border-white/10">
            {trips.length} missions enregistrées
          </span>
        </div>

        {trips.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Votre calendrier est en préparation. Vos trajets apparaîtront ici dès validation.
          </p>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {trips.map((trip) => {
              const dateObj = new Date(trip.scheduledAtIso);
              const dateStr = dateObj.toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              });
              const timeStr = dateObj.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              });
              const badge = TRIP_STATUS_BADGES[trip.status] || TRIP_STATUS_BADGES.scheduled;

              return (
                <div
                  key={trip.id}
                  className="rounded-xl border border-white/5 bg-white/5 p-4 transition hover:border-white/10 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-white capitalize">
                        {dateStr} à {timeStr}
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${badge.color}`}>
                        {badge.label}
                      </span>
                      {trip.isSpecialTrip && (
                        <span className="rounded-md bg-purple-500/20 px-2 py-0.5 text-xs font-bold text-purple-300 border border-purple-500/30">
                          Trajet Spécial
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <span>{trip.pickupAddress}</span>
                      <MaterialIcon name="arrow_forward" size="sm" className="text-slate-500" />
                      <span>{trip.destinationAddress}</span>
                    </p>
                  </div>

                  {trip.status !== 'cancelled' && trip.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={() => setSelectedTripToCancel(trip)}
                      className="min-h-9 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 active:scale-95"
                    >
                      Annuler ce trajet
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL ANNULATION TRAJET (RULE #4 - KM PERDUS) */}
      {selectedTripToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <MaterialIcon name="warning" size="lg" />
              <h3 className="text-lg font-bold text-white">Confirmer l&apos;annulation</h3>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              Êtes-vous sûr de vouloir annuler le trajet du{' '}
              <strong className="text-white">
                {new Date(selectedTripToCancel.scheduledAtIso).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>{' '}
              ?
            </p>
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
              ⚠️ <strong>Règle d&apos;abonnement :</strong> Les kilomètres de cette journée annulée ne sont ni remboursables ni reportables sur le mois suivant.
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedTripToCancel(null)}
                disabled={actionLoading}
                className="min-h-11 rounded-xl border border-white/10 px-4 text-xs font-semibold text-slate-300 hover:bg-white/5"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleCancelTrip}
                disabled={actionLoading}
                className="min-h-11 rounded-xl bg-red-600 px-4 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {actionLoading ? 'Annulation...' : 'Oui, annuler ce trajet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TRAJET SPÉCIAL (RULE #2 - DÉDUCTION FORFAIT) */}
      {showSpecialTripModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateSpecialTrip}
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-card p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <MaterialIcon name="event_available" size="md" className="text-primary" />
                Demander un trajet spécial
              </h3>
              <button
                type="button"
                onClick={() => setShowSpecialTripModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <MaterialIcon name="close" size="md" />
              </button>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary">
              ℹ️ Le kilométrage de ce trajet spécial sera automatiquement déduit du forfait global de votre période.
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                Lieu de prise en charge
                <input
                  type="text"
                  required
                  value={specialPickup}
                  onChange={(e) => setSpecialPickup(e.target.value)}
                  placeholder="Ex: Clinique Médicale, Domicile..."
                  className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white outline-none focus:border-primary"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-300">
                Destination
                <input
                  type="text"
                  required
                  value={specialDestination}
                  onChange={(e) => setSpecialDestination(e.target.value)}
                  placeholder="Ex: Aéroport, Centre Commercial..."
                  className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white outline-none focus:border-primary"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-300">
                  Date du trajet
                  <input
                    type="date"
                    required
                    value={specialDate}
                    onChange={(e) => setSpecialDate(e.target.value)}
                    className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white outline-none focus:border-primary"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-300">
                  Heure du trajet
                  <input
                    type="time"
                    required
                    value={specialTime}
                    onChange={(e) => setSpecialTime(e.target.value)}
                    className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white outline-none focus:border-primary"
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-300">
                Distance estimée (km)
                <input
                  type="number"
                  min="1"
                  max="500"
                  required
                  value={specialDistance}
                  onChange={(e) => setSpecialDistance(e.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white outline-none focus:border-primary"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setShowSpecialTripModal(false)}
                className="min-h-11 rounded-xl border border-white/10 px-4 text-xs font-semibold text-slate-300 hover:bg-white/5"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="min-h-11 rounded-xl bg-primary px-5 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {actionLoading ? 'Réservation...' : 'Confirmer le trajet spécial'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
