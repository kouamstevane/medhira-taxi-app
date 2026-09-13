'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePersonalDriverPlans } from '@/hooks/usePersonalDriverPlans';
import { useTranslation } from '@/hooks/useTranslation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { formatPersonalDriverCurrency } from '@/services/personal-driver/pricing.service';
import { getUserFacingCallableError } from '@/utils/callable-error';
import {
  cancelPersonalDriverTripByClient,
  getPersonalDriverSubscriptionView,
  getPersonalDriverSubscriptionById,
  getPersonalDriverTripsForSubscription,
  retryPersonalDriverSubscriptionActivation,
  requestSpecialTrip,
  renewPersonalDriverSubscriptionPayment,
  type RenewPersonalDriverSubscriptionPaymentResult,
} from '@/services/personal-driver/subscription.service';
import type {
  PersonalDriverPlanId,
  RequestSpecialTripResult,
  PersonalDriverSubscription,
  PersonalDriverTrip,
} from '@/types/personal-driver';

const STATUS_CONFIG: Record<string, { labelKey: 'personalDriver.statusPendingPayment' | 'personalDriver.statusActivating' | 'personalDriver.statusActivationFailed' | 'personalDriver.statusPaymentFailed' | 'personalDriver.statusActive' | 'personalDriver.statusCancelled' | 'personalDriver.statusExpired'; color: string }> = {
  pending_payment: { labelKey: 'personalDriver.statusPendingPayment', color: 'bg-amber-500/15 text-amber-400 border border-amber-500/30' },
  activating: { labelKey: 'personalDriver.statusActivating', color: 'bg-amber-500/15 text-amber-400 border border-amber-500/30' },
  activation_failed: { labelKey: 'personalDriver.statusActivationFailed', color: 'bg-red-500/15 text-red-400 border border-red-500/30' },
  payment_failed: { labelKey: 'personalDriver.statusPaymentFailed', color: 'bg-red-500/15 text-red-400 border border-red-500/30' },
  active: { labelKey: 'personalDriver.statusActive', color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' },
  cancelled: { labelKey: 'personalDriver.statusCancelled', color: 'bg-gray-500/15 text-gray-400 border border-gray-500/30' },
  expired: { labelKey: 'personalDriver.statusExpired', color: 'bg-red-500/15 text-red-400 border border-red-500/30' },
};

const TRIP_STATUS_CONFIG: Record<string, { labelKey: 'personalDriver.tripScheduled' | 'personalDriver.tripDriverAssigned' | 'personalDriver.tripDriverEnRoute' | 'personalDriver.tripDriverArrived' | 'personalDriver.tripPassengerPickedUp' | 'personalDriver.tripInProgress' | 'personalDriver.tripCompleted' | 'personalDriver.tripCancelledKmLost'; color: string }> = {
  scheduled: { labelKey: 'personalDriver.tripScheduled', color: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' },
  driver_assigned: { labelKey: 'personalDriver.tripDriverAssigned', color: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' },
  driver_en_route: { labelKey: 'personalDriver.tripDriverEnRoute', color: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' },
  driver_arrived: { labelKey: 'personalDriver.tripDriverArrived', color: 'bg-purple-500/10 text-purple-400 border border-purple-500/20' },
  passenger_picked_up: { labelKey: 'personalDriver.tripPassengerPickedUp', color: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' },
  in_progress: { labelKey: 'personalDriver.tripInProgress', color: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
  completed: { labelKey: 'personalDriver.tripCompleted', color: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' },
  cancelled: { labelKey: 'personalDriver.tripCancelledKmLost', color: 'bg-red-500/10 text-red-400 border border-red-500/20' },
};

const StripePaymentElement = dynamic(
  () => import('@/components/stripe/StripePaymentElement').then((module) => ({ default: module.StripePaymentElement })),
  { ssr: false, loading: () => <div className="h-52 rounded-xl border border-white/10 bg-white/5" /> },
);

const ACTIVATION_POLL_INTERVAL_MS = 2_000;
const ACTIVATION_POLL_TIMEOUT_MS = 60_000;

type RenewalActivationProgress = 'idle' | 'preparing' | 'failed' | 'timeout';

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
  const { plans, error: plansError, reload: reloadPlans } = usePersonalDriverPlans();
  const { t, locale } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<PersonalDriverSubscription | null>(null);
  const [pendingRenewal, setPendingRenewal] = useState<PersonalDriverSubscription | null>(null);
  const [trips, setTrips] = useState<PersonalDriverTrip[]>([]);
  const [selectedTripToCancel, setSelectedTripToCancel] = useState<PersonalDriverTrip | null>(null);
  const [showSpecialTripModal, setShowSpecialTripModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [specialTripResult, setSpecialTripResult] = useState<RequestSpecialTripResult | null>(null);

  // Form state for special trip
  const [specialPickup, setSpecialPickup] = useState('');
  const [specialDestination, setSpecialDestination] = useState('');
  const [specialDate, setSpecialDate] = useState('');
  const [specialTime, setSpecialTime] = useState('');
  const [specialDistance, setSpecialDistance] = useState('15');
  const [renewalLoading, setRenewalLoading] = useState(false);
  const [renewalPayment, setRenewalPayment] = useState<RenewPersonalDriverSubscriptionPaymentResult | null>(null);
  const [renewalError, setRenewalError] = useState<string | null>(null);
  const [renewalActivationProgress, setRenewalActivationProgress] = useState<RenewalActivationProgress>('idle');
  const [renewalActivationSubscriptionId, setRenewalActivationSubscriptionId] = useState<string | null>(null);
  const renewalRecoveryAttemptRef = useRef<string | null>(null);
  const renewalActivationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renewalActivationRunRef = useRef(0);
  const renewalActivationPollingIdRef = useRef<string | null>(null);
  const activationRecoveryAttemptRef = useRef<string | null>(null);

  const reloadData = useCallback(async () => {
    if (!currentUser?.uid) return;
    setReloadError(null);
    try {
      const { active, pending } = await getPersonalDriverSubscriptionView(currentUser.uid);
      const paidRenewal = pending?.paymentStatus === 'succeeded'
        && (pending.activationStatus === 'activating' || pending.activationStatus === 'activation_failed');
      const displayedSubscription = paidRenewal ? pending : active ?? pending;
      setSubscription(displayedSubscription);
      setPendingRenewal(pending);
      if (paidRenewal && pending) {
        setRenewalActivationSubscriptionId(pending.id);
        setRenewalActivationProgress(
          pending.activationStatus === 'activation_failed' ? 'failed' : 'preparing',
        );
      }
      if (active?.id) {
        const tripList = await getPersonalDriverTripsForSubscription(active.id);
        setTrips(tripList);
      } else {
        setTrips([]);
      }
    } catch (err) {
      setReloadError(getUserFacingCallableError(err));
    }
  }, [currentUser?.uid]);

  const beginRenewalActivationPolling = useCallback((subscriptionId: string) => {
    if (renewalActivationTimerRef.current) clearTimeout(renewalActivationTimerRef.current);
    renewalActivationRunRef.current += 1;
    const runId = renewalActivationRunRef.current;
    const startedAt = Date.now();
    renewalActivationPollingIdRef.current = subscriptionId;
    setRenewalActivationSubscriptionId(subscriptionId);
    setRenewalActivationProgress('preparing');
    setRenewalError(null);

    const pollActivation = async () => {
      if (renewalActivationRunRef.current !== runId) return;
      if (Date.now() - startedAt >= ACTIVATION_POLL_TIMEOUT_MS) {
        renewalActivationPollingIdRef.current = null;
        setRenewalActivationProgress('timeout');
        return;
      }
      try {
        const updatedSubscription = await getPersonalDriverSubscriptionById(subscriptionId);
        if (renewalActivationRunRef.current !== runId) return;
        if (updatedSubscription) {
          if (updatedSubscription.activationStatus === 'active') {
            renewalActivationPollingIdRef.current = null;
            setRenewalActivationProgress('idle');
            await reloadData();
            return;
          }
          setSubscription(updatedSubscription);
          setPendingRenewal(updatedSubscription);
          if (updatedSubscription.activationStatus === 'activation_failed') {
            renewalActivationPollingIdRef.current = null;
            setRenewalActivationProgress('failed');
            return;
          }
        }
      } catch {}
      if (renewalActivationRunRef.current === runId) {
        renewalActivationTimerRef.current = setTimeout(pollActivation, ACTIVATION_POLL_INTERVAL_MS);
      }
    };

    renewalActivationTimerRef.current = setTimeout(pollActivation, ACTIVATION_POLL_INTERVAL_MS);
  }, [reloadData]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      await reloadData();
      setLoading(false);
    }
    loadData();
  }, [currentUser?.uid, reloadData]);

  useEffect(() => () => {
    renewalActivationRunRef.current += 1;
    if (renewalActivationTimerRef.current) clearTimeout(renewalActivationTimerRef.current);
  }, []);

  useEffect(() => {
    if (pendingRenewal?.paymentStatus !== 'succeeded') return;
    setRenewalActivationSubscriptionId(pendingRenewal.id);
    if (pendingRenewal.activationStatus === 'activation_failed') {
      setRenewalActivationProgress('failed');
      return;
    }
    if (
      pendingRenewal.activationStatus === 'activating'
      && renewalActivationPollingIdRef.current !== pendingRenewal.id
    ) {
      beginRenewalActivationPolling(pendingRenewal.id);
    }
  }, [beginRenewalActivationPolling, pendingRenewal]);

  useEffect(() => {
    if (
      !pendingRenewal
      || pendingRenewal.paymentStatus !== 'succeeded'
      || pendingRenewal.activationStatus === 'active'
      || pendingRenewal.activationStatus !== 'pending_payment'
      || activationRecoveryAttemptRef.current === pendingRenewal.id
    ) return;
    activationRecoveryAttemptRef.current = pendingRenewal.id;
    setRenewalActivationSubscriptionId(pendingRenewal.id);
    setRenewalActivationProgress('preparing');
    void retryPersonalDriverSubscriptionActivation(pendingRenewal.id)
      .then(() => reloadData())
      .catch(() => {
        setRenewalActivationProgress('failed');
      });
  }, [pendingRenewal, reloadData]);

  useEffect(() => {
    if (
      !subscription
      || !pendingRenewal
      || !pendingRenewal.sourceSubscriptionId
      || pendingRenewal.paymentStatus === 'succeeded'
      || renewalPayment
      || renewalLoading
      || renewalRecoveryAttemptRef.current === pendingRenewal.id
    ) return;
    renewalRecoveryAttemptRef.current = pendingRenewal.id;
    setRenewalLoading(true);
    setRenewalError(null);
    renewPersonalDriverSubscriptionPayment(
      pendingRenewal.sourceSubscriptionId,
      `recover-${pendingRenewal.id}`,
      pendingRenewal.id,
    )
      .then(setRenewalPayment)
      .catch((err) => {
        setRenewalError(getUserFacingCallableError(err));
      })
      .finally(() => setRenewalLoading(false));
  }, [pendingRenewal, renewalLoading, renewalPayment, subscription]);

  const handleCancelTrip = async () => {
    if (!selectedTripToCancel) return;
    setActionLoading(true);
    setSpecialTripResult(null);
    setActionError(null);
    try {
      await cancelPersonalDriverTripByClient(selectedTripToCancel.id);
      await reloadData();
      setSelectedTripToCancel(null);
    } catch (err) {
      setActionError(getUserFacingCallableError(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateSpecialTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscription || !isSubscriptionUsable(subscription) || !specialPickup || !specialDestination || !specialDate || !specialTime) return;

    setActionLoading(true);
    setSpecialTripResult(null);
    setActionError(null);
    try {
      const scheduledIso = `${specialDate}T${specialTime}:00`;
      const planId = (subscription.planId || (subscription as unknown as { selectedPlanId: PersonalDriverPlanId }).selectedPlanId) ?? 'classic';
      const result = await requestSpecialTrip(
        subscription.id,
        subscription.userId,
        planId,
        specialPickup,
        specialDestination,
        scheduledIso,
        Number(specialDistance) || 10,
      );
      setSpecialTripResult(result);
      await reloadData();
      setShowSpecialTripModal(false);
      setSpecialPickup('');
      setSpecialDestination('');
      setSpecialDate('');
      setSpecialTime('');
    } catch (err) {
      setActionError(getUserFacingCallableError(err));
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
      setRenewalError(getUserFacingCallableError(err));
    } finally {
      setRenewalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 p-8 text-slate-400">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm font-medium">{t('personalDriver.loadingDashboard')}</p>
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
          {t('personalDriver.noActiveSubscriptionTitle')}
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-slate-400">
          {t('personalDriver.noActiveSubscriptionDesc')}
        </p>
        {reloadError && (
          <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            {reloadError}
            <button type="button" onClick={() => void reloadData()} className="ml-3 inline-flex min-h-11 items-center font-bold underline underline-offset-4">{t('personalDriver.retry')}</button>
          </div>
        )}
        <Link
          href="/personal-driver"
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold text-white transition hover:bg-primary/90 active:scale-95"
        >
          {t('personalDriver.configureMonthlyTransport')}
        </Link>
      </div>
    );
  }

  const rawPlanId = subscription.planId || (subscription as unknown as { selectedPlanId: PersonalDriverPlanId }).selectedPlanId || 'classic';
  const cataloguePlan = plans[rawPlanId] || plans.classic;
  const planInfo = subscription.planSnapshot ?? {
    ...cataloguePlan,
    ...(typeof subscription.includedSpecialTrips === 'number'
      ? { includedSpecialTrips: subscription.includedSpecialTrips }
      : {}),
  };
  const activationStatus = subscription.activationStatus
    ?? (subscription.status === 'active' ? 'active' : 'pending_payment');
  const displayedStatus = subscription.paymentStatus === 'succeeded'
    ? activationStatus === 'activation_failed'
      ? 'activation_failed'
      : activationStatus === 'active'
        ? 'active'
        : 'activating'
    : subscription.status;
  const statusCfg = STATUS_CONFIG[displayedStatus] || STATUS_CONFIG.pending_payment;
  const statusLabel = t(statusCfg.labelKey);
  const includedSpecialTrips = planInfo.includedSpecialTrips;
  const specialTripsUsed = subscription.specialTripsUsed ?? 0;
  const specialTripsRemaining = Math.max(0, includedSpecialTrips - specialTripsUsed);
  const subscriptionUsable = isSubscriptionUsable(subscription);
  const distanceFormatter = new Intl.NumberFormat(locale === 'en' ? 'en-CA' : 'fr-CA', { maximumFractionDigits: 1 });
  const paymentStatusLabel = subscription.paymentStatus === 'succeeded'
    ? t('personalDriver.paymentConfirmed')
    : subscription.paymentStatus === 'requires_action'
      ? t('personalDriver.paymentActionRequired')
      : subscription.paymentStatus === 'failed'
        ? t('personalDriver.paymentFailed')
        : subscription.paymentStatus === 'cancelled'
          ? t('personalDriver.paymentCancelled')
          : t('personalDriver.paymentUnconfirmed');

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12 text-slate-100">
      {/* HEADER ABONNEMENT */}
      <div className="rounded-2xl border border-white/10 bg-card p-6 shadow-xl backdrop-blur-xl">
        {plansError && (
          <div role="alert" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            {t('personalDriver.fallbackNotice')}
            <button type="button" onClick={() => void reloadPlans()} className="ml-3 inline-flex min-h-11 items-center font-bold underline underline-offset-4">
              {t('personalDriver.retry')}
            </button>
          </div>
        )}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {t('personalDriver.myAccessBadge')}
            </span>
            <h1 className="mt-1 text-2xl font-black text-white">
              {t('personalDriver.subscriptionPlanTitle', { name: planInfo.name })}
            </h1>
          </div>
          <span className={`rounded-full px-4 py-1.5 text-xs font-bold ${statusCfg.color}`}>
            {statusLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/5 bg-white/5 p-3.5">
            <span className="block text-xs font-medium text-slate-400">{t('personalDriver.chosenPlan')}</span>
            <span className="mt-1 block text-base font-bold text-white">{planInfo.name}</span>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/5 p-3.5">
            <span className="block text-xs font-medium text-slate-400">{t('personalDriver.plannedDistance')}</span>
            <span className="mt-1 block text-base font-bold text-white">{subscription.monthlyDistanceKm} km</span>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/5 p-3.5">
            <span className="block text-xs font-medium text-slate-400">{t('personalDriver.freeWait')}</span>
            <span className="mt-1 block text-base font-bold text-white">{t('personalDriver.freeWaitPerTrip', { minutes: planInfo.includedRegularWaitMinutes })}</span>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/5 p-3.5">
            <span className="block text-xs font-medium text-slate-400">{t('personalDriver.plannedMissions')}</span>
            <span className="mt-1 block text-base font-bold text-white">{t('personalDriver.tripsCount', { count: trips.length })}</span>
          </div>
        </div>

        {/* Trajet Principal */}
        <div className="mt-5 rounded-xl border border-white/5 bg-white/5 p-4 space-y-2 text-xs sm:text-sm">
          <div className="flex items-start gap-2">
            <MaterialIcon name="my_location" size="sm" className="mt-0.5 text-emerald-400 shrink-0" />
            <span className="text-slate-400 font-medium shrink-0 w-24">{t('personalDriver.usualPickup')}</span>
            <span className="font-semibold text-white">{subscription.pickupAddress}</span>
          </div>
          <div className="flex items-start gap-2">
            <MaterialIcon name="location_on" size="sm" className="mt-0.5 text-primary shrink-0" />
            <span className="text-slate-400 font-medium shrink-0 w-24">{t('personalDriver.destination')}</span>
            <span className="font-semibold text-white">{subscription.destinationAddress}</span>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">{t('personalDriver.renewPlanTitle')}</h2>
            <p className="mt-1 text-xs text-slate-400">{t('personalDriver.renewPlanDesc')}</p>
          </div>
          <button
            type="button"
            onClick={handleRenewal}
            disabled={renewalLoading || !!renewalPayment || !!pendingRenewal}
            className="min-h-11 rounded-lg bg-primary px-4 text-xs font-bold text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            {renewalLoading ? t('personalDriver.preparing') : t('personalDriver.renew')}
          </button>
        </div>
        <div className="mt-4 space-y-1 text-xs text-slate-400">
          <p>{t('personalDriver.periodLabel', { start: subscription.periodStartDate ?? t('personalDriver.unknownPeriod'), end: subscription.periodEndDateExclusive ?? t('personalDriver.unknownPeriod') })}</p>
          <p>{paymentStatusLabel}</p>
          {!subscriptionUsable && <p className="text-amber-300">{t('personalDriver.specialTripsUnavailableNotice')}</p>}
        </div>
        {renewalError && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">
            {renewalError}
          </div>
        )}
        {renewalActivationProgress === 'preparing'
          && renewalActivationSubscriptionId !== subscription.id && (
          <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-300" role="status">
            {t('personalDriver.paymentConfirmedPreparingTrips')}
          </p>
        )}
        {renewalActivationProgress === 'timeout' && (
          <div className="mt-4 space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="alert">
            <p>{t('personalDriver.preparationTakesLongerSimple')}</p>
            <button
              type="button"
              onClick={() => renewalActivationSubscriptionId && beginRenewalActivationPolling(renewalActivationSubscriptionId)}
              className="min-h-11 rounded-lg border border-amber-400/40 px-4 font-bold text-amber-100"
            >
              {t('personalDriver.retryVerification')}
            </button>
          </div>
        )}
        {renewalPayment && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 text-sm font-bold text-white">{t('personalDriver.renewalPaymentTitle')}</h3>
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-400">
              <span>{t('personalDriver.taxesNotCalculated')}</span>
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
                const subscriptionId = renewalPayment.subscriptionId;
                setRenewalPayment(null);
                beginRenewalActivationPolling(subscriptionId);
              }}
              onError={setRenewalError}
              submitLabel={t('personalDriver.payAmount', { amount: formatPersonalDriverCurrency(renewalPayment.quote.totalAmount, renewalPayment.quote.currency) })}
            />
          </div>
        )}
      </section>

      {specialTripResult && (
        <p
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-300"
          role="status"
        >
          {t('personalDriver.officialDistance', { distance: distanceFormatter.format(specialTripResult.officialDistanceKm) })}{' '}
          {t('personalDriver.specialTripsRemainingCount', { count: specialTripResult.specialTripsRemaining })}{' '}
          {t('personalDriver.remainingMileageCount', { distance: distanceFormatter.format(specialTripResult.monthlyDistanceKmRemaining) })}
        </p>
      )}
      {(actionError || reloadError) && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-semibold text-red-200">
          {actionError || reloadError}
          <button type="button" onClick={() => void reloadData()} className="ml-3 inline-flex min-h-11 items-center font-bold underline underline-offset-4">{t('personalDriver.retry')}</button>
        </div>
      )}

      {/* VOS AVANTAGES FORFAIT */}
      <div className="rounded-2xl border border-white/10 bg-card p-6 shadow-xl">
        <h2 className="mb-4 text-base font-bold text-white flex items-center gap-2">
          <MaterialIcon name="star" size="md" className="text-amber-400" />
          {t('personalDriver.includedBenefitsTitle', { name: planInfo.name })}
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
              {t('personalDriver.includedSpecialTripsTitle', { count: includedSpecialTrips })}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {t('personalDriver.includedSpecialTripsDesc')}
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
              {t('personalDriver.requestSpecialTripWithRemaining', { remaining: specialTripsRemaining, plural: specialTripsRemaining > 1 ? 's' : '' })}
            </button>
          ) : (
            <Link
              href="/personal-driver"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/50 bg-primary/10 px-4 text-xs font-bold text-primary transition hover:bg-primary/20"
            >
              {t('personalDriver.upgradeToClassic')}
            </Link>
          )}
        </div>

        <div className="rounded-xl border border-white/5 bg-white/5 p-4 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-300">{t('personalDriver.specialTripsQuotaUsed')}</span>
          <span className="text-sm font-bold text-white">
            {t('personalDriver.specialTripsUsedRatio', { used: specialTripsUsed, included: includedSpecialTrips })}
          </span>
        </div>
      </div>

      {/* CALENDRIER DES 30 JOURS (Rule #4 - Cancellation with Lost KM) */}
      <div className="rounded-2xl border border-white/10 bg-card p-6 shadow-xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <MaterialIcon name="calendar_month" size="md" className="text-primary" />
              {t('personalDriver.transportCalendar30Days')}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('personalDriver.transportCalendarDesc')}
            </p>
          </div>
          <span className="rounded-lg bg-white/5 px-3 py-1 text-xs font-bold text-slate-300 border border-white/10">
            {t('personalDriver.missionsRecordedCount', { count: trips.length })}
          </span>
        </div>

        {trips.length === 0 && activationStatus === 'activating' ? (
          <p className="py-8 text-center text-sm font-medium text-amber-300" role="status">
            {t('personalDriver.paymentConfirmedPreparingTrips')}
          </p>
        ) : trips.length === 0 && activationStatus === 'activation_failed' ? (
          <div className="space-y-3 py-8 text-center text-sm text-red-300" role="alert">
            <p className="font-semibold">{t('personalDriver.tripPreparationFailedTitle')}</p>
            <p className="mt-2">{t('personalDriver.tripPreparationFailedDesc')}</p>
            {renewalActivationSubscriptionId === subscription.id && (
              <button
                type="button"
                onClick={() => beginRenewalActivationPolling(subscription.id)}
                className="min-h-11 rounded-lg border border-red-400/40 px-4 font-bold text-red-100"
              >
                {t('personalDriver.retryVerification')}
              </button>
            )}
          </div>
        ) : trips.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            {t('personalDriver.calendarPreparing')}
          </p>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {trips.map((trip) => {
              const dateLocale = locale === 'en' ? 'en-US' : 'fr-FR';
              const dateObj = new Date(trip.scheduledAtIso);
              const dateStr = dateObj.toLocaleDateString(dateLocale, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              });
              const timeStr = dateObj.toLocaleTimeString(dateLocale, {
                hour: '2-digit',
                minute: '2-digit',
              });
              const badgeCfg = TRIP_STATUS_CONFIG[trip.status] || TRIP_STATUS_CONFIG.scheduled;

              return (
                <div
                  key={trip.id}
                  className="rounded-xl border border-white/5 bg-white/5 p-4 transition hover:border-white/10 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-white capitalize">
                        {dateStr} {t('personalDriver.atTime')} {timeStr}
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${badgeCfg.color}`}>
                        {t(badgeCfg.labelKey)}
                      </span>
                      {trip.isSpecialTrip && (
                        <span className="rounded-md bg-purple-500/20 px-2 py-0.5 text-xs font-bold text-purple-300 border border-purple-500/30">
                          {t('personalDriver.specialTripBadge')}
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
                      className="min-h-11 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 active:scale-95"
                    >
                      {t('personalDriver.cancelThisTrip')}
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
              <h3 className="text-lg font-bold text-white">{t('personalDriver.confirmTripCancelTitle')}</h3>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              {t('personalDriver.confirmTripCancelQuestion', {
                date: new Date(selectedTripToCancel.scheduledAtIso).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </p>
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
              {t('personalDriver.subscriptionRuleWarning')}
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedTripToCancel(null)}
                disabled={actionLoading}
                className="min-h-11 rounded-xl border border-white/10 px-4 text-xs font-semibold text-slate-300 hover:bg-white/5"
              >
                {t('common.back')}
              </button>
              <button
                type="button"
                onClick={handleCancelTrip}
                disabled={actionLoading}
                className="min-h-11 rounded-xl bg-red-600 px-4 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {actionLoading ? t('personalDriver.cancellingAction') : t('personalDriver.confirmCancelAction')}
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
                {t('personalDriver.requestSpecialTripTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setShowSpecialTripModal(false)}
                aria-label={t('common.close')}
                className="flex size-11 items-center justify-center rounded-lg text-slate-400 hover:text-white"
              >
                <MaterialIcon name="close" size="md" />
              </button>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary">
              {t('personalDriver.specialTripMileageDeductionNotice')}
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                {t('personalDriver.pickupLocationLabel')}
                <input
                  type="text"
                  required
                  value={specialPickup}
                  onChange={(e) => setSpecialPickup(e.target.value)}
                  placeholder={t('personalDriver.pickupLocationPlaceholder')}
                  className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white outline-none focus:border-primary"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-300">
                {t('personalDriver.destination')}
                <input
                  type="text"
                  required
                  value={specialDestination}
                  onChange={(e) => setSpecialDestination(e.target.value)}
                  placeholder={t('personalDriver.destinationLocationPlaceholder')}
                  className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white outline-none focus:border-primary"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-300">
                  {t('personalDriver.tripDateLabel')}
                  <input
                    type="date"
                    required
                    value={specialDate}
                    onChange={(e) => setSpecialDate(e.target.value)}
                    className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white outline-none focus:border-primary"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-300">
                  {t('personalDriver.tripTimeLabel')}
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
                {t('personalDriver.estimatedDistanceLabel')}
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
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="min-h-11 rounded-xl bg-primary px-5 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {actionLoading ? t('personalDriver.bookingAction') : t('personalDriver.confirmSpecialTripAction')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
