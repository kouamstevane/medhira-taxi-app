'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { AuthService } from '@/services';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import type { Restaurant } from '@/types';
import { RESTAURANT_DAYS, type RestaurantDayKey } from '@/utils/restaurant-constants';
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
import { BottomSheet } from '@/components/ui/BottomSheet';
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
import { ProfileMenuItem } from '@/app/profil/ProfileMenuItem';

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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showVisualsSheet, setShowVisualsSheet] = useState(false);
  const [showHoursSheet, setShowHoursSheet] = useState(false);
  const [expandedDay, setExpandedDay] = useState<RestaurantDayKey | null>(null);
  const [signingOut, setSigningOut] = useState(false);

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

  const handleToggleDayClosed = (key: RestaurantDayKey, closed: boolean) => {
    updateDay(key, 'closed', closed);
    if (!closed) {
      setExpandedDay(key);
    } else if (expandedDay === key) {
      setExpandedDay(null);
    }
  };

  const applyToAllOpenDays = (sourceKey: RestaurantDayKey) => {
    if (!hours) return;
    const sourceDay = hours[sourceKey];
    setHours((current) => {
      if (!current) return current;
      const next = { ...current };
      RESTAURANT_DAYS.forEach(({ key }) => {
        if (!next[key].closed && key !== sourceKey) {
          next[key] = {
            ...next[key],
            open: sourceDay.open,
            close: sourceDay.close,
          };
        }
      });
      return next;
    });
    showSuccess(t('hoursAppliedToAll'));
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
      setShowHoursSheet(false);
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
      setShowVisualsSheet(false);
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

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await AuthService.signOut();
      router.replace('/login');
    } catch {
      showError(t('signOutError'));
      setSigningOut(false);
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
          <p role="alert" className="text-sm text-red-200">{loadError ?? t('settingsUnavailable')}</p>
          <Link
            href={id ? getRestaurantPortalPath(id) : '/restaurant/dashboard'}
            className="mt-6 inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-primary/50 hover:text-primary"
          >
            {t('backToDashboard')}
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
        <div className="px-1">
          <h1 className="text-2xl font-black tracking-tight text-white">{t('settingsTitle')}</h1>
        </div>

        {/* SECTION 1: Restaurant Management */}
        <div className="space-y-1.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
            {t('restaurantManagement')}
          </h2>
          <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-1.5 divide-y divide-white/[0.04]">
            <ProfileMenuItem
              icon="photo_library"
              iconColorVariant="sky"
              title={t('visualIdentity')}
              subtitle={t('visualIdentityDesc')}
              onClick={() => setShowVisualsSheet(true)}
            />
            <ProfileMenuItem
              icon="schedule"
              iconColorVariant="amber"
              title={t('step4Title')}
              subtitle={today.closed ? t('closedDay') : `${today.open} – ${today.close}`}
              onClick={() => setShowHoursSheet(true)}
            />
          </div>
        </div>

        {/* SECTION 2: Partner Support */}
        <div className="space-y-1.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
            {t('partnerSupport')}
          </h2>
          <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-1.5 divide-y divide-white/[0.04]">
            <ProfileMenuItem
              icon="support_agent"
              iconColorVariant="purple"
              title={t('contactBusiness')}
              subtitle={t('partnerSupportDesc')}
              href="mailto:business@medjira.com"
              isExternal
            />
          </div>
        </div>

        {/* SECTION 3: Sign Out & Account */}
        <div className="space-y-1.5">
          <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-1.5 divide-y divide-white/[0.04]">
            <ProfileMenuItem
              icon="logout"
              iconColorVariant="slate"
              title={signingOut ? t('signingOutAction') : t('signOutAction')}
              onClick={signingOut ? undefined : () => void handleSignOut()}
            />
            <ProfileMenuItem
              icon="delete_forever"
              iconColorVariant="destructive"
              title={t('deleteThisRestaurant')}
              destructive
              onClick={() => {
                setShowDeleteModal(true);
                setDeleteConfirmText('');
              }}
            />
          </div>
        </div>
      </main>

      {/* Visuals BottomSheet */}
      <BottomSheet
        open={showVisualsSheet}
        onOpenChange={(open) => { if (!open) setShowVisualsSheet(false); }}
        onCloseRequest={() => setShowVisualsSheet(false)}
        title={t('visualIdentity')}
        showCloseButton
        closeLabel={t('cancel')}
        className="bg-[#18181b] border-white/10 text-white max-h-[90vh] sm:max-w-md"
      >
        <div className="space-y-4 pb-2">
          <p className="text-xs text-slate-400 leading-relaxed">{t('visualIdentityDesc')}</p>

          <div className="grid gap-3">
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

          <button
            type="button"
            disabled={!isVisualDirty || isSaving || isDeleting}
            onClick={() => void handleVisualSubmit()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] px-5 py-3.5 min-h-[44px] font-bold text-white primary-glow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSaving && <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            {isSaving ? t('savingSettings') : t('saveVisuals')}
          </button>
        </div>
      </BottomSheet>

      {/* Hours BottomSheet */}
      <BottomSheet
        open={showHoursSheet}
        onOpenChange={(open) => { if (!open) setShowHoursSheet(false); }}
        onCloseRequest={() => setShowHoursSheet(false)}
        title={t('step4Title')}
        showCloseButton
        closeLabel={t('cancel')}
        className="bg-[#18181b] border-white/10 text-white max-h-[90vh] sm:max-w-md"
      >
        <div className="space-y-4 pb-6">
          <div className="flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
            <MaterialIcon name="today" size="md" className="text-primary" />
            <p className="text-sm text-slate-300">
              {t('openingHoursToday')} : <span className="font-bold text-white">{today.closed ? t('closedDay') : `${today.open} – ${today.close}`}</span>
            </p>
          </div>

          {validationError && (
            <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {validationError}
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2" noValidate>
            {RESTAURANT_DAYS.map(({ key, label }) => {
              const day = hours[key];
              const isExpanded = expandedDay === key;

              return (
                <div
                  key={key}
                  className={`rounded-2xl border transition ${
                    isExpanded
                      ? 'border-primary/40 bg-white/[0.04] shadow-lg shadow-black/20'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'
                  }`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={!day.closed ? isExpanded : undefined}
                    aria-label={`${label} ${day.closed ? t('closedDay') : `${day.open} – ${day.close}`}`}
                    onClick={() => {
                      if (!day.closed) {
                        setExpandedDay((prev) => (prev === key ? null : key));
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !day.closed) {
                        e.preventDefault();
                        setExpandedDay((prev) => (prev === key ? null : key));
                      }
                    }}
                    className={`flex items-center justify-between gap-3 p-3 sm:p-3.5 ${
                      !day.closed ? 'cursor-pointer select-none' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <p className="font-semibold text-white text-sm shrink-0">{label}</p>
                      {day.closed ? (
                        <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-slate-400">
                          {t('closedDay')}
                        </span>
                      ) : (
                        <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary truncate">
                          {day.open} – {day.close}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <label
                        className="flex cursor-pointer items-center gap-2 min-h-[44px] min-w-[44px] justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-xs font-semibold text-slate-400 hidden sm:inline">
                          {day.closed ? t('closedDay') : t('openDay')}
                        </span>
                        <input
                          type="checkbox"
                          checked={!day.closed}
                          onChange={(event) => handleToggleDayClosed(key, !event.target.checked)}
                          disabled={isDeleting}
                          aria-label={`${label} ouvert`}
                          className="peer sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={`relative h-6 w-11 rounded-full transition peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${
                            day.closed ? 'bg-slate-700' : 'bg-green-500'
                          }`}
                        >
                          <span
                            className={`absolute left-1 top-1 size-4 rounded-full bg-white transition ${
                              day.closed ? '' : 'translate-x-5'
                            }`}
                          />
                        </span>
                      </label>

                      {!day.closed && (
                        <button
                          type="button"
                          aria-label={isExpanded ? `${t('fold')} ${label}` : `${t('modifyHours')} ${label}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedDay((prev) => (prev === key ? null : key));
                          }}
                          className="flex items-center justify-center size-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
                        >
                          <MaterialIcon
                            name={isExpanded ? 'expand_less' : 'expand_more'}
                            size="sm"
                            className="transition-transform duration-200"
                          />
                        </button>
                      )}
                    </div>
                  </div>

                  {!day.closed && (
                    <div
                      className={`px-3.5 pb-3.5 pt-2 border-t border-white/[0.06] ${
                        isExpanded ? 'block' : 'hidden'
                      }`}
                    >
                      <div className="grid grid-cols-2 gap-2.5">
                        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-400">
                          <span className="flex items-center gap-1 text-[11px] uppercase tracking-wider font-bold text-slate-400">
                            <MaterialIcon name="schedule" size="sm" className="text-primary text-[14px]" />
                            {t('openDay')}
                          </span>
                          <input
                            type="time"
                            disabled={isDeleting}
                            value={day.open}
                            onChange={(event) => updateDay(key, 'open', event.target.value)}
                            aria-label={`${label} ouverture`}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-white outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 min-h-[44px]"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-400">
                          <span className="flex items-center gap-1 text-[11px] uppercase tracking-wider font-bold text-slate-400">
                            <MaterialIcon name="schedule" size="sm" className="text-slate-400 text-[14px]" />
                            {t('closedDay')}
                          </span>
                          <input
                            type="time"
                            disabled={isDeleting}
                            value={day.close}
                            onChange={(event) => updateDay(key, 'close', event.target.value)}
                            aria-label={`${label} fermeture`}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-white outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 min-h-[44px]"
                          />
                        </label>
                      </div>

                      <div className="mt-2.5 flex justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            applyToAllOpenDays(key);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 active:scale-95 min-h-[36px]"
                        >
                          <MaterialIcon name="content_copy" size="sm" className="text-[14px]" />
                          {t('applyToAllOpenDays')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="sticky bottom-0 -mx-4 -mb-6 px-4 pt-3 pb-4 bg-[#18181b]/95 backdrop-blur-md border-t border-white/[0.06] mt-3">
              <button
                type="submit"
                disabled={!isDirty || isSaving || isDeleting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] px-5 py-3.5 min-h-[44px] font-bold text-white primary-glow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSaving && <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {isSaving ? t('savingSettings') : t('saveHours')}
              </button>
            </div>
          </form>
        </div>
      </BottomSheet>

      {/* Delete Restaurant Confirmation Modal (centered, like /profil delete account) */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => {
            if (!isDeleting) {
              setShowDeleteModal(false);
              setDeleteConfirmText('');
            }
          }}
        >
          <div
            className="w-full max-w-md bg-[#18181b] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-destructive/15 flex items-center justify-center mb-3">
                <MaterialIcon name="warning" className="text-destructive text-[32px]" />
              </div>
              <h3 className="text-lg font-bold text-white">{t('confirmDeletePermanently')}</h3>
              <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                {t('deleteRestaurantWarning')}
              </p>
            </div>

            <p className="text-xs text-slate-400 text-center leading-relaxed">
              {t('deleteRestaurantConfirmPrompt')}
            </p>

            <div className="space-y-1.5 text-left">
              <label
                htmlFor="delete-restaurant-confirm-input"
                className="block text-xs text-slate-300 font-medium"
              >
                {t('deleteRestaurantTypePrompt', {
                  confirmWord: t('deleteRestaurantConfirmWord'),
                })}
              </label>
              <input
                id="delete-restaurant-confirm-input"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                disabled={isDeleting}
                placeholder={t('deleteRestaurantInputPlaceholder')}
                className="glass-input w-full rounded-xl p-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:ring-2 focus:ring-destructive border border-white/10"
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                className="w-full h-12 min-h-[44px] rounded-2xl border border-white/10 text-sm font-bold text-slate-300 transition hover:border-white/20 disabled:opacity-40"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={
                  isDeleting ||
                  (deleteConfirmText.trim().toLowerCase() !==
                    t('deleteRestaurantConfirmWord').toLowerCase() &&
                    deleteConfirmText.trim().toLowerCase() !== 'supprimer' &&
                    deleteConfirmText.trim().toLowerCase() !== 'delete')
                }
                onClick={() => void handleDeleteRestaurant()}
                className="w-full h-12 min-h-[44px] rounded-2xl bg-red-600 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isDeleting ? t('submittingFile') : t('deletePermanently')}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav items={portalNavItems(id)} />
    </div>
  );
}
