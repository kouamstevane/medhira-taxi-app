'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import type { Restaurant } from '@/types';
import { RESTAURANT_DAYS } from '@/utils/restaurant-constants';
import {
  getOpeningHoursForDate,
  normalizeOpeningHours,
  type RestaurantOpeningHours,
  validateOpeningHours,
} from '@/utils/restaurant-hours';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav, portalNavItems } from '@/components/ui/BottomNav';
import { RestaurantPortalHeader } from '../RestaurantPortalHeader';
import { getRestaurantPortalPath } from '../../restaurant-portal-paths';

function cloneOpeningHours(hours: RestaurantOpeningHours): RestaurantOpeningHours {
  return Object.fromEntries(
    Object.entries(hours).map(([key, value]) => [key, { ...value }]),
  ) as RestaurantOpeningHours;
}

export default function RestaurantSettingsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('restaurantId')?.trim() || null;
  const { showError, showSuccess, toasts, removeToast } = useToast();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [hours, setHours] = useState<RestaurantOpeningHours | null>(null);
  const [savedHours, setSavedHours] = useState<RestaurantOpeningHours | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      router.replace('/restaurant/dashboard');
    }
  }, [id, router]);

  useEffect(() => {
    if (!id) return;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        setLoading(false);
        return;
      }

      try {
        const result = await FoodDeliveryService.getRestaurantById(id);

        if (!result) {
          showError('Restaurant introuvable.');
          router.push('/dashboard');
          return;
        }

        if (result.ownerId !== user.uid) {
          showError('Accès non autorisé.');
          router.push('/dashboard');
          return;
        }

        const normalizedHours = normalizeOpeningHours(result.openingHours);
        setRestaurant(result);
        setHours(normalizedHours);
        setSavedHours(cloneOpeningHours(normalizedHours));
      } catch {
        showError('Erreur lors du chargement des paramètres.');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [id, router, showError]);

  const isDirty = useMemo(
    () => Boolean(hours && savedHours && JSON.stringify(hours) !== JSON.stringify(savedHours)),
    [hours, savedHours],
  );

  const updateDay = (
    key: keyof RestaurantOpeningHours,
    field: 'open' | 'close' | 'closed',
    value: string | boolean,
  ) => {
    setValidationError(null);
    setHours((current) => current ? {
      ...current,
      [key]: { ...current[key], [field]: value },
    } : current);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || !hours) return;

    const error = validateOpeningHours(hours);
    if (error) {
      setValidationError(error);
      showError(error);
      return;
    }

    setIsSaving(true);
    setValidationError(null);

    try {
      await FoodDeliveryService.updateRestaurantOpeningHours(id, hours);
      setSavedHours(cloneOpeningHours(hours));
      showSuccess('Horaires enregistrés.');
    } catch {
      const saveError = 'Impossible d’enregistrer les horaires. Réessayez.';
      setValidationError(saveError);
      showError(saveError);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || !restaurant || !hours || !id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  const today = getOpeningHoursForDate(hours, new Date());

  return (
    <div className="min-h-screen bg-background pb-20">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <RestaurantPortalHeader restaurantName={restaurant.name} />

      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">Réglages du restaurant</p>
            <h2 className="text-3xl font-bold text-white">Paramètres</h2>
            <p className="mt-2 text-sm text-slate-400">Gérez les horaires de votre restaurant.</p>
          </div>
          <Link
            href={getRestaurantPortalPath(id)}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-primary/50 hover:text-primary"
          >
            <MaterialIcon name="arrow_back" size="sm" />
            <span className="hidden sm:inline">Tableau de bord</span>
          </Link>
        </div>

        <section className="glass-card rounded-3xl border border-white/5 p-5 sm:p-7">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              <MaterialIcon name="schedule" size="lg" className="text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Horaires d’ouverture</h3>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Définissez les heures auxquelles les clients peuvent passer commande.
              </p>
            </div>
          </div>

          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
            <MaterialIcon name="today" className="text-primary" />
            <p className="text-sm text-slate-300">
              Aujourd’hui : <span className="font-bold text-white">{today.closed ? 'Fermé' : `${today.open} – ${today.close}`}</span>
            </p>
          </div>

          {validationError && (
            <div role="alert" className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {validationError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {RESTAURANT_DAYS.map(({ key, label }) => {
              const day = hours[key];

              return (
                <div key={key} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition hover:border-white/10">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">{label}</p>
                      <p className="mt-1 text-xs text-slate-500">{day.closed ? 'Fermé' : `${day.open} – ${day.close}`}</p>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-3">
                      <span className="text-xs font-semibold text-slate-400">{day.closed ? 'Fermé' : 'Ouvert'}</span>
                      <input
                        type="checkbox"
                        checked={!day.closed}
                        onChange={(event) => updateDay(key, 'closed', !event.target.checked)}
                        aria-label={`${label} ouvert`}
                        className="peer sr-only"
                      />
                      <span aria-hidden="true" className={`relative h-6 w-11 rounded-full transition peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${day.closed ? 'bg-slate-700' : 'bg-green-500'}`}>
                        <span className={`absolute left-1 top-1 size-4 rounded-full bg-white transition ${day.closed ? '' : 'translate-x-5'}`} />
                      </span>
                    </label>
                  </div>

                  {!day.closed && (
                    <div className="mt-4 grid grid-cols-1 gap-3 border-t border-white/5 pt-4 sm:grid-cols-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Ouverture
                        <input
                          type="time"
                          value={day.open}
                          onChange={(event) => updateDay(key, 'open', event.target.value)}
                          aria-label={`${label} ouverture`}
                          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold text-white outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </label>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Fermeture
                        <input
                          type="time"
                          value={day.close}
                          onChange={(event) => updateDay(key, 'close', event.target.value)}
                          aria-label={`${label} fermeture`}
                          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold text-white outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex justify-end border-t border-white/5 pt-6">
              <button
                type="submit"
                disabled={!isDirty || isSaving}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] px-6 py-3.5 font-bold text-white primary-glow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                {isSaving && <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {isSaving ? 'Enregistrement…' : 'Enregistrer les horaires'}
              </button>
            </div>
          </form>
        </section>
      </main>

      <BottomNav items={portalNavItems(id)} />
    </div>
  );
}
