'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useAuth } from '@/hooks/useAuth';
import { useCapacitorGeolocation } from '@/hooks/useCapacitorGeolocation';
import { useTranslation } from '@/hooks/useTranslation';
import { getUserFacingCallableError } from '@/utils/callable-error';
import type { PersonalDriverTrip } from '@/types/personal-driver';

type TripRow = Partial<PersonalDriverTrip> & { id: string };
const ACTIVE_TRIP_STATUSES = ['scheduled', 'driver_assigned', 'driver_en_route', 'driver_arrived', 'passenger_picked_up', 'in_progress'];
const TRIP_PAGE_SIZE = 12;

function toMillis(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : null;
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

export function PersonalDriverDriverPageClient() {
  const { t, locale } = useTranslation();
  const { currentUser } = useAuth();
  const { getCurrentPosition } = useCapacitorGeolocation();
  const [tripId, setTripId] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignedTrips, setAssignedTrips] = useState<TripRow[]>([]);
  const [tripFilter, setTripFilter] = useState('');
  const [tripPage, setTripPage] = useState(0);

  // Timer state for wait time
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const loadAssignedTrips = useCallback(async (): Promise<TripRow[]> => {
    if (!currentUser?.uid) return [];
    setLoadingTrips(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'personal_driver_trips'),
          where('assignedDriverId', '==', currentUser.uid),
          where('status', 'in', ACTIVE_TRIP_STATUSES),
          orderBy('scheduledAtIso', 'asc'),
          limit(24),
        ),
      );
      const trips = snap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }) as TripRow);
      setAssignedTrips(trips);
      setTripPage((prevPage) => (prevPage * TRIP_PAGE_SIZE >= trips.length ? 0 : prevPage));
      setTripId((selectedId) => {
        if (selectedId && trips.some((trip) => trip.id === selectedId)) return selectedId;
        return trips.find((trip) => (
          trip.status === 'driver_arrived'
          && toMillis(trip.waitStartedAt) !== null
          && toMillis(trip.waitEndedAt) === null
        ))?.id ?? trips[0]?.id ?? '';
      });
      return trips;
    } catch (err: unknown) {
      setError(t('personalDriver.cannotLoadMissions', { error: getUserFacingCallableError(err) }));
      return [];
    } finally {
      setLoadingTrips(false);
    }
  }, [currentUser?.uid, t]);

  useEffect(() => {
    void loadAssignedTrips();
  }, [loadAssignedTrips]);

  const selectedTrip = assignedTrips.find((trip) => trip.id === tripId) ?? null;
  const filteredTrips = assignedTrips.filter((trip) => {
    const filterLocale = locale === 'en' ? 'en-US' : 'fr-FR';
    const term = tripFilter.trim().toLocaleLowerCase(filterLocale);
    return !term || [trip.id, trip.pickupAddress, trip.destinationAddress, trip.status]
      .some((value) => String(value || '').toLocaleLowerCase(filterLocale).includes(term));
  });
  const visibleTrips = filteredTrips.slice(tripPage * TRIP_PAGE_SIZE, (tripPage + 1) * TRIP_PAGE_SIZE);
  const waitStartedAt = toMillis(selectedTrip?.waitStartedAt);
  const waitEndedAt = toMillis(selectedTrip?.waitEndedAt);
  const isWaiting = selectedTrip?.status === 'driver_arrived' && waitStartedAt !== null && waitEndedAt === null;

  useEffect(() => {
    if (!isWaiting || waitStartedAt === null) {
      setElapsedSeconds(0);
      return;
    }
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - waitStartedAt) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [isWaiting, waitStartedAt, waitEndedAt]);

  const handleUpdateStatus = async (status: string) => {
    if (!tripId.trim()) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const callable = httpsCallable(functions, 'driverUpdatePersonalDriverTrip');
      let location: { lat: number; lng: number; accuracy: number } | undefined;
      if (status === 'driver_arrived') {
        setMessage(t('personalDriver.acquiringGps'));
        const precisePos = await getCurrentPosition('tracking', true);
        if (!precisePos) {
          throw new Error(t('personalDriver.gpsAcquisitionError'));
        }
        location = {
          lat: precisePos.lat,
          lng: precisePos.lng,
          accuracy: precisePos.accuracy,
        };
      }
      await callable({ tripId: tripId.trim(), status, ...location });

      const refreshedTrips = await loadAssignedTrips();
      const refreshedTrip = refreshedTrips.find((trip) => trip.id === tripId.trim());
      if (status === 'driver_arrived') {
        setMessage(t('personalDriver.driverArrivedNotice', { id: tripId }));
      } else if (status === 'passenger_picked_up') {
        if (refreshedTrip?.overageChargeStatus === 'failed') {
          setMessage(t('personalDriver.passengerPickedUpOverageFailed'));
        } else if (refreshedTrip?.overageChargeStatus === 'review_required') {
          setMessage(t('personalDriver.passengerPickedUpOverageReview'));
        } else {
          setMessage(t('personalDriver.passengerPickedUpStandard'));
        }
      } else {
        setMessage(t('personalDriver.tripStatusUpdated', { id: tripId, status }));
      }
    } catch (err: unknown) {
      setMessage(null);
      setError(getUserFacingCallableError(err));
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
            {t('personalDriver.driverPortalTitle')}
          </h1>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {t('personalDriver.driverPortalSubtitle')}
        </p>
      </div>

      {message && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-xs font-semibold text-primary">
          {message}
        </div>
      )}

      <section className="rounded-xl border border-white/10 bg-white/5 p-4" aria-label={t('personalDriver.assignedMissionsAria')}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <MaterialIcon name="assignment" size="sm" className="text-primary" />
            {t('personalDriver.myMissions')}
          </h2>
          <button
            type="button"
            onClick={loadAssignedTrips}
            disabled={loadingTrips || !currentUser?.uid}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-300 disabled:opacity-50"
          >
            <MaterialIcon name="refresh" size="sm" />
            {t('common.refresh')}
          </button>
        </div>
        <input
          aria-label={t('personalDriver.filterMissionsAria')}
          value={tripFilter}
          onChange={(event) => { setTripFilter(event.target.value); setTripPage(0); }}
          placeholder={t('personalDriver.filterMissionsPlaceholder')}
          className="mb-3 min-h-[44px] w-full rounded-lg border border-white/10 bg-black/10 px-3 text-xs text-white"
        />
        <div className="space-y-2">
          {visibleTrips.length === 0 ? (
            <p className="rounded-lg border border-white/5 bg-black/10 p-3 text-xs text-slate-400">
              {tripFilter ? t('personalDriver.noMissionsMatch') : t('personalDriver.noActiveMissionsAssigned')}
            </p>
          ) : (
            visibleTrips.map((trip) => (
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
                  {trip.status || t('personalDriver.unknownStatus')} · {trip.scheduledAtIso || t('personalDriver.timeNotProvided')}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {trip.pickupAddress || t('personalDriver.departure')} → {trip.destinationAddress || t('personalDriver.destination')}
                </span>
              </button>
            ))
          )}
        </div>
        {assignedTrips.length > TRIP_PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
            <button
              type="button"
              disabled={tripPage === 0}
              onClick={() => setTripPage((page) => page - 1)}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-white/10 px-3 font-semibold text-slate-300 disabled:opacity-50"
            >
              {t('common.previous')}
            </button>
            <span>{t('personalDriver.pageNumber', { page: tripPage + 1 })}</span>
            <button
              type="button"
              disabled={(tripPage + 1) * TRIP_PAGE_SIZE >= filteredTrips.length}
              onClick={() => setTripPage((page) => page + 1)}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-white/10 px-3 font-semibold text-slate-300 disabled:opacity-50"
            >
              {t('common.next')}
            </button>
          </div>
        )}
      </section>

      {isWaiting && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-center space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center justify-center gap-1">
            <MaterialIcon name="timer" size="sm" className="animate-spin" />
            {t('personalDriver.waitTimerActive')}
          </span>
          <div className="text-4xl font-black text-amber-300 font-mono">
            {formatTimer(elapsedSeconds)}
          </div>
          <p className="text-xs text-slate-400">
            {t('personalDriver.waitTimerNotice')}
          </p>
        </div>
      )}
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-semibold text-red-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadAssignedTrips()}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-red-500/30 px-3 font-semibold text-red-100 hover:bg-red-500/20"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {selectedTrip?.overageChargeStatus === 'failed' && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-semibold text-rose-200">
          {t('personalDriver.overageFailedNotice')}
        </div>
      )}
      {selectedTrip?.overageChargeStatus === 'review_required' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-semibold text-amber-200">
          {t('personalDriver.overageReviewNotice')}
        </div>
      )}

      <div className="space-y-4">
        {!selectedTrip && <p className="text-xs text-slate-400">{t('personalDriver.selectMissionToUpdate')}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          <button
            type="button"
            onClick={() => handleUpdateStatus('driver_en_route')}
            disabled={loading || !selectedTrip}
            className="min-h-12 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-xs transition"
          >
            {t('personalDriver.statusEnRoute')}
          </button>

          <button
            type="button"
            onClick={() => handleUpdateStatus('driver_arrived')}
            disabled={loading || !selectedTrip}
            className="min-h-12 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-xs transition"
          >
            {t('personalDriver.statusArrived')}
          </button>

          <button
            type="button"
            onClick={() => handleUpdateStatus('passenger_picked_up')}
            disabled={loading || !selectedTrip}
            className="min-h-12 rounded-xl font-bold text-white bg-purple-600 hover:bg-purple-500 active:scale-95 disabled:opacity-50 text-xs transition"
          >
            {t('personalDriver.statusPassengerPickedUp')}
          </button>

          <button
            type="button"
            onClick={() => handleUpdateStatus('in_progress')}
            disabled={loading || !selectedTrip}
            className="min-h-12 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-500 active:scale-95 disabled:opacity-50 text-xs transition"
          >
            {t('personalDriver.statusInProgress')}
          </button>

          <button
            type="button"
            onClick={() => handleUpdateStatus('completed')}
            disabled={loading || !selectedTrip}
            className="min-h-12 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-xs transition"
          >
            {t('personalDriver.statusCompleted')}
          </button>
        </div>
      </div>
    </div>
  );
}
