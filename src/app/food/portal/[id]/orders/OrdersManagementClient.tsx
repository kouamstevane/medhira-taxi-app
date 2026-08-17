"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { FoodDeliveryService } from '@/services/food-delivery.service';
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
import {
  getRestaurantOrderFilterClassName,
  getRestaurantOrderFilterGroupLabel,
  getRestaurantOrderFilterStatusSet,
  getRestaurantOrderStatusLabel,
  RESTAURANT_ORDER_FILTER_GROUPS,
  RESTAURANT_ORDER_FILTERS,
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
  const [filterGroup, setFilterGroup] = useState<RestaurantOrderFilterGroup>('all');
  const [exactStatus, setExactStatus] = useState<FoodOrder['status'] | ''>('');
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(null);

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
        unsubscribeOrders = FoodDeliveryService.subscribeRestaurantOrders(
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

  const updateOrderStatus = async (orderId: string, status: FoodOrder['status']) => {
    try {
      await FoodDeliveryService.updateFoodOrderStatus(orderId, status);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
      showSuccess(`Commande mise à jour : ${status}`);
    } catch {
      showError("Erreur lors de la mise à jour");
    }
  };

  const activeStatuses = exactStatus
    ? [exactStatus]
    : getRestaurantOrderFilterStatusSet(filterGroup);

  const filteredOrders = activeStatuses === null
    ? orders
    : orders.filter((order) => activeStatuses.includes(order.status));

  const activeFilterLabel = exactStatus
    ? getRestaurantOrderStatusLabel(exactStatus)
    : getRestaurantOrderFilterGroupLabel(filterGroup);

  if (loading || !id) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <LoadingSpinner />
    </div>
  );

  const getStatusColor = (status: FoodOrder['status']) => {
    switch (status) {
      case 'pending': return 'bg-orange-500/10 text-orange-400';
      case 'confirmed': return 'bg-green-500/10 text-green-400';
      case 'preparing': return 'bg-blue-500/10 text-blue-400';
      case 'ready': return 'bg-purple-500/10 text-purple-400';
      case 'delivering': return 'bg-indigo-500/10 text-indigo-400';
      case 'delivered': return 'bg-emerald-500/10 text-emerald-400';
      case 'cancelled': return 'bg-destructive/10 text-destructive';
      default: return 'bg-white/5 text-slate-400';
    }
  };

  const getStatusIcon = (status: FoodOrder['status']) => {
    switch (status) {
      case 'pending': return 'schedule';
      case 'confirmed': return 'check_circle';
      case 'preparing': return 'shopping_bag';
      case 'ready': return 'check_circle';
      case 'picked_up': return 'directions_car';
      case 'delivering': return 'delivery_dining';
      case 'delivered': return 'check_circle';
      case 'cancelled': return 'cancel';
      default: return 'schedule';
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <header className="bg-background/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-20 px-4 py-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push(getRestaurantPortalPath(id))} className="p-2 hover:bg-white/10 rounded-full transition">
            <MaterialIcon name="arrow_back" size="lg" className="text-slate-300" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Commandes</h1>
            <p className="text-xs text-slate-500">{orders.length} commandes au total</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 sm:p-8">
        <section className="mb-6 space-y-3" aria-label="Filtrer les commandes par statut">
          <div role="group" aria-label="Filtrer par étape" className="flex flex-wrap gap-2">
            {RESTAURANT_ORDER_FILTER_GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                aria-pressed={!exactStatus && filterGroup === group}
                onClick={() => {
                  setExactStatus('');
                  setFilterGroup(group);
                }}
                className={getRestaurantOrderFilterClassName(!exactStatus && filterGroup === group)}
              >
                {getRestaurantOrderFilterGroupLabel(group)}
              </button>
            ))}
          </div>
          <label className="flex w-full items-center gap-3 text-sm text-slate-400 sm:max-w-xs">
            <span className="shrink-0">Statut précis</span>
            <select
              aria-label="Statut précis"
              value={exactStatus}
              onChange={(event) => {
                const status = event.target.value as FoodOrder['status'] | '';
                setExactStatus(status);
                if (!status) setFilterGroup('all');
              }}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Tous les statuts</option>
              {RESTAURANT_ORDER_FILTERS.filter((status) => status !== 'all').map((status) => (
                <option key={status} value={status}>
                  {getRestaurantOrderStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
        </section>

        <div className="space-y-4">
          {[...filteredOrders]
            .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
            .map((order) => (
              <article key={order.id} className="glass-card overflow-hidden rounded-2xl border border-white/10 transition hover:border-white/20">
                <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 p-4 sm:p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${getStatusColor(order.status)}`}>
                      <MaterialIcon name={getStatusIcon(order.status)} size="md" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words font-bold text-white">Commande #{order.id.slice(-5).toUpperCase()}</h3>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${getStatusColor(order.status)}`}>
                          {getRestaurantOrderStatusLabel(order.status)}
                        </span>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                        <MaterialIcon name="schedule" size="sm" /> {order.createdAt.toDate().toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <p className="text-xs text-slate-500">Total</p>
                    <p className="font-bold text-primary">{formatCurrencyWithCode(order.totalOrderPrice)}</p>
                  </div>
                </header>

                {(order.status === 'confirmed' || order.status === 'accepted' || order.status === 'preparing' || RESTAURANT_REJECTABLE_STATUSES.includes(order.status)) && (
                  <div className="flex flex-col gap-3 border-b border-white/10 bg-primary/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prochaine action</p>
                      <p className="mt-1 text-sm text-slate-300">Faites progresser cette commande ou refusez-la.</p>
                    </div>
                    <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                      {order.status === 'confirmed' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'accepted')}
                          className="h-10 w-full rounded-xl bg-primary px-4 text-sm font-bold text-white sm:w-auto"
                        >
                          Accepter la commande
                        </button>
                      )}
                      {order.status === 'accepted' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'preparing')}
                          className="h-10 w-full rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 text-sm font-bold text-blue-400 transition hover:bg-blue-500/20 sm:w-auto"
                        >
                          Préparer
                        </button>
                      )}
                      {order.status === 'preparing' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'ready')}
                          className="h-10 w-full rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 text-sm font-bold text-blue-400 transition hover:bg-blue-500/20 sm:w-auto"
                        >
                          Marquer comme prête
                        </button>
                      )}
                      {RESTAURANT_REJECTABLE_STATUSES.includes(order.status) && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'cancelled_by_restaurant')}
                          className="h-10 w-full rounded-xl border border-destructive/20 bg-destructive/10 px-4 text-sm font-bold text-destructive transition hover:bg-destructive/20 sm:w-auto"
                        >
                          Refuser
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 bg-white/[0.02] p-4 md:grid-cols-[minmax(0,1fr)_18rem] md:p-5">
                  <section aria-labelledby={`order-${order.id}-items`} className="min-w-0">
                    <h4 id={`order-${order.id}-items`} className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Articles</h4>
                    <div className="space-y-2">
                      {order.orderItems.map((item, idx) => (
                        <div key={idx} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/5 p-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{item.itemQuantity}</span>
                            <span className="break-words text-sm font-medium text-slate-300">{item.itemName}</span>
                          </div>
                          <span className="shrink-0 text-xs font-bold text-slate-400">{formatCurrencyWithCode(item.itemPrice * item.itemQuantity)}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <aside className="space-y-4 border-t border-white/10 pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                    <section aria-labelledby={`order-${order.id}-client`}>
                      <h4 id={`order-${order.id}-client`} className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Client</h4>
                      {order.pickupCode && (
                        <div className="mb-4 rounded-xl border border-primary/20 bg-primary/10 p-3">
                          <p className="mb-1 text-[10px] font-bold uppercase text-primary">Code retrait</p>
                          <p className="font-mono text-2xl font-bold tracking-widest text-white">{order.pickupCode}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400">
                          <MaterialIcon name="person" size="md" />
                        </div>
                        <div className="min-w-0">
                          <p className="break-words text-sm font-bold text-white">Client ID: {order.userId.slice(0, 8)}</p>
                          <p className="text-xs text-primary">Voir les coordonnées</p>
                        </div>
                      </div>
                    </section>

                    <section aria-labelledby={`order-${order.id}-delivery`}>
                      <h4 id={`order-${order.id}-delivery`} className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">Livraison</h4>
                      <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                        <p className="break-words text-xs text-slate-300">{order.deliveryAddress}</p>
                      </div>
                    </section>

                    {currentUserUid && restaurant && (
                      <div className="space-y-3">
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Contacter le client</p>
                          <ConversationLauncher
                            context={{
                              type: 'food',
                              entityId: order.id,
                              participantA: { uid: currentUserUid, name: restaurant.name, role: 'restaurant' },
                              participantB: { uid: order.userId, name: order.customerName || 'Client', role: 'client' },
                            } as ConversationContext}
                            currentUserUid={currentUserUid}
                            variant="icon-label"
                          />
                        </div>
                        {order.driverId && (
                          <div>
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Contacter le livreur</p>
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
                      </div>
                    )}
                  </aside>
                </div>
              </article>
            ))}

          {filteredOrders.length === 0 && (
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
