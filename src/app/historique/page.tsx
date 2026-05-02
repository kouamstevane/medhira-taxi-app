"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/config/firebase';
import { collection, query, where, getDocs, orderBy, Timestamp, limit } from 'firebase/firestore';
import { onAuthStateChanged } from "firebase/auth";
import Link from 'next/link';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { GlassCard } from '@/components/ui/GlassCard';
import { BottomNav } from '@/components/ui/BottomNav';
import { downloadInvoiceFromBooking } from '@/services/invoice.service';
import { Booking } from '@/types/booking';
import { formatCurrencyWithCode } from '@/utils/format';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';

type FilterPeriod = 'today' | 'week' | 'month' | 'all';

const FILTER_OPTIONS: { value: FilterPeriod; label: string }[] = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: '7 derniers jours' },
  { value: 'month', label: 'Ce mois-ci' },
  { value: 'all', label: 'Tout' },
];

export default function HistoriquePage() {
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterPeriod>('today');
  const router = useRouter();
  const { showError, toasts, removeToast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchHistory(user.uid, filter);
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router, filter]);

  const fetchHistory = async (userId: string, period: FilterPeriod) => {
    setLoading(true);
    try {
      const now = new Date();
      let startDate: Date;

      // Calculer la date de début selon le filtre
      switch (period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'all':
        default:
          startDate = new Date(0); // Depuis le début
          break;
      }

      // Requêtes pour bookings (taxis)
      const bookingsQuery = period === 'all'
        ? query(
            collection(db, 'bookings'),
            where('userId', '==', userId),
            orderBy('createdAt', 'desc'),
            limit(50)
          )
        : query(
            collection(db, 'bookings'),
            where('userId', '==', userId),
            where('createdAt', '>=', Timestamp.fromDate(startDate)),
            orderBy('createdAt', 'desc'),
            limit(50)
          );

      // Requêtes pour parcels (livraisons)
      const parcelsQuery = period === 'all'
        ? query(
            collection(db, 'parcels'),
            where('senderId', '==', userId),
            orderBy('createdAt', 'desc'),
            limit(50)
          )
        : query(
            collection(db, 'parcels'),
            where('senderId', '==', userId),
            where('createdAt', '>=', Timestamp.fromDate(startDate)),
            orderBy('createdAt', 'desc'),
            limit(50)
          );

      const [bookingsSnapshot, parcelsSnapshot] = await Promise.all([
        getDocs(bookingsQuery),
        getDocs(parcelsQuery),
      ]);

      const bookings = bookingsSnapshot.docs.map(doc => ({
        id: doc.id,
        type: 'Taxi',
        ...doc.data()
      }));

      const parcels = parcelsSnapshot.docs.map(doc => ({
        id: doc.id,
        type: 'Livraison',
        ...doc.data()
      }));

      const combinedHistory = [...bookings, ...parcels].sort((a, b) => {
        const aCreatedAt = (a as Record<string, unknown>).createdAt as { toMillis?: () => number; seconds?: number } | undefined;
        const bCreatedAt = (b as Record<string, unknown>).createdAt as { toMillis?: () => number; seconds?: number } | undefined;
        const aTime = aCreatedAt?.toMillis ? aCreatedAt.toMillis() : (aCreatedAt?.seconds ? aCreatedAt.seconds * 1000 : 0);
        const bTime = bCreatedAt?.toMillis ? bCreatedAt.toMillis() : (bCreatedAt?.seconds ? bCreatedAt.seconds * 1000 : 0);
        return bTime - aTime;
      });

      setHistory(combinedHistory);
    } catch (error) {
      console.error("Erreur chargement historique:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      'pending': 'En attente',
      'accepted': 'Acceptée',
      'in_progress': 'En cours',
      'completed': 'Terminée',
      'cancelled': 'Annulée',
      'failed': 'Échouée',
      'delivered': 'Livrée',
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      'pending': 'bg-yellow-500/10 text-yellow-400',
      'accepted': 'bg-blue-500/10 text-blue-400',
      'in_progress': 'bg-indigo-500/10 text-indigo-400',
      'completed': 'bg-green-500/10 text-green-400',
      'cancelled': 'bg-red-500/10 text-red-400',
      'failed': 'bg-red-500/10 text-red-400',
      'delivered': 'bg-green-500/10 text-green-400',
    };
    return colorMap[status] || 'bg-slate-500/10 text-slate-400';
  };

  // Télécharger la facture d'une course
  const handleDownloadInvoice = async (item: Record<string, unknown>) => {
    try {
      // Convertir l'item en Booking pour la génération de facture
      const booking: Booking = {
        id: item.id as string,
        userId: item.userId as string || '',
        userEmail: item.userEmail as string | null,
        pickup: item.pickup as string || '',
        destination: item.destination as string || '',
        distance: item.distance as number || 0,
        duration: item.duration as number || 0,
        price: item.price as number || 0,
        finalPrice: item.finalPrice as number || item.price as number,
        carType: item.carType as string || 'Standard',
        status: item.status as 'completed',
        driverId: item.driverId as string,
        driverName: item.driverName as string,
        carModel: item.carModel as string,
        carPlate: item.carPlate as string,
        createdAt: item.createdAt as Timestamp,
        updatedAt: item.updatedAt as Timestamp,
        completedAt: item.completedAt as Timestamp,
        actualDuration: item.actualDuration as number,
      };

      await downloadInvoiceFromBooking(booking);
    } catch (error) {
      console.error('Erreur téléchargement facture:', error);
      showError('Erreur lors du téléchargement de la facture');
    }
  };

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="max-w-[430px] mx-auto px-4 pt-6 pb-28">
        {/* Header */}
        <div className="flex items-center mb-6">
          <Link href="/dashboard" className="mr-4 p-2 rounded-full hover:bg-white/5 transition">
            <MaterialIcon name="arrow_back" className="text-white" />
          </Link>
          <h1 className="text-2xl font-bold text-white">Historique des commandes</h1>
        </div>

        {/* Hero card */}
        <div className="relative overflow-hidden glass-card p-5 rounded-3xl border border-primary/20 mb-6">
          <div className="absolute -top-16 -right-16 w-48 h-48 bg-primary/25 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute -bottom-20 -left-10 w-40 h-40 bg-primary/10 blur-3xl rounded-full pointer-events-none" />

          <div className="relative flex items-center gap-3 mb-4">
            <div className="size-10 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center">
              <MaterialIcon name="history" className="text-primary" />
            </div>
            <div>
              <p className="text-white font-bold">Toutes vos courses</p>
              <p className="text-slate-400 text-xs">Filtrez par période ci-dessous</p>
            </div>
          </div>

          <div className="relative">
            <p className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">Période</p>
            <div className="flex flex-wrap gap-2">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={`px-4 py-2 rounded-xl font-medium transition-all text-sm ${
                    filter === opt.value
                      ? 'bg-primary/20 text-primary border border-primary/40'
                      : 'border border-white/10 text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Liste des commandes */}
        {loading ? (
          <GlassCard className="p-12 text-center">
            <MaterialIcon name="refresh" className="animate-spin text-primary text-[48px] mx-auto block mb-4" />
            <p className="text-slate-400">Chargement de l&apos;historique...</p>
          </GlassCard>
        ) : history.length > 0 ? (
          <div className="space-y-3">
            {history.map(item => {
              const createdAt = item.createdAt as { seconds?: number; toMillis?: () => number } | undefined;
              const timestamp = createdAt?.seconds ? createdAt.seconds * 1000 : (createdAt?.toMillis ? createdAt.toMillis() : Date.now());
              const destination = item.destination as string | undefined;
              const pickup = item.pickup as string | undefined;
              const description = item.description as string | undefined;
              const price = item.price as number | undefined;
              const status = item.status as string | undefined;
              const type = item.type as string | undefined;
              const id = item.id as string | undefined;

              return (
                <GlassCard key={id} className="p-4 sm:p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-primary/10 text-primary">
                          {type}
                        </span>
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(status || 'pending')}`}>
                          {getStatusLabel(status || 'pending')}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 mb-1">
                        {new Date(timestamp).toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })} à {new Date(timestamp).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-primary">{formatCurrencyWithCode(price || 0)}</p>
                    </div>
                  </div>

                  {type === 'Taxi' && (
                    <div className="space-y-2 border-t border-white/10 pt-3">
                      <div className="flex items-start">
                        <span className="text-green-400 mr-2 mt-1">●</span>
                        <div>
                          <p className="text-xs text-slate-500">Départ</p>
                          <p className="font-medium text-white">{pickup || 'Non spécifié'}</p>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <span className="text-red-400 mr-2 mt-1">●</span>
                        <div>
                          <p className="text-xs text-slate-500">Arrivée</p>
                          <p className="font-medium text-white">{destination || 'Non spécifié'}</p>
                        </div>
                      </div>

                      {/* Bouton télécharger facture - uniquement pour les courses terminées */}
                      {status === 'completed' && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <button
                            onClick={() => handleDownloadInvoice(item)}
                            className="flex items-center justify-center w-full px-4 py-2.5 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow transition-all hover:opacity-90 active:scale-[0.98]"
                          >
                            <MaterialIcon name="download" size="sm" className="mr-2" />
                            Télécharger la facture PDF
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {type === 'Livraison' && (
                    <div className="border-t border-white/10 pt-3">
                      <p className="text-sm text-slate-400">{description || 'Aucune description'}</p>
                      {(() => {
                        const dropoff = item.dropoffLocation as { address?: string } | undefined;
                        const dropoffAddr = dropoff?.address || destination;
                        return dropoffAddr ? (
                          <p className="text-sm text-slate-500 mt-1">
                            <span className="font-medium text-slate-300">Destination :</span> {dropoffAddr}
                          </p>
                        ) : null;
                      })()}
                      {status && status !== 'delivered' && status !== 'cancelled' && id && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <Link
                            href={`/client/parcel/${id}/tracking`}
                            className="flex items-center justify-center w-full px-4 py-2.5 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow transition-all hover:opacity-90 active:scale-[0.98]"
                          >
                            <MaterialIcon name="my_location" size="sm" className="mr-2" />
                            Suivre le colis
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </GlassCard>
              );
            })}
          </div>
        ) : (
          <GlassCard className="p-12 text-center">
            <MaterialIcon name="assignment" className="text-slate-500 text-[64px] mx-auto block mb-4" />
            <p className="text-white text-lg font-medium">Aucune commande trouvée</p>
            <p className="text-slate-500 text-sm mt-2">
              {filter === 'today' && "Vous n'avez passé aucune commande aujourd'hui"}
              {filter === 'week' && "Aucune commande dans les 7 derniers jours"}
              {filter === 'month' && "Aucune commande ce mois-ci"}
              {filter === 'all' && "Votre historique est vide"}
            </p>
          </GlassCard>
        )}
      </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </>
  );
}
