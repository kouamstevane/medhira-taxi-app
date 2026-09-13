"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import {
  FoodDeliveryService,
  getRestaurantOrderHistoryPage,
  subscribeRestaurantActiveOrders,
  type RestaurantOrderHistoryPage,
} from '@/services/food-delivery.service';
import { auth } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { NetworkErrorView } from '@/components/ui';
import { isFirestoreNetworkError } from '@/utils/firestore-error-handler';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import type { Restaurant, FoodOrder } from '@/types';
import { formatCurrencyWithCode } from '@/utils/format';
import { BottomNav, portalNavItems } from '@/components/ui/BottomNav';
import { ConversationLauncher } from '@/components/ConversationLauncher';
import type { ConversationContext } from '@/types/conversation';
import { getRestaurantPortalPath } from '../../restaurant-portal-paths';
import { useTranslation } from '@/hooks/useTranslation';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import { OrderRejectionDialog } from './OrderRejectionDialog';
import {
  getRestaurantOrderFilterClassName,
  getRestaurantOrderFilterCount,
  getRestaurantOrderFilterGroupLabel,
  getRestaurantOrderFilterStatusSet,
  getRestaurantOrderDetailsClassName,
  getRestaurantOrderStatusLabel,
  getRestaurantOrderStatusTone,
  getRestaurantHistoryDateKey,
  openRestaurantHistoryDatePicker,
  RESTAURANT_ORDER_FILTER_GROUPS,
  RESTAURANT_REJECTABLE_STATUSES,
  type RestaurantOrderFilterGroup,
} from './orderStatusUi';

