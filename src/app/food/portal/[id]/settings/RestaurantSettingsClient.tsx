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
import { RestaurantVisualPicker } from '@/components/food/RestaurantVisualPicker';
import {
  getRestaurantImagePathFromUrl,
  prepareRestaurantImage,
} from '@/utils/restaurant-image';
import {
  deleteRestaurantImage,
  getRestaurantImageStorageErrorMessage,
  uploadRestaurantImage,
} from '@/services/restaurant-image.service';
import { useTranslation } from '@/hooks/useTranslation';

function cloneOpeningHours(hours: RestaurantOpeningHours): RestaurantOpeningHours {
  return Object.fromEntries(
    Object.entries(hours).map(([key, value]) => [key, { ...value }]),
  ) as RestaurantOpeningHours;
}

export default function RestaurantSettingsClient() {
  const { t } = useTranslation('restaurant');
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('restaurantId')?.trim() || null;
  const { showError, showSuccess, toasts, removeToast } = useToast();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [hours, setHours] = useState<RestaurantOpeningHours | null>(null);
  const [savedHours, setSavedHours] = useState<RestaurantOpeningHours | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [savedLogoUrl, setSavedLogoUrl] = useState<string | null>(null);
  const [savedCoverImageUrl, setSavedCoverImageUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [visualRefreshKey, setVisualRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<'visuals' | 'hours' | null>(null);

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
          showError(t('restaurantNotFound'));
          router.push('/dashboard');
          return;
        }

        if (result.ownerId !== user.uid) {
          showError(t('unauthorizedAccess'));
          router.push('/dashboard');
          return;
        }

        const normalizedHours = normalizeOpeningHours(result.openingHours);
        setLoadError(null);
        setRestaurant(result);
        setHours(normalizedHours);
        setSavedHours(cloneOpeningHours(normalizedHours));
        setLogoUrl(result.logoUrl ?? null);
        setCoverImageUrl(result.coverImageUrl ?? result.imageUrl ?? null);
        setSavedLogoUrl(result.logoUrl ?? null);
        setSavedCoverImageUrl(result.coverImageUrl ?? result.imageUrl ?? null);
      } catch {
        const message = t('settingsLoadError');
        setLoadError(message);
        showError(message);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [id, router, showError, t]);

  const isDirty = useMemo(
    () => Boolean(hours && savedHours && JSON.stringify(hours) !== JSON.stringify(savedHours)),
    [hours, savedHours],
  );

  const isVisualDirty = Boolean(logoFile || coverFile || logoRemoved || coverRemoved);

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
      showSuccess(t('hoursSaved'));
    } catch {
      const saveError = t('hoursSaveError');
      setValidationError(saveError);
      showError(saveError);
    } finally {
      setIsSaving(false);
    }
  };

  const handleVisualSubmit = async () => {
    if (!id || !isVisualDirty) return;

    setIsSaving(true);
    const uploadedPaths: string[] = [];
    const updates: { logoUrl?: string | null; coverImageUrl?: string | null } = {};

    try {
      if (logoFile) {
        const blob = await prepareRestaurantImage(logoFile, 'logo');
        const uploaded = await uploadRestaurantImage({ restaurantId: id, kind: 'logo', blob });
        uploadedPaths.push(uploaded.path);
        updates.logoUrl = uploaded.url;
      } else if (logoRemoved) {
        updates.logoUrl = null;
      }

      if (coverFile) {
        const blob = await prepareRestaurantImage(coverFile, 'cover');
        const uploaded = await uploadRestaurantImage({ restaurantId: id, kind: 'cover', blob });
        uploadedPaths.push(uploaded.path);
        updates.coverImageUrl = uploaded.url;
      } else if (coverRemoved) {
        updates.coverImageUrl = null;
      }

      await FoodDeliveryService.updateRestaurantVisuals(id, updates);

      const previousPaths = [
        updates.logoUrl !== undefined
          ? getRestaurantImagePathFromUrl(savedLogoUrl ?? '')
          : null,
        updates.coverImageUrl !== undefined
          ? getRestaurantImagePathFromUrl(savedCoverImageUrl ?? '')
          : null,
      ];
      await Promise.all(previousPaths.map((path) => path ? deleteRestaurantImage(path).catch(() => undefined) : undefined));

      const nextLogoUrl = updates.logoUrl === undefined ? savedLogoUrl : updates.logoUrl;
      const nextCoverImageUrl = updates.coverImageUrl === undefined ? savedCoverImageUrl : updates.coverImageUrl;
      setLogoUrl(nextLogoUrl);
      setCoverImageUrl(nextCoverImageUrl);
      setSavedLogoUrl(nextLogoUrl);
      setSavedCoverImageUrl(nextCoverImageUrl);
      setLogoFile(null);
      setCoverFile(null);
      setLogoRemoved(false);
      setCoverRemoved(false);
      setVisualRefreshKey((value) => value + 1);
      showSuccess(t('visualsSaved'));
    } catch (visualError) {
      await Promise.all(uploadedPaths.map((path) => deleteRestaurantImage(path).catch(() => undefined)));
      const message = visualError instanceof Error && visualError.message.startsWith('Le ')
        ? visualError.message
        : getRestaurantImageStorageErrorMessage(visualError);
      showError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRestaurant = async () => {
    if (!id) return;

    setIsDeleting(true);
    try {
      await FoodDeliveryService.deleteRestaurant(id);
      router.replace('/dashboard');
    } catch {
      showError(t('deleteRestaurantWarning'));
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  if (loadError || !restaurant || !hours || !id) {
    return (
      <div className="min-h-screen bg-background px-4 py-16 text-center text-slate-300">
        <div className="mx-auto max-w-md rounded-3xl border border-red-500/20 bg-red-500/5 p-8">
          <MaterialIcon name="error" size="xl" className="mx-auto mb-4 text-red-300" />
          <p role="alert" className="text-sm text-red-200">{loadError ?? 'Paramètres indisponibles.'}</p>
          <Link
            href={id ? getRestaurantPortalPath(id) : '/restaurant/dashboard'}
            className="mt-6 inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-primary/50 hover:text-primary"
          >
            Retour au tableau de bord
          </Link>
        </div>
      </div>
    );
  }

  const today = getOpeningHoursForDate(hours, new Date());

  return (
    <div className="min-h-screen bg-background pb-20">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <RestaurantPortalHeader restaurantName={restaurant.name} logoUrl={logoUrl} />

      <main className="mx-auto max-w-[440px] space-y-5 px-4 pb-8 pt-3">
        <div className="flex items-center justify-between gap-4 px-1">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-black tracking-tight text-white">{t('settingsTitle')}</h1>
          </div>
        </div>

        <section className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('visualIdentity')}</p>
          <div className="rounded-3xl border border-white/[0.06] bg-[#1c1b1a] p-1.5">
            <button
              type="button"
              aria-expanded={openSection === 'visuals'}
              onClick={() => setOpenSection((current) => current === 'visuals' ? null : 'visuals')}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <MaterialIcon name="photo_library" size="md" className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold text-white">{t('visualIdentity')}</h2>
                <p className="mt-0.5 truncate text-xs text-slate-400">{t('visualIdentityDesc')}</p>
              </div>
              <MaterialIcon name={openSection === 'visuals' ? 'expand_less' : 'chevron_right'} className="shrink-0 text-slate-500" />
            </button>

            {openSection === 'visuals' && <>
              <div className="grid gap-3 px-1 pb-1">
              <RestaurantVisualPicker
                key={`logo-${visualRefreshKey}`}
                kind="logo"
                currentUrl={logoUrl}
                onChange={(file, action) => {
                  setLogoFile(file);
                  setLogoRemoved(action === 'remove');
                }}
                disabled={isSaving || isDeleting}
              />
              <RestaurantVisualPicker
                key={`cover-${visualRefreshKey}`}
                kind="cover"
                currentUrl={coverImageUrl}
                onChange={(file, action) => {
                  setCoverFile(file);
                  setCoverRemoved(action === 'remove');
                }}
                disabled={isSaving || isDeleting}
              />
              </div>

              <div className="flex justify-end border-t border-white/[0.06] px-3 py-3">
                <button
                  type="button"
                  disabled={!isVisualDirty || isSaving || isDeleting}
                  onClick={handleVisualSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] px-5 py-3 font-bold text-white primary-glow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                  {isSaving && <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                  {isSaving ? t('savingSettings') : t('saveVisuals')}
                </button>
              </div>
            </>}
          </div>
        </section>

        <section className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('step4Title')}</p>
          <div className="rounded-3xl border border-white/[0.06] bg-[#1c1b1a] p-1.5">
            <button
              type="button"
              aria-expanded={openSection === 'hours'}
              onClick={() => setOpenSection((current) => current === 'hours' ? null : 'hours')}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <MaterialIcon name="schedule" size="md" className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold text-white">{t('step4Title')}</h2>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {t('ordersFollowSchedule')}
                </p>
              </div>
              <MaterialIcon name={openSection === 'hours' ? 'expand_less' : 'chevron_right'} className="shrink-0 text-slate-500" />
            </button>

            {openSection === 'hours' && <>
              <div className="mx-1 mb-3 flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
              <MaterialIcon name="today" size="md" className="text-primary" />
              <p className="text-sm text-slate-300">
                {t('openingHoursToday')} : <span className="font-bold text-white">{today.closed ? t('closedDay') : `${today.open} – ${today.close}`}</span>
              </p>
              </div>

              {validationError && (
              <div role="alert" className="mx-1 mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {validationError}
              </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-1.5 px-1" noValidate>
              {RESTAURANT_DAYS.map(({ key, label }) => {
                const day = hours[key];

                return (
                  <div key={key} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/10">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-white">{label}</p>
                        <p className="mt-1 text-xs text-slate-500">{day.closed ? t('closedDay') : `${day.open} – ${day.close}`}</p>
                      </div>
                      <label className="flex shrink-0 cursor-pointer items-center gap-3">
                        <span className="text-xs font-semibold text-slate-400">{day.closed ? t('closedDay') : t('openDay')}</span>
                        <input
                          type="checkbox"
                          checked={!day.closed}
                          onChange={(event) => updateDay(key, 'closed', !event.target.checked)}
                          disabled={isDeleting}
                          aria-label={`${label} ouvert`}
                          className="peer sr-only"
                        />
                        <span aria-hidden="true" className={`relative h-6 w-11 rounded-full transition peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${day.closed ? 'bg-slate-700' : 'bg-green-500'}`}>
                          <span className={`absolute left-1 top-1 size-4 rounded-full bg-white transition ${day.closed ? '' : 'translate-x-5'}`} />
                        </span>
                      </label>
                    </div>

                    {!day.closed && (
                      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-white/[0.06] pt-4 sm:grid-cols-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          {t('openDay')}
                          <input
                            type="time"
                            disabled={isDeleting}
                            value={day.open}
                            onChange={(event) => updateDay(key, 'open', event.target.value)}
                            aria-label={`${label} ouverture`}
                            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold text-white outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                        </label>
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          {t('closedDay')}
                          <input
                            type="time"
                            disabled={isDeleting}
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

              <div className="flex justify-end border-t border-white/[0.06] pt-4">
                <button
                  type="submit"
                  disabled={!isDirty || isSaving || isDeleting}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] px-5 py-3 font-bold text-white primary-glow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                  {isSaving && <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                  {isSaving ? t('savingSettings') : t('saveHours')}
                </button>
              </div>
              </form>
            </>}
          </div>
        </section>

        <section className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-red-300/80">{t('dangerZone')}</p>
          <div className="rounded-3xl border border-red-500/20 bg-red-500/[0.04] p-1.5">
            <div className="flex items-start gap-3 px-3 py-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/10">
                <MaterialIcon name="delete_forever" size="md" className="text-red-300" />
              </div>
              <div className="flex-1">
                <h2 className="text-[15px] font-semibold text-white">{t('dangerZone')}</h2>
                <p className="mt-0.5 text-xs leading-5 text-slate-400">
                  {t('deleteRestaurantWarning')}
                </p>

                {!showDeleteConfirmation ? (
                  <button
                    type="button"
                    disabled={isSaving || isDeleting}
                    onClick={() => setShowDeleteConfirmation(true)}
                    className="mt-4 rounded-xl border border-red-500/40 px-4 py-3 text-sm font-bold text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('deleteThisRestaurant')}
                  </button>
                ) : (
                  <div className="mt-4 rounded-2xl border border-red-500/30 bg-black/20 p-4">
                    <p className="text-sm font-semibold text-red-100">{t('confirmDeletePermanently')}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {t('deleteRestaurantConfirmPrompt')}
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setShowDeleteConfirmation(false)}
                        className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-300 transition hover:border-white/20 disabled:opacity-40"
                      >
                        {t('cancel')}
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={handleDeleteRestaurant}
                        className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isDeleting ? t('submittingFile') : t('deletePermanently')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <BottomNav items={portalNavItems(id)} />
    </div>
  );
}
