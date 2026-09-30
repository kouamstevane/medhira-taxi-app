'use client';

import React, { useState, useEffect } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import Image from 'next/image';
import { toast } from 'react-hot-toast';
import { Timestamp, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '@/config/firebase';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { MerchantType, Restaurant } from '@/types/food-delivery';
import { CURRENCY_CODE } from '@/utils/constants';
import { MERCHANT_TYPES_CONFIG, getMerchantTypeOption } from '@/utils/restaurant-constants';
import AdminHeader from '@/components/admin/AdminHeader';
import { BottomNav, adminNavItems } from '@/components/ui/BottomNav';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useTranslation } from '@/hooks/useTranslation';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AdminRestaurants');

const RestaurantSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center justify-between p-4 bg-[#18181b] border border-white/10 rounded-2xl animate-pulse">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 shrink-0 rounded-xl bg-white/10" />
          <div className="space-y-2">
            <div className="h-4 w-48 bg-white/10 rounded" />
            <div className="h-3 w-32 bg-white/10 rounded" />
          </div>
        </div>
        <div className="h-4 w-24 bg-white/10 rounded" />
        <div className="h-8 w-8 bg-white/10 rounded-lg" />
      </div>
    ))}
  </div>
);

export default function AdminRestaurantsPage() {
  const { t, locale } = useTranslation('restaurant');
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending_approval' | 'approved' | 'rejected' | 'all'>('pending_approval');
  const [merchantTypeFilter, setMerchantTypeFilter] = useState<MerchantType | 'all'>('all');
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [commissionRateDraft, setCommissionRateDraft] = useState('');
  const [showCommissionConfirm, setShowCommissionConfirm] = useState(false);
  const [commissionJustSaved, setCommissionJustSaved] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = useAdminAuth();

  useEffect(() => {
    setCommissionRateDraft(
      selectedRestaurant ? String(selectedRestaurant.commissionRate ?? 5) : '',
    );
    setShowCommissionConfirm(false);
    setCommissionJustSaved(false);
  }, [selectedRestaurant]);

  // Fetch Restaurants
  useEffect(() => {
    if (isAdmin !== true) return;

    const fetchRestaurants = async () => {
      setLoading(true);
      setError(null);
      try {
        let result: Restaurant[];
        if (filter === 'all') {
          const q = query(collection(db, 'restaurants'), orderBy('createdAt', 'desc'), limit(50));
          const snap = await getDocs(q);
          result = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Restaurant[];
        } else if (filter === 'pending_approval') {
          result = await FoodDeliveryService.getPendingRestaurants(50);
        } else {
          const q = query(collection(db, 'restaurants'), where('status', '==', filter), orderBy('createdAt', 'desc'), limit(50));
          const snap = await getDocs(q);
          result = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Restaurant[];
        }
        setRestaurants(result);
      } catch (err) {
        logger.error('Chargement des restaurants', err instanceof Error ? err : new Error(String(err)));
        if (err instanceof Error && err.message?.includes('index')) {
          setError(t('adminIndexError'));
        } else {
          setError(t('adminLoadError'));
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRestaurants();
  }, [isAdmin, filter, t]);

  const handleApproval = async (restaurantId: string, approve: boolean) => {
    if (!auth.currentUser) {
      toast.error(t('adminSessionExpired'));
      return;
    }

    setProcessing(restaurantId);
    try {
      const action = approve ? 'approve' : 'reject';

      const adminManageRestaurant = httpsCallable(functions, 'adminManageRestaurant');
      const result = await adminManageRestaurant({
        action,
        restaurantId,
        ...(approve ? {} : { reason: rejectionReason.trim() }),
      });

      const response = result.data as { emailSent?: boolean };
      toast.success(
        approve && response.emailSent === false
          ? t('adminRestaurantApprovedNoEmail')
          : approve
            ? t('adminRestaurantApproved')
            : t('adminRestaurantRejected'),
      );

      // Mettre à jour l'état local pour retirer le restaurant traité de la liste
      setRestaurants(prev => prev.filter(r => r.id !== restaurantId));
      setSelectedRestaurant(null);
      setRejectionReason('');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('adminStatusUpdateError');
      logger.error('Mise à jour statut restaurant', err instanceof Error ? err : new Error(String(err)));
      toast.error(message);
    } finally {
      setProcessing(null);
    }
  };

  const handleOpenCommissionConfirm = () => {
    if (!auth.currentUser) {
      toast.error(t('adminSessionExpired'));
      return;
    }

    const commissionRate = Number(commissionRateDraft);
    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
      toast.error(t('adminCommissionRateError'));
      return;
    }

    setShowCommissionConfirm(true);
  };

  const handleCommissionRateSave = async (restaurantId: string) => {
    if (!auth.currentUser) {
      toast.error(t('adminSessionExpired'));
      setShowCommissionConfirm(false);
      return;
    }

    const commissionRate = Number(commissionRateDraft);
    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
      toast.error(t('adminCommissionRateError'));
      setShowCommissionConfirm(false);
      return;
    }

    setProcessing(restaurantId);
    try {
      const adminManageRestaurant = httpsCallable(functions, 'adminManageRestaurant');
      const result = await adminManageRestaurant({
        action: 'set_commission_rate',
        restaurantId,
        commissionRate,
      });
      const response = result.data as { commissionRate?: number };
      const savedRate = typeof response.commissionRate === 'number'
        ? response.commissionRate
        : commissionRate;

      setRestaurants(prev => prev.map(restaurant => (
        restaurant.id === restaurantId
          ? { ...restaurant, commissionRate: savedRate }
          : restaurant
      )));
      setSelectedRestaurant(prev => (
        prev?.id === restaurantId
          ? { ...prev, commissionRate: savedRate }
          : prev
      ));
      setShowCommissionConfirm(false);
      setCommissionJustSaved(true);
      setTimeout(() => setCommissionJustSaved(false), 4000);
      toast.success(t('adminCommissionUpdated'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('adminCommissionUpdateError');
      logger.error('Mise à jour commission restaurant', err instanceof Error ? err : new Error(String(err)));
      toast.error(message);
    } finally {
      setProcessing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string, style: string }> = {
      pending_approval: { label: t('adminStatusPending'), style: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
      approved: { label: t('adminStatusApproved'), style: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
      rejected: { label: t('adminStatusRejected'), style: 'bg-rose-500/10 text-rose-500 border-rose-500/20' },
      suspended: { label: t('adminStatusSuspended'), style: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
    };

    const config = configs[status] || { label: status, style: 'bg-slate-500/10 text-slate-500 border-slate-500/20' };

    return (
      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${config.style}`}>
        {config.label}
      </span>
    );
  };

  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isAdmin === false) return null;

  const filteredRestaurants = restaurants.filter((r) => {
    if (merchantTypeFilter === 'all') return true;
    return (r.merchantType || 'restaurant') === merchantTypeFilter;
  });

  return (
    <div className="min-h-screen bg-background text-white">
      <AdminHeader
        title={t('adminTitle')}
        subtitle={t('adminSubtitle')}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div role="tablist" aria-label={t('adminTablistLabel')} className="mb-4 grid grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-[#18181b] p-1">
          {([
            ['pending_approval', 'schedule', t('adminTabPending')],
            ['approved', 'check_circle', t('adminTabApproved')],
            ['rejected', 'cancel', t('adminTabRejected')],
            ['all', 'store', t('adminTabAll')],
          ] as const).map(([value, icon, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-bold transition ${filter === value ? 'bg-card text-primary shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              <MaterialIcon name={icon} size="sm" />
              {label}
            </button>
          ))}
        </div>

        {/* Merchant Type Filters */}
        <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setMerchantTypeFilter('all')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition ${
              merchantTypeFilter === 'all'
                ? 'bg-primary text-black font-bold shadow-sm'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <MaterialIcon name="apps" size="sm" />
            {t('adminAllMerchantTypes')}
          </button>
          {MERCHANT_TYPES_CONFIG.map((option) => {
            const isSelected = merchantTypeFilter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setMerchantTypeFilter(option.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition ${
                  isSelected
                    ? 'bg-primary text-black font-bold shadow-sm'
                    : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <MaterialIcon name={option.icon} size="sm" />
                {t(`merchantTypes.${option.id}` as never)}
              </button>
            );
          })}
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex items-center gap-3 mb-6 animate-in fade-in slide-in-from-top-2">
            <MaterialIcon name="warning" size="md" className="shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Content Table & Mobile Cards */}
        <div className="w-full min-w-0 md:glass-card md:border md:border-white/5 md:rounded-3xl md:overflow-hidden">
          {loading ? (
            <RestaurantSkeleton />
          ) : filteredRestaurants.length === 0 ? (
            <div className="py-24 text-center rounded-2xl md:rounded-3xl border border-white/10 md:border-0 bg-[#18181b] md:bg-transparent">
              <div className="inline-flex p-4 rounded-full bg-white/5 mb-4 text-slate-500">
                <MaterialIcon name="store" size="xl" />
              </div>
              <h3 className="text-lg font-semibold text-white">{t('adminNoPending')}</h3>
              <p className="text-slate-400 text-sm mt-1 max-w-xs mx-auto">
                {t('adminNoPendingDesc')}
              </p>
            </div>
          ) : (
            <div className="w-full min-w-0 overflow-x-hidden md:overflow-x-auto">
              {/* Desktop Header Row */}
              <div className="hidden md:grid md:grid-cols-[minmax(220px,2fr)_minmax(140px,1.2fr)_minmax(160px,1.5fr)_110px_100px_48px] items-center gap-4 px-6 py-3.5 bg-white/[0.03] border-b border-white/5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                <div>{t('adminThMerchant')}</div>
                <div>{t('adminThTypeBudget')}</div>
                <div>{t('adminThLocation')}</div>
                <div>{t('adminThStatus')}</div>
                <div>{t('adminThCreatedAt')}</div>
                <div className="text-right">{t('adminThDetails')}</div>
              </div>

              {/* Items List (Cards on Mobile, Grid Rows on Desktop) */}
              <div className="space-y-3 md:space-y-0 md:divide-y md:divide-white/5 w-full min-w-0">
                {filteredRestaurants.map((restaurant) => {
                  const merchantType = restaurant.merchantType || 'restaurant';
                  const typeConfig = getMerchantTypeOption(merchantType);

                  return (
                    <div
                      key={restaurant.id}
                      onClick={() => setSelectedRestaurant(restaurant)}
                      className="group block md:grid md:grid-cols-[minmax(220px,2fr)_minmax(140px,1.2fr)_minmax(160px,1.5fr)_110px_100px_48px] items-center gap-4 rounded-2xl md:rounded-none border border-white/10 md:border-0 bg-[#18181b] md:bg-transparent p-4 md:px-6 md:py-4 hover:border-white/20 hover:bg-white/[0.06] md:hover:bg-white/5 transition-all cursor-pointer active:scale-[0.99] md:active:scale-100 w-full min-w-0 max-w-full overflow-hidden box-border"
                    >
                      {/* Column 1: Merchant Identity & Status Badge (Mobile Top Row) */}
                      <div className="flex items-start md:items-center justify-between md:justify-start gap-2.5 md:gap-4 w-full min-w-0">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="h-12 w-12 shrink-0 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary relative overflow-hidden">
                            {restaurant.coverImageUrl ? (
                              <Image src={restaurant.coverImageUrl} alt={restaurant.name} fill className="object-cover" />
                            ) : restaurant.imageUrl ? (
                              <Image src={restaurant.imageUrl} alt={restaurant.name} fill className="object-cover" />
                            ) : (
                              <MaterialIcon name={typeConfig.icon} size="lg" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-white group-hover:text-primary transition-colors cursor-pointer truncate">
                              {restaurant.name}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-slate-300 font-medium inline-flex items-center gap-1 shrink-0">
                                <MaterialIcon name={typeConfig.icon} size="sm" />
                                {t(`merchantTypes.${merchantType}` as never)}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-primary font-semibold inline-flex items-center gap-1 shrink-0">
                                <MaterialIcon name="percent" size="sm" />
                                {restaurant.commissionRate ?? 5}%
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Mobile-only status badge pinned to top-right of card */}
                        <div className="shrink-0 md:hidden">
                          {getStatusBadge(restaurant.status)}
                        </div>
                      </div>

                      {/* Column 2: Cuisine / Budget */}
                      <div className="mt-2.5 md:mt-0 flex flex-col gap-1 min-w-0 w-full">
                        {restaurant.cuisineType && restaurant.cuisineType.length > 0 && (
                          <div className="text-xs text-slate-300 font-medium flex items-start gap-1.5 min-w-0 w-full">
                            <MaterialIcon name="restaurant" size="sm" className="text-slate-500 shrink-0 mt-0.5 md:hidden" />
                            <span className="line-clamp-2 md:line-clamp-1 break-words min-w-0 flex-1 leading-snug">
                              {restaurant.cuisineType.join(', ')}
                            </span>
                          </div>
                        )}
                        {typeof restaurant.avgPricePerPerson === 'number' && restaurant.avgPricePerPerson > 0 ? (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 min-w-0 w-full">
                            <MaterialIcon name="payments" size="sm" className="text-slate-500 shrink-0 md:hidden" />
                            <span className="truncate min-w-0">{t('adminBudgetPerPerson', { price: restaurant.avgPricePerPerson, currency: CURRENCY_CODE })}</span>
                          </div>
                        ) : null}
                      </div>

                      {/* Column 3: Location & Contact */}
                      <div className="mt-2 md:mt-0 flex flex-col gap-1 text-xs md:text-[11px] text-slate-400 min-w-0 w-full">
                        {restaurant.address && (
                          <div className="flex items-center gap-1.5 min-w-0 w-full">
                            <MaterialIcon name="location_on" size="sm" className="text-slate-500 shrink-0" />
                            <span className="truncate min-w-0 flex-1">{restaurant.address}</span>
                          </div>
                        )}
                        {restaurant.phone && (
                          <div className="flex items-center gap-1.5 min-w-0 w-full">
                            <MaterialIcon name="phone" size="sm" className="text-slate-500 shrink-0" />
                            <a
                              href={`tel:${restaurant.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-400 hover:text-primary transition-colors truncate min-w-0"
                              title={restaurant.phone}
                            >
                              {restaurant.phone}
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Column 4: Status (Desktop only) */}
                      <div className="hidden md:flex items-center min-w-0">
                        {getStatusBadge(restaurant.status)}
                      </div>

                      {/* Column 5: Date (Mobile Bottom Row with Details Hint) */}
                      <div className="mt-2.5 md:mt-0 pt-2.5 md:pt-0 border-t border-white/5 md:border-0 flex items-center justify-between md:justify-start text-[11px] font-medium text-slate-500 min-w-0 w-full">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <MaterialIcon name="calendar_today" size="sm" className="text-slate-500 md:hidden" />
                          <span>
                            {restaurant.createdAt instanceof Timestamp
                              ? restaurant.createdAt.toDate().toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR')
                              : new Date(restaurant.createdAt as unknown as Date).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR')}
                          </span>
                        </div>

                        {/* Mobile chevron with "Détails" label */}
                        <div className="flex items-center gap-1 text-slate-400 group-hover:text-primary transition-colors font-semibold text-xs md:hidden shrink-0">
                          <span>{t('adminThDetails')}</span>
                          <MaterialIcon name="chevron_right" size="sm" />
                        </div>
                      </div>

                      {/* Column 6: Desktop Details button */}
                      <div className="hidden md:flex items-center justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRestaurant(restaurant);
                          }}
                          className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-primary min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                          aria-label={`Détails du commerce ${restaurant.name}`}
                        >
                          <MaterialIcon name="chevron_right" size="md" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Restaurant Details Modal */}
      {selectedRestaurant && (
        <div className="fixed inset-0 z-50 flex items-center justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedRestaurant(null)}
          />

          <div className="relative h-full w-full max-w-2xl bg-[#0d0d0d] border-l border-white/10 overflow-y-auto animate-in slide-in-from-right duration-500">
            {/* Modal Header */}
            <div className="sticky top-0 z-50 bg-[#0d0d0d]/80 backdrop-blur-xl border-b border-white/5 p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] flex items-center justify-center text-black">
                  <MaterialIcon name={getMerchantTypeOption(selectedRestaurant.merchantType).icon} size="lg" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedRestaurant.name}</h2>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedRestaurant.status)}
                    <span className="text-[10px] text-slate-500 font-mono">{t('adminAccountVerification')}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedRestaurant(null)}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
                title={t('adminClose')}
              >
                <MaterialIcon name="cancel" size="lg" className="text-slate-400" />
              </button>
            </div>

            <div className="p-8 space-y-10">
              {/* Banner / Visual */}
              <div className="relative aspect-video rounded-3xl overflow-hidden border border-white/10 bg-white/5">
                {selectedRestaurant.coverImageUrl ? (
                  <Image src={selectedRestaurant.coverImageUrl} alt="Banner" fill className="object-cover" />
                ) : selectedRestaurant.imageUrl ? (
                  <Image src={selectedRestaurant.imageUrl} alt="Banner" fill className="object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                    <MaterialIcon name="store" size="xl" />
                  </div>
                )}
              </div>

              {/* Informative Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <MaterialIcon name="store" size="sm" /> {t('adminIdentity')}
                  </h3>
                  <div className="space-y-3 bg-white/[0.02] p-5 rounded-2xl border border-white/5">
                    <div>
                      <span className="block text-[10px] text-slate-500 uppercase mb-1">{t('adminMerchantType')}</span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary rounded-lg">
                        <MaterialIcon name={getMerchantTypeOption(selectedRestaurant.merchantType).icon} size="sm" />
                        {t(`merchantTypes.${selectedRestaurant.merchantType || 'restaurant'}` as never)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-500 uppercase mb-1">{t('adminFulfillmentModes')}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(selectedRestaurant.fulfillmentModes || ['delivery', 'pickup']).map(mode => (
                          <span key={mode} className="text-xs font-medium px-2 py-0.5 bg-white/5 border border-white/10 rounded-lg text-slate-300 inline-flex items-center gap-1">
                            <MaterialIcon name={mode === 'delivery' ? 'moped' : 'storefront'} size="sm" />
                            {mode === 'delivery' ? t('deliveryModeDelivery') : t('deliveryModePickup')}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-500 uppercase mb-1">{t('adminCuisines')}</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedRestaurant.cuisineType.map(c => (
                          <span key={c} className="text-xs font-semibold px-2 py-0.5 bg-white/5 border border-white/10 rounded-lg text-slate-300">{c}</span>
                        ))}
                      </div>
                    </div>
                    {typeof selectedRestaurant.avgPricePerPerson === 'number' && selectedRestaurant.avgPricePerPerson > 0 ? (
                      <div>
                        <span className="block text-[10px] text-slate-500 uppercase mb-1">{t('adminAvgBudget')}</span>
                        <p className="text-sm font-bold text-white">{selectedRestaurant.avgPricePerPerson} {CURRENCY_CODE} {t('adminPerPerson')}</p>
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <MaterialIcon name="location_on" size="sm" /> {t('adminContactLocation')}
                  </h3>
                  <div className="space-y-3 bg-white/[0.02] p-5 rounded-2xl border border-white/5">
                    <div className="flex items-start gap-2">
                      <MaterialIcon name="location_on" size="sm" className="text-primary mt-0.5" />
                      <p className="text-xs text-slate-300 leading-relaxed">{selectedRestaurant.address}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <MaterialIcon name="phone" size="sm" className="text-primary" />
                      <p className="text-xs text-slate-300">{selectedRestaurant.phone}</p>
                    </div>
                  </div>
                </section>
              </div>

              {/* Working Hours */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <MaterialIcon name="calendar_today" size="sm" /> {t('adminOpeningHours')}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {selectedRestaurant.openingHours && Object.entries(selectedRestaurant.openingHours).map(([day, hours]) => (
                    <div key={day} className={`p-3 rounded-xl border ${hours ? 'bg-primary/5 border-primary/10' : 'bg-white/[0.02] border-white/5'}`}>
                      <span className="block text-[10px] font-bold capitalize text-slate-500 mb-1">
                        {t(`days.${day.toLowerCase()}` as never) || day}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-300">
                        {hours ? `${hours.open} - ${hours.close}` : t('adminClosedDay')}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="pt-8 border-t border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                      <MaterialIcon name="percent" size="sm" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">{t('adminCommissionMedjira')}</h3>
                      <p className="text-xs text-slate-400">{t('adminCommissionNotice')}</p>
                    </div>
                  </div>
                  {commissionJustSaved && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 animate-in fade-in">
                      <MaterialIcon name="check_circle" size="sm" />
                      {t('adminCommissionUpdated')}
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end gap-4 p-5 bg-primary/5 rounded-2xl border border-primary/10">
                  <div className="flex-1 space-y-2">
                    <label htmlFor="restaurant-commission-rate" className="block text-xs font-semibold text-slate-300">
                      {t('adminCommissionRateField')}
                    </label>
                    <div className="relative">
                      <input
                        id="restaurant-commission-rate"
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={commissionRateDraft}
                        onChange={(event) => {
                          setCommissionRateDraft(event.target.value);
                          if (commissionJustSaved) setCommissionJustSaved(false);
                        }}
                        className="glass-input w-full p-3 pr-10 rounded-xl text-sm"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenCommissionConfirm}
                    disabled={!!processing}
                    className="h-12 px-5 bg-primary hover:bg-primary/90 text-black font-bold rounded-xl transition-all disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
                  >
                    {processing === selectedRestaurant.id ? t('adminSavingCommission') : t('adminSaveCommission')}
                  </button>
                </div>
              </section>

              {/* Actions Section */}
              {selectedRestaurant.status === 'pending_approval' && (
                <div className="pt-8 border-t border-white/10 space-y-6">
                  <div className="flex items-center gap-3">
                    <MaterialIcon name="verified_user" size="md" className="text-emerald-500" />
                    <h3 className="text-lg font-bold text-white">{t('adminValidationRequired')}</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                      <p className="text-xs text-emerald-400 mb-4 font-medium italic">
                        {t('adminApprovalNotice')}
                      </p>
                      <button
                        onClick={() => handleApproval(selectedRestaurant.id, true)}
                        disabled={!!processing}
                        className="w-full h-14 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-black font-bold uppercase tracking-wider rounded-2xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:opacity-50"
                      >
                        {processing === selectedRestaurant.id ? t('adminApprovingButton') : t('adminApproveButton')}
                      </button>
                    </div>

                    <div className="p-5 bg-rose-500/5 rounded-2xl border border-rose-500/10 space-y-4">
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder={t('adminRejectionPlaceholder')}
                        className="glass-input w-full p-3 rounded-xl text-sm min-h-[80px]"
                      />
                      <button
                        onClick={() => handleApproval(selectedRestaurant.id, false)}
                        disabled={!!processing || !rejectionReason.trim()}
                        className="w-full h-14 bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 border border-white/10 hover:border-rose-500/30 text-slate-400 font-bold uppercase tracking-wider rounded-2xl transition-all disabled:opacity-50"
                      >
                        {t('adminRejectButton')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Commission Rate Confirmation Modal */}
      {showCommissionConfirm && selectedRestaurant && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-commission-title"
        >
          <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-[#18181b] p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-primary/20 text-primary border border-primary/30 flex items-center justify-center shrink-0">
                <MaterialIcon name="percent" size="md" />
              </div>
              <div className="min-w-0">
                <h3 id="confirm-commission-title" className="text-base font-bold text-white">
                  {t('adminConfirmCommissionTitle')}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">
                  {selectedRestaurant.name}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{t('adminCommissionCurrentRate')}</span>
                <span className="font-semibold text-slate-300">{selectedRestaurant.commissionRate ?? 5} %</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-300 font-medium">{t('adminCommissionNewRate')}</span>
                <span className="font-bold text-primary text-base">{commissionRateDraft} %</span>
              </div>
              <div className="pt-2 border-t border-white/5 text-[11px] text-slate-400 leading-relaxed">
                {t('adminConfirmCommissionDetails')}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowCommissionConfirm(false)}
                disabled={processing === selectedRestaurant.id}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl text-xs font-semibold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors min-h-[44px] disabled:opacity-50"
              >
                {t('adminConfirmCommissionCancelBtn')}
              </button>
              <button
                type="button"
                onClick={() => handleCommissionRateSave(selectedRestaurant.id)}
                disabled={processing === selectedRestaurant.id}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl text-xs font-bold text-black bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing === selectedRestaurant.id ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>{t('adminSavingCommission')}</span>
                  </>
                ) : (
                  <span>{t('adminConfirmCommissionConfirmBtn')}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav items={adminNavItems} hidden={Boolean(selectedRestaurant)} />
    </div>
  );
}
