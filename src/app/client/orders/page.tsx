'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/config/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { GlassCard } from '@/components/ui/GlassCard';
import { BottomNav } from '@/components/ui/BottomNav';
import { formatCurrencyWithCode } from '@/utils/format';
import { FIRESTORE_COLLECTIONS } from '@/types/firestore-collections';

type OrderType = 'all' | 'taxi' | 'food' | 'parcel';

interface UnifiedOrder {
  id: string;
  type: 'taxi' | 'food' | 'parcel';
  status: string;
  price: number;
  createdAt: Timestamp | null;
  title: string;
  subtitle: string;
  destination?: string;
}

const TAB_OPTIONS: { value: OrderType; label: string; icon: string }[] = [
  { value: 'all', label: 'Tout', icon: 'grid_view' },
  { value: 'taxi', label: 'Taxi', icon: 'local_taxi' },
  { value: 'food', label: 'Repas', icon: 'restaurant' },
  { value: 'parcel', label: 'Livraison', icon: 'inventory_2' },
];

const getStatusLabel = (status: string): string => {
  const statusMap: Record<string, string> = {
    pending: 'En attente',
    pending_payment: 'En attente',
    confirmed: 'Confirmée',
    accepted: 'Acceptée',
    in_progress: 'En cours',
    preparing: 'En préparation',
    ready: 'Prête',
    picked_up: 'Récupérée',
    driver_heading_to_restaurant: 'Chauffeur en route',
    driver_arrived_restaurant: 'Chauffeur arrivé',
    out_for_delivery: 'En livraison',
    arriving: 'Arrivée',
    delivering: 'En livraison',
    delivered: 'Livrée',
    completed: 'Terminée',
    cancelled: 'Annulée',
    cancelled_by_restaurant: 'Annulée',
    failed: 'Échouée',
    no_driver_available: 'Aucun chauffeur',
  };
  return statusMap[status] || status;
};

const getStatusColor = (status: string): string => {
  const colorMap: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-400',
    pending_payment: 'bg-yellow-500/10 text-yellow-400',
    confirmed: 'bg-blue-500/10 text-blue-400',
    accepted: 'bg-blue-500/10 text-blue-400',
    in_progress: 'bg-indigo-500/10 text-indigo-400',
    preparing: 'bg-orange-500/10 text-orange-400',
    ready: 'bg-teal-500/10 text-teal-400',
    picked_up: 'bg-cyan-500/10 text-cyan-400',
    driver_heading_to_restaurant: 'bg-indigo-500/10 text-indigo-400',
    driver_arrived_restaurant: 'bg-indigo-500/10 text-indigo-400',
    out_for_delivery: 'bg-purple-500/10 text-purple-400',
    arriving: 'bg-purple-500/10 text-purple-400',
    delivering: 'bg-purple-500/10 text-purple-400',
    delivered: 'bg-green-500/10 text-green-400',
    completed: 'bg-green-500/10 text-green-400',
    cancelled: 'bg-red-500/10 text-red-400',
    cancelled_by_restaurant: 'bg-red-500/10 text-red-400',
    failed: 'bg-red-500/10 text-red-400',
    no_driver_available: 'bg-slate-500/10 text-slate-400',
  };
  return colorMap[status] || 'bg-slate-500/10 text-slate-400';
};

const getTypeIcon = (type: 'taxi' | 'food' | 'parcel'): string => {
  const iconMap = { taxi: 'local_taxi', food: 'restaurant', parcel: 'inventory_2' };
  return iconMap[type];
};

const getTypeBadgeColor = (type: 'taxi' | 'food' | 'parcel'): string => {
  const colorMap = {
    taxi: 'bg-primary/10 text-primary',
    food: 'bg-orange-500/10 text-orange-400',
    parcel: 'bg-purple-500/10 text-purple-400',
  };
  return colorMap[type];
};

const getTypeLabel = (type: 'taxi' | 'food' | 'parcel'): string => {
  const labelMap = { taxi: 'Taxi', food: 'Repas', parcel: 'Livraison' };
  return labelMap[type];
};