export default function OrdersManagementClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('restaurantId')?.trim() || null;
  const { showError, showSuccess, toasts, removeToast } = useToast();
  const { t } = useTranslation('restaurant');
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active');
  const [historyOrders, setHistoryOrders] = useState<FoodOrder[]>([]);
  const [historyCursor, setHistoryCursor] = useState<RestaurantOrderHistoryPage['nextCursor']>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(() => getRestaurantHistoryDateKey());
  const [filterGroup, setFilterGroup] = useState<RestaurantOrderFilterGroup>('all');
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);
  const [rejectionOrder, setRejectionOrder] = useState<FoodOrder | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!id) {
      router.replace('/restaurant/dashboard');
    }
  }, [id, router]);

  useEffect(() => {
    if (!id) return;
    let unsubscribeOrders: (() => void) | undefined;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribeOrders?.();
      unsubscribeOrders = undefined;
      if (!user) {
        router.push('/login');
        return;
      }

      setIsNetworkError(false);
      setLoading(true);

      try {
        const res = await FoodDeliveryService.getRestaurantById(id);
        if (!res || res.ownerId !== user.uid) {
          router.push('/dashboard');
          return;
        }
        setRestaurant(res);
        setCurrentUserUid(user.uid);
        unsubscribeOrders = subscribeRestaurantActiveOrders(
          id,
          (items) => {
            setOrders(items);
            setIsNetworkError(false);
            setLoading(false);
          },
          (err) => {
            console.error("Error loading orders:", err);
            if (
              isFirestoreNetworkError(err) ||
              (err as Error)?.message?.toLowerCase().includes('offline') ||
              (typeof navigator !== 'undefined' && !navigator.onLine)
            ) {
              setIsNetworkError(true);
            }
            showError(t('ordersLoadError'));
            setLoading(false);
          },
        );
      } catch (error) {
        console.error("Error loading orders:", error);
        if (
          isFirestoreNetworkError(error) ||
          (error as Error)?.message?.toLowerCase().includes('offline') ||
          (typeof navigator !== 'undefined' && !navigator.onLine)
        ) {
          setIsNetworkError(true);
        }
        showError(t('ordersLoadError'));
        setLoading(false);
      }
    });

    return () => {
      unsubscribeOrders?.();
      unsubscribe();
    };
  }, [id, router, showError, refreshKey, t]);

  const loadHistoryPage = async (reset = false, dateKey = selectedHistoryDate) => {
    if (!id || historyLoading) return;

    setIsNetworkError(false);
    setHistoryLoading(true);
    try {
      const page = await getRestaurantOrderHistoryPage(id, {
        dateKey,
        cursor: reset ? null : historyCursor,
        pageSize: 25,
      });
      setHistoryOrders((currentOrders) => reset ? page.orders : [...currentOrders, ...page.orders]);
      setHistoryCursor(page.nextCursor);
      setHistoryHasMore(page.hasMore);
      setHistoryLoaded(true);
    } catch (error) {
      console.error('Error loading restaurant order history:', error);
      if (
        isFirestoreNetworkError(error) ||
        (error as Error)?.message?.toLowerCase().includes('offline') ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      ) {
        setIsNetworkError(true);
      }
      showError(t('historyLoadError'));
    } finally {
      setHistoryLoading(false);
    }
  };

  const recharger = useCallback(() => {
    setIsNetworkError(false);
    setLoading(true);
    if (viewMode === 'history') {
      void loadHistoryPage(true);
    }
    setRefreshKey((k) => k + 1);
  }, [viewMode]);

  const openHistory = () => {
    setViewMode('history');
    setFilterGroup('all');
    if (!historyLoaded) void loadHistoryPage(true);
  };

  const openActiveOrders = () => {
    setViewMode('active');
    setFilterGroup('all');
  };

  const changeHistoryDate = (dateKey: string) => {
    if (!dateKey || dateKey === selectedHistoryDate) return;

    setSelectedHistoryDate(dateKey);
    setViewMode('history');
    setFilterGroup('all');
    setHistoryOrders([]);
    setHistoryCursor(null);
    setHistoryHasMore(false);
    setHistoryLoaded(false);
    void loadHistoryPage(true, dateKey);
  };

  const updateOrderStatus = async (orderId: string, status: FoodOrder['status']): Promise<boolean> => {
    try {
      await FoodDeliveryService.updateFoodOrderStatus(orderId, status);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
      showSuccess(t('orderUpdatedSuccess', { status: getRestaurantOrderStatusLabel(status) }));
      return true;
    } catch {
      showError(t('updateError'));
      return false;
    }
  };

  const confirmOrderRejection = async () => {
    if (!rejectionOrder || isRejecting) return;

    setIsRejecting(true);
    const rejected = await updateOrderStatus(rejectionOrder.id, 'cancelled_by_restaurant');
    if (rejected) setRejectionOrder(null);
    setIsRejecting(false);
  };

  const toggleOrderDetails = (orderId: string) => {
    setExpandedOrderIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(orderId)) {
        nextIds.delete(orderId);
      } else {
        nextIds.add(orderId);
      }
      return nextIds;
    });
  };

  const visibleOrders = viewMode === 'history' ? historyOrders : orders;
  const activeStatuses = getRestaurantOrderFilterStatusSet(filterGroup);

  const filteredOrders = activeStatuses === null
    ? visibleOrders
    : visibleOrders.filter((order) => activeStatuses.includes(order.status));

  const activeFilterLabel = getRestaurantOrderFilterGroupLabel(filterGroup);

  if (isNetworkError && !restaurant) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="bg-background/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-20 px-4 py-4 sm:px-8 flex items-center justify-between">
          <button
            onClick={() => router.push(id ? getRestaurantPortalPath(id) : '/restaurant/dashboard')}
            className="p-2 hover:bg-white/10 rounded-full transition min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={t('back')}
          >
            <MaterialIcon name="arrow_back" size="lg" className="text-slate-300" />
          </button>
          <h1 className="text-xl font-bold text-white">{t('ordersTitle')}</h1>
          <LanguageSelector variant="compact" />
        </header>
        <div className="flex-1 flex items-center justify-center p-4">
          <NetworkErrorView
            message={t('networkErrorRestoInfo')}
            onRetry={recharger}
          />
        </div>
      </div>
    );
  }

  if (loading || !id) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <LoadingSpinner />
    </div>
  );

  const orderStatuses = visibleOrders.map((order) => order.status);
  const visibleFilterGroups = RESTAURANT_ORDER_FILTER_GROUPS.filter((group) => (
    viewMode === 'history'
      ? group === 'all' || group === 'completed'
      : group !== 'completed'
  ));

  return (
    <div className="min-h-screen bg-background pb-20">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {rejectionOrder && (
        <OrderRejectionDialog
          order={rejectionOrder}
          onCancel={() => setRejectionOrder(null)}
          onConfirm={() => void confirmOrderRejection()}
          isProcessing={isRejecting}
        />
      )}

      <header className="bg-background/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-20 px-4 py-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(getRestaurantPortalPath(id))}
            className="p-2 hover:bg-white/10 rounded-full transition min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={t('back')}
          >
            <MaterialIcon name="arrow_back" size="lg" className="text-slate-300" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">{t('ordersTitle')}</h1>
            <p className="text-xs text-slate-500">
              {viewMode === 'history'
                ? t('ordersLoaded', { count: historyOrders.length, hasMore: historyHasMore ? '+' : '' })
                : t('ordersInProgress', { count: orders.length })}
            </p>
          </div>
        </div>
        <LanguageSelector variant="compact" />
      </header>

      <main className="mx-auto max-w-5xl p-4 sm:p-8">
        <section className="mb-6 space-y-3" aria-label={t('filterOrdersByStatus')}>
          <div role="tablist" aria-label={t('viewOrdersRole')} className="flex gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-1">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'active'}
              onClick={openActiveOrders}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition min-h-[44px] flex items-center justify-center ${viewMode === 'active' ? 'bg-primary text-[#1a1305]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              {t('activeOrdersTab')} <span className="ml-1 text-xs opacity-75">{orders.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'history'}
              onClick={openHistory}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition min-h-[44px] flex items-center justify-center ${viewMode === 'history' ? 'bg-primary text-[#1a1305]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              {t('historyOrdersTab')} <span className="ml-1 text-xs opacity-75">{historyOrders.length}{historyHasMore ? '+' : ''}</span>
            </button>
          </div>
          {viewMode === 'history' && (
            <div className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('todayHistory')}</p>
                <p className="mt-0.5 text-xs text-slate-400">{t('todayHistoryDesc')}</p>
              </div>
              <input
                aria-label={t('historyDate')}
                type="date"
                value={selectedHistoryDate}
                max={getRestaurantHistoryDateKey()}
                onClick={(event) => openRestaurantHistoryDatePicker(event.currentTarget)}
                onChange={(event) => changeHistoryDate(event.target.value)}
                disabled={historyLoading}
                className="h-10 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-slate-100 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-wait disabled:opacity-60 min-h-[44px]"
                style={{ colorScheme: 'dark' }}
              />
            </div>
          )}
          <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <div role="group" aria-label={t('filterByStage')} className="flex min-w-max gap-2">
              {visibleFilterGroups.map((group) => (
                <button
                  key={group}
                  type="button"
                  aria-pressed={filterGroup === group}
                  aria-label={`${getRestaurantOrderFilterGroupLabel(group)} (${getRestaurantOrderFilterCount(orderStatuses, group)})`}
                  onClick={() => {
                    setFilterGroup(group);
                  }}
                  className={`${getRestaurantOrderFilterClassName(filterGroup === group)} min-h-[44px] flex items-center`}
                >
                  <span>{getRestaurantOrderFilterGroupLabel(group)}</span>
                  <span className="ml-1.5 rounded-full bg-black/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
                    {getRestaurantOrderFilterCount(orderStatuses, group)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="mb-3 flex items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm font-semibold text-slate-300">
            {t('ordersDisplayed', {
              count: filteredOrders.length,
              plural: filteredOrders.length !== 1 ? 's' : '',
            })}
          </p>
          <p className="hidden text-xs text-slate-500 sm:block">
            {t('filterActiveLabel', { label: activeFilterLabel })}
          </p>
        </div>

        <div className="space-y-3">
          {viewMode === 'history' && historyLoading && historyOrders.length === 0 && (
            <div className="py-16 text-center text-sm text-slate-400">{t('historyLoadingState')}</div>
          )}

          {isNetworkError && (viewMode === 'active' ? orders.length === 0 : historyOrders.length === 0) ? (
            <div className="py-12">
              <NetworkErrorView
                message={t('ordersNetworkError')}
                onRetry={recharger}
              />
            </div>
          ) : (
            <>
              {[...filteredOrders]
                .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
                .map((order) => (
                  <article key={order.id} className="glass-card overflow-hidden rounded-xl border border-white/10 transition hover:border-white/20">
                    <header className="flex flex-wrap items-start justify-between gap-3 p-3 sm:p-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${getRestaurantOrderStatusTone(order.status).colorClassName}`}>
                          <MaterialIcon name={getRestaurantOrderStatusTone(order.status).icon} size="md" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="break-words text-sm font-bold text-white sm:text-base">
                              {t('orderTitleNum', { id: order.id.slice(-5).toUpperCase() })}
                            </h3>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getRestaurantOrderStatusTone(order.status).colorClassName}`}>
                              {getRestaurantOrderStatusLabel(order.status)}
                            </span>
                          </div>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                            <MaterialIcon name="schedule" size="sm" /> {order.createdAt.toDate().toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-left sm:text-right">
                        <p className="text-[11px] text-slate-500">{t('total')}</p>
                        <p className="text-sm font-bold text-primary">{formatCurrencyWithCode(order.totalOrderPrice)}</p>
                      </div>
                    </header>

                    {(order.status === 'confirmed' || order.status === 'accepted' || order.status === 'preparing' || RESTAURANT_REJECTABLE_STATUSES.includes(order.status)) && (
                      <div className="flex flex-col gap-2 bg-primary/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('nextAction')}</p>
                          <p className="mt-0.5 text-xs text-slate-300">{t('nextActionDesc')}</p>
                        </div>
                        <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
                          {order.status === 'confirmed' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'accepted')}
                              className="h-11 min-h-[44px] flex-1 rounded-lg bg-primary px-3 text-xs font-bold text-white sm:flex-none sm:px-4 sm:text-sm"
                            >
                              <span className="sm:hidden">{t('accept')}</span>
                              <span className="hidden sm:inline">{t('acceptOrder')}</span>
                            </button>
                          )}
                          {order.status === 'accepted' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'preparing')}
                              className="h-11 min-h-[44px] flex-1 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 text-xs font-bold text-blue-400 transition hover:bg-blue-500/20 sm:flex-none sm:px-4 sm:text-sm"
                            >
                              {t('prepare')}
                            </button>
                          )}
                          {order.status === 'preparing' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'ready')}
                              className="h-11 min-h-[44px] flex-1 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 text-xs font-bold text-blue-400 transition hover:bg-blue-500/20 sm:flex-none sm:px-4 sm:text-sm"
                            >
                              {t('markReady')}
                            </button>
                          )}
                          {RESTAURANT_REJECTABLE_STATUSES.includes(order.status) && (
                            <button
                              onClick={() => setRejectionOrder(order)}
                              className="h-11 min-h-[44px] flex-1 rounded-lg border border-destructive/20 bg-destructive/10 px-3 text-xs font-bold text-destructive transition hover:bg-destructive/20 sm:flex-none sm:px-4 sm:text-sm"
                            >
                              {t('refuseOrder')}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="p-2 lg:hidden">
                      <button
                        type="button"
                        aria-expanded={expandedOrderIds.has(order.id)}
                        aria-controls={`order-${order.id}-details`}
                        onClick={() => toggleOrderDetails(order.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-left text-xs font-semibold text-slate-200 transition hover:bg-white/10 min-h-[44px]"
                      >
                        <span>
                          {t('viewDetailsItems', {
                            count: order.orderItems.length,
                            items: order.orderItems.length > 1 ? t('articlePlural') : t('articleSingular'),
                          })}
                        </span>
                        <MaterialIcon name={expandedOrderIds.has(order.id) ? 'expand_less' : 'expand_more'} size="md" className="shrink-0 text-primary" />
                      </button>
                    </div>

                    <div
                      id={`order-${order.id}-details`}
                      className={`${getRestaurantOrderDetailsClassName(expandedOrderIds.has(order.id))} bg-white/[0.02] p-3 md:p-4`}
                    >
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
                        <div>
                          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{t('orderedItems')}</h4>
                          <div className="divide-y divide-white/5 rounded-lg border border-white/5 bg-white/5">
                            {order.orderItems.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2.5 text-xs sm:text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/20 text-xs font-bold text-primary">
                                    {item.itemQuantity}x
                                  </span>
                                  <span className="font-medium text-white">{item.itemName}</span>
                                </div>
                                <span className="font-bold text-slate-300">
                                  {formatCurrencyWithCode(item.itemPrice * item.itemQuantity)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <aside className="space-y-3 border-t border-white/5 pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
                          <div>
                            <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('client')}</h4>
                            <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/5 p-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                  <MaterialIcon name="person" size="sm" />
                                </div>
                                <div className="min-w-0">
                                  <p className="break-words text-sm font-semibold text-white">{order.customerName || t('client')}</p>
                                </div>
                              </div>
                              {currentUserUid && restaurant && (
                                <ConversationLauncher
                                  className="shrink-0"
                                  context={{
                                    type: 'food',
                                    entityId: order.id,
                                    participantA: { uid: currentUserUid, name: restaurant.name, role: 'restaurant' },
                                    participantB: { uid: order.userId, name: order.customerName || t('client'), role: 'client' },
                                  } as ConversationContext}
                                  currentUserUid={currentUserUid}
                                  variant="icon-only"
                                />
                              )}
                            </div>
                          </div>

                          <section aria-labelledby={`order-${order.id}-delivery`}>
                            <h4 id={`order-${order.id}-delivery`} className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('deliveryTitle')}</h4>
                            <div className="rounded-lg border border-white/5 bg-white/5 p-2">
                              <p className="break-words text-xs text-slate-300">{order.deliveryAddress}</p>
                            </div>
                          </section>

                          {currentUserUid && restaurant && order.driverId && (
                            <div className="flex items-center justify-between gap-2 rounded-lg bg-white/5 p-2">
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('driver')}</p>
                                <p className="truncate text-xs text-slate-300">{order.driverName || t('driver')}</p>
                              </div>
                              <ConversationLauncher
                                context={{
                                  type: 'food',
                                  entityId: order.id,
                                  participantA: { uid: currentUserUid, name: restaurant.name, role: 'restaurant' },
                                  participantB: { uid: order.driverId, name: order.driverName || t('driver'), role: 'livreur' },
                                } as ConversationContext}
                                currentUserUid={currentUserUid}
                                variant="icon-label"
                              />
                            </div>
                          )}
                        </aside>
                      </div>
                    </div>
                  </article>
                ))}

              {viewMode === 'history' && historyHasMore && historyOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => void loadHistoryPage()}
                  disabled={historyLoading}
                  className="mx-auto block rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-primary/40 hover:bg-white/10 disabled:cursor-wait disabled:opacity-60 min-h-[44px]"
                >
                  {historyLoading ? t('loadingMore') : t('loadMoreOrdersCount')}
                </button>
              )}

              {filteredOrders.length === 0 && !historyLoading && (
                <div className="py-20 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
                    <MaterialIcon name="shopping_bag" size="xl" className="text-slate-500" />
                  </div>
                  <p className="text-slate-400">
                    {t('noOrdersInFilter', { filter: activeFilterLabel })}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      {id && <BottomNav items={portalNavItems(id)} />}
    </div>
  );
}
