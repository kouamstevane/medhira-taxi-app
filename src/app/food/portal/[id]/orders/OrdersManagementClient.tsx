"use client";

import { useState, useEffect } from 'react';
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
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import type { Restaurant, FoodOrder } from '@/types';
import { formatCurrencyWithCode } from '@/utils/format';
import { BottomNav, portalNavItems } from '@/components/ui/BottomNav';
import { ConversationLauncher } from '@/components/ConversationLauncher';
import type { ConversationContext } from '@/types/conversation';
import { getRestaurantPortalPath } from '../../restaurant-portal-paths';
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
            setLoading(false);
          },
          () => {
            showError("Erreur lors du chargement des commandes");
            setLoading(false);
          },
        );
      } catch (error) {
        console.error("Error loading orders:", error);
        showError("Erreur lors du chargement des commandes");
        setLoading(false);
      }
    });

    return () => {
      unsubscribeOrders?.();
      unsubscribe();
    };
  }, [id, router, showError]);

  const loadHistoryPage = async (reset = false, dateKey = selectedHistoryDate) => {
    if (!id || historyLoading) return;

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
      showError("Erreur lors du chargement de l'historique");
    } finally {
      setHistoryLoading(false);
    }
  };

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
      showSuccess(`Commande mise à jour : ${getRestaurantOrderStatusLabel(status)}`);
      return true;
    } catch {
      showError("Erreur lors de la mise à jour");
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
          <button onClick={() => router.push(getRestaurantPortalPath(id))} className="p-2 hover:bg-white/10 rounded-full transition">
            <MaterialIcon name="arrow_back" size="lg" className="text-slate-300" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Commandes</h1>
            <p className="text-xs text-slate-500">
              {viewMode === 'history' ? `${historyOrders.length}${historyHasMore ? '+' : ''} commandes chargées` : `${orders.length} commandes en cours`}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 sm:p-8">
        <section className="mb-6 space-y-3" aria-label="Filtrer les commandes par statut">
          <div role="tablist" aria-label="Vue des commandes" className="flex gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-1">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'active'}
              onClick={openActiveOrders}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${viewMode === 'active' ? 'bg-primary text-[#1a1305]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              En cours <span className="ml-1 text-xs opacity-75">{orders.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'history'}
              onClick={openHistory}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${viewMode === 'history' ? 'bg-primary text-[#1a1305]' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              Historique <span className="ml-1 text-xs opacity-75">{historyOrders.length}{historyHasMore ? '+' : ''}</span>
            </button>
           </div>
          {viewMode === 'history' && (
            <div className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Historique du jour</p>
                <p className="mt-0.5 text-xs text-slate-400">Sélectionnez une date pour retrouver les commandes terminées.</p>
              </div>
              <input
                aria-label="Date de l'historique"
                type="date"
                value={selectedHistoryDate}
                max={getRestaurantHistoryDateKey()}
                onClick={(event) => openRestaurantHistoryDatePicker(event.currentTarget)}
                onChange={(event) => changeHistoryDate(event.target.value)}
                disabled={historyLoading}
                className="h-10 cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-slate-100 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-wait disabled:opacity-60"
                style={{ colorScheme: 'dark' }}
              />
            </div>
          )}
          <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <div role="group" aria-label="Filtrer par étape" className="flex min-w-max gap-2">
            {visibleFilterGroups.map((group) => (
              <button
                key={group}
                type="button"
                aria-pressed={filterGroup === group}
                aria-label={`${getRestaurantOrderFilterGroupLabel(group)} (${getRestaurantOrderFilterCount(orderStatuses, group)})`}
                onClick={() => {
                  setFilterGroup(group);
                }}
                className={getRestaurantOrderFilterClassName(filterGroup === group)}
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
            {filteredOrders.length} commande{filteredOrders.length !== 1 ? 's' : ''} affichée{filteredOrders.length !== 1 ? 's' : ''}
          </p>
          <p className="hidden text-xs text-slate-500 sm:block">Filtre : {activeFilterLabel}</p>
        </div>

        <div className="space-y-3">
          {viewMode === 'history' && historyLoading && historyOrders.length === 0 && (
            <div className="py-16 text-center text-sm text-slate-400">Chargement de l'historique…</div>
          )}

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
                        <h3 className="break-words text-sm font-bold text-white sm:text-base">Commande #{order.id.slice(-5).toUpperCase()}</h3>
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
                    <p className="text-[11px] text-slate-500">Total</p>
                    <p className="text-sm font-bold text-primary">{formatCurrencyWithCode(order.totalOrderPrice)}</p>
                  </div>
                </header>

                {(order.status === 'confirmed' || order.status === 'accepted' || order.status === 'preparing' || RESTAURANT_REJECTABLE_STATUSES.includes(order.status)) && (
                  <div className="flex flex-col gap-2 bg-primary/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Prochaine action</p>
                      <p className="mt-0.5 text-xs text-slate-300">Faites progresser cette commande ou refusez-la.</p>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
                      {order.status === 'confirmed' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'accepted')}
                          className="h-9 flex-1 rounded-lg bg-primary px-3 text-xs font-bold text-white sm:h-10 sm:flex-none sm:px-4 sm:text-sm"
                        >
                          <span className="sm:hidden">Accepter</span>
                          <span className="hidden sm:inline">Accepter la commande</span>
                        </button>
                      )}
                      {order.status === 'accepted' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'preparing')}
                          className="h-9 flex-1 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 text-xs font-bold text-blue-400 transition hover:bg-blue-500/20 sm:h-10 sm:flex-none sm:px-4 sm:text-sm"
                        >
                          Préparer
                        </button>
                      )}
                      {order.status === 'preparing' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'ready')}
                          className="h-9 flex-1 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 text-xs font-bold text-blue-400 transition hover:bg-blue-500/20 sm:h-10 sm:flex-none sm:px-4 sm:text-sm"
                        >
                          Marquer prête
                        </button>
                      )}
                      {RESTAURANT_REJECTABLE_STATUSES.includes(order.status) && (
                        <button
                          onClick={() => setRejectionOrder(order)}
                          className="h-9 flex-1 rounded-lg border border-destructive/20 bg-destructive/10 px-3 text-xs font-bold text-destructive transition hover:bg-destructive/20 sm:h-10 sm:flex-none sm:px-4 sm:text-sm"
                        >
                          Refuser
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
                    className="flex w-full items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-left text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    <span>{order.orderItems.length} {order.orderItems.length > 1 ? 'articles' : 'article'} · Voir les détails</span>
                    <MaterialIcon name={expandedOrderIds.has(order.id) ? 'expand_less' : 'expand_more'} size="md" className="shrink-0 text-primary" />
                  </button>
                </div>

                <div
                  id={`order-${order.id}-details`}
                  className={`${getRestaurantOrderDetailsClassName(expandedOrderIds.has(order.id))} bg-white/[0.02] p-3 md:p-4`}
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
                  <section aria-labelledby={`order-${order.id}-items`} className="min-w-0">
                    <h4 id={`order-${order.id}-items`} className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Articles</h4>
                    <div className="space-y-1.5">
                      {order.orderItems.map((item, idx) => (
                        <div key={idx} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 p-2.5">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{item.itemQuantity}</span>
                            <span className="break-words text-sm font-medium text-slate-300">{item.itemName}</span>
                          </div>
                          <span className="shrink-0 text-xs font-bold text-slate-300">{formatCurrencyWithCode(item.itemPrice * item.itemQuantity)}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <aside className="mt-2 space-y-2 pt-0 md:mt-0 md:border-l md:pl-5">
                    <section aria-labelledby={`order-${order.id}-client`}>
                      <h4 id={`order-${order.id}-client`} className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Client</h4>
                      {order.pickupCode && (
                        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-2">
                          <span className="text-[10px] font-bold uppercase text-primary">Code retrait</span>
                          <span className="font-mono text-base font-bold tracking-[0.2em] text-white">{order.pickupCode}</span>
                        </div>
                      )}
                      <div className="rounded-lg bg-white/5 p-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400">
                              <MaterialIcon name="person" size="md" />
                            </div>
                            <div className="min-w-0">
                              <p className="break-words text-sm font-semibold text-white">{order.customerName || 'Client'}</p>
                            </div>
                          </div>
                          {currentUserUid && restaurant && (
                            <ConversationLauncher
                              className="shrink-0"
                              context={{
                                type: 'food',
                                entityId: order.id,
                                participantA: { uid: currentUserUid, name: restaurant.name, role: 'restaurant' },
                                participantB: { uid: order.userId, name: order.customerName || 'Client', role: 'client' },
                              } as ConversationContext}
                              currentUserUid={currentUserUid}
                              variant="icon-only"
                            />
                          )}
                        </div>
                      </div>
                    </section>

                    <section aria-labelledby={`order-${order.id}-delivery`}>
                      <h4 id={`order-${order.id}-delivery`} className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Livraison</h4>
                      <div className="rounded-lg border border-white/5 bg-white/5 p-2">
                        <p className="break-words text-xs text-slate-300">{order.deliveryAddress}</p>
                      </div>
                    </section>

                    {currentUserUid && restaurant && order.driverId && (
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-white/5 p-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Livreur</p>
                          <p className="truncate text-xs text-slate-300">{order.driverName || 'Livreur'}</p>
                        </div>
                        <ConversationLauncher
                          context={{
                            type: 'food',
                            entityId: order.id,
                            participantA: { uid: currentUserUid, name: restaurant.name, role: 'restaurant' },
                            participantB: { uid: order.driverId, name: order.driverName || 'Livreur', role: 'livreur' },
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
              className="mx-auto block rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-primary/40 hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
            >
              {historyLoading ? 'Chargement…' : 'Charger 25 autres commandes'}
            </button>
          )}

          {filteredOrders.length === 0 && !historyLoading && (
            <div className="py-20 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
                <MaterialIcon name="shopping_bag" size="xl" className="text-slate-500" />
              </div>
              <p className="text-slate-400">Aucune commande dans « {activeFilterLabel} ».</p>
            </div>
          )}
        </div>
      </main>
      {id && <BottomNav items={portalNavItems(id)} />}
    </div>
  );
}