const getOrderDetailPath = (order: UnifiedOrder): string => {
  switch (order.type) {
    case 'taxi':
      return `/client/order/${order.id}/tracking`;
    case 'food':
      return `/food/orders/${order.id}`;
    case 'parcel':
      return `/client/parcel/${order.id}/tracking`;
    default:
      return '#';
  }
};

export default function ClientOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OrderType>('all');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchOrders = useCallback(async (uid: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const [bookingsSnapshot, foodSnapshot, parcelsSnapshot] = await Promise.all([
        getDocs(
          query(
            collection(db, FIRESTORE_COLLECTIONS.BOOKINGS),
            where('userId', '==', uid),
            orderBy('createdAt', 'desc'),
            limit(50),
          ),
        ),
        getDocs(
          query(
            collection(db, FIRESTORE_COLLECTIONS.FOOD_ORDERS),
            where('userId', '==', uid),
            orderBy('createdAt', 'desc'),
            limit(50),
          ),
        ),
        getDocs(
          query(
            collection(db, FIRESTORE_COLLECTIONS.PARCELS),
            where('senderId', '==', uid),
            orderBy('createdAt', 'desc'),
            limit(50),
          ),
        ),
      ]);

      const taxiOrders: UnifiedOrder[] = bookingsSnapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          type: 'taxi' as const,
          status: data.status || 'pending',
          price: data.price || data.finalPrice || 0,
          createdAt: data.createdAt || null,
          title: data.pickup || 'Course taxi',
          subtitle: data.destination || '',
          destination: data.destination,
        };
      });

      const foodOrders: UnifiedOrder[] = foodSnapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          type: 'food' as const,
          status: data.status || 'pending',
          price: data.totalOrderPrice || 0,
          createdAt: data.createdAt || null,
          title: data.restaurantName || 'Commande repas',
          subtitle: data.orderItems
            ? (data.orderItems as Array<{ itemQuantity: number; itemName: string }>)
                .map((i) => `${i.itemQuantity}x ${i.itemName}`)
                .join(', ')
            : '',
          destination: data.deliveryAddress,
        };
      });

      const parcelOrders: UnifiedOrder[] = parcelsSnapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          type: 'parcel' as const,
          status: data.status || 'pending',
          price: data.price || 0,
          createdAt: data.createdAt || null,
          title: data.description || 'Livraison colis',
          subtitle: data.dropoffLocation?.address || data.destination || '',
          destination: data.dropoffLocation?.address || data.destination,
        };
      });

      const combined = [...taxiOrders, ...foodOrders, ...parcelOrders].sort((a, b) => {
        const aMs = a.createdAt
          ? 'toMillis' in a.createdAt && typeof a.createdAt.toMillis === 'function'
            ? a.createdAt.toMillis()
            : (a.createdAt as unknown as { seconds?: number }).seconds
              ? (a.createdAt as unknown as { seconds: number }).seconds * 1000
              : 0
          : 0;
        const bMs = b.createdAt
          ? 'toMillis' in b.createdAt && typeof b.createdAt.toMillis === 'function'
            ? b.createdAt.toMillis()
            : (b.createdAt as unknown as { seconds?: number }).seconds
              ? (b.createdAt as unknown as { seconds: number }).seconds * 1000
              : 0
          : 0;
        return bMs - aMs;
      });

      setOrders(combined);
    } catch (error) {
      console.error('Erreur chargement commandes:', error);
      setFetchError('Impossible de charger vos commandes. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) {
      fetchOrders(userId);
    }
  }, [userId, fetchOrders]);

  const filteredOrders =
    activeTab === 'all' ? orders : orders.filter((o) => o.type === activeTab);

  const formatDate = (ts: Timestamp | null): string => {
    if (!ts) return '';
    const date =
      typeof ts === 'object' && 'toDate' in ts && typeof ts.toDate === 'function'
        ? ts.toDate()
        : new Date(ts as unknown as string | number);
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="max-w-[430px] mx-auto pb-28">
        <div className="bg-background/80 backdrop-blur-xl border-b border-white/5 p-4 sticky top-0 z-20 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 -ml-2 text-white bg-white/5 rounded-full hover:bg-white/10 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <MaterialIcon name="arrow_back" size="lg" />
          </button>
          <h1 className="text-xl font-bold text-white">Mes Commandes</h1>
          <div className="w-10" />
        </div>

        <div className="p-4">
          <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all text-sm whitespace-nowrap min-h-[44px] ${
                  activeTab === tab.value
                    ? 'bg-gradient-to-r from-primary to-[#ffae33] text-white primary-glow'
                    : 'glass-card border border-white/10 text-slate-300 hover:bg-white/5'
                }`}
              >
                <MaterialIcon name={tab.icon} size="sm" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 space-y-3">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <GlassCard key={i} className="p-5 animate-pulse">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="h-5 bg-white/5 rounded w-3/4 mb-2" />
                      <div className="h-4 bg-white/5 rounded w-1/2" />
                    </div>
                    <div className="h-6 bg-white/5 rounded-full w-16" />
                  </div>
                  <div className="border-t border-white/5 my-3" />
                  <div className="flex justify-between">
                    <div className="h-4 bg-white/5 rounded w-2/3" />
                    <div className="h-4 bg-white/5 rounded w-16" />
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : fetchError ? (
            <GlassCard className="p-10 text-center border border-red-500/20 mt-4">
              <div className="flex justify-center mb-6">
                <div className="bg-red-500/10 p-5 rounded-full">
                  <MaterialIcon name="error_outline" size="xl" className="text-red-400" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Erreur de chargement</h3>
              <p className="text-slate-400 text-sm mb-6">{fetchError}</p>
              <button
                onClick={() => userId && fetchOrders(userId)}
                className="bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold px-6 py-3 rounded-xl min-h-[44px]"
              >
                Réessayer
              </button>
            </GlassCard>
          ) : filteredOrders.length === 0 ? (
            <GlassCard className="p-10 text-center border border-white/5 mt-4">
              <div className="flex justify-center mb-6">
                <div className="bg-primary/10 p-5 rounded-full">
                  <MaterialIcon name="receipt_long" size="xl" className="text-primary" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Aucune commande</h3>
              <p className="text-slate-400 text-sm mb-6">
                {activeTab === 'all'
                  ? 'Vous n\'avez pas encore passé de commande.'
                  : `Aucune commande ${getTypeLabel(activeTab as 'taxi' | 'food' | 'parcel').toLowerCase()}.`}
              </p>
              <button
                onClick={() => router.push('/dashboard')}
                className="bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold px-6 py-3 rounded-xl min-h-[44px]"
              >
                Retour à l&apos;accueil
              </button>
            </GlassCard>
          ) : (
            filteredOrders.map((order) => (
              <GlassCard
                key={`${order.type}-${order.id}`}
                onClick={() => router.push(getOrderDetailPath(order))}
                className="p-5 cursor-pointer hover:bg-white/5 transition-all active:scale-[0.98]"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className={`px-2.5 py-1 text-xs font-semibold rounded-full flex items-center gap-1 ${getTypeBadgeColor(order.type)}`}
                      >
                        <MaterialIcon name={getTypeIcon(order.type)} size="sm" />
                        {getTypeLabel(order.type)}
                      </span>
                      <span
                        className={`px-2.5 py-1 text-xs font-medium rounded-full ${getStatusColor(order.status)}`}
                      >
                        {getStatusLabel(order.status)}
                      </span>
                    </div>
                    <h3 className="font-bold text-white text-base truncate">{order.title}</h3>
                    <p className="text-xs text-slate-500 mt-1">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className="text-lg font-bold text-primary">
                      {formatCurrencyWithCode(order.price)}
                    </span>
                    <MaterialIcon name="chevron_right" size="sm" className="text-slate-500" />
                  </div>
                </div>

                {order.subtitle && (
                  <>
                    <div className="border-t border-white/5 my-3" />
                    <p className="text-sm text-slate-400 truncate">{order.subtitle}</p>
                  </>
                )}
              </GlassCard>
            ))
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
