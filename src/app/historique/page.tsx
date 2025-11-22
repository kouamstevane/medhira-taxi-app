"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/config/firebase';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { onAuthStateChanged, User } from "firebase/auth";
import Link from 'next/link';

type FilterPeriod = 'today' | 'week' | 'month' | 'all';

export default function HistoriquePage() {
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterPeriod>('today');
  const router = useRouter();

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
            orderBy('createdAt', 'desc')
          )
        : query(
            collection(db, 'bookings'),
            where('userId', '==', userId),
            where('createdAt', '>=', Timestamp.fromDate(startDate)),
            orderBy('createdAt', 'desc')
          );

      // Requêtes pour parcels (livraisons)
      const parcelsQuery = period === 'all'
        ? query(
            collection(db, 'parcels'),
            where('senderId', '==', userId),
            orderBy('createdAt', 'desc')
          )
        : query(
            collection(db, 'parcels'),
            where('senderId', '==', userId),
            where('createdAt', '>=', Timestamp.fromDate(startDate)),
            orderBy('createdAt', 'desc')
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
      'pending': 'bg-yellow-100 text-yellow-800',
      'accepted': 'bg-blue-100 text-blue-800',
      'in_progress': 'bg-indigo-100 text-indigo-800',
      'completed': 'bg-green-100 text-green-800',
      'cancelled': 'bg-red-100 text-red-800',
      'failed': 'bg-red-100 text-red-800',
      'delivered': 'bg-green-100 text-green-800',
    };
    return colorMap[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-[#FFF9E6] p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center mb-6">
          <Link href="/dashboard" className="mr-4 p-2 rounded-full hover:bg-[#E8D9A5] transition">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#2E2307]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-[#2E2307]">Historique des commandes</h1>
        </div>

        {/* Filtres */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <p className="text-sm font-medium text-[#5A4A1A] mb-3">Période</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('today')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filter === 'today'
                  ? 'bg-[#FDBC01] text-[#2E2307] shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={() => setFilter('week')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filter === 'week'
                  ? 'bg-[#FDBC01] text-[#2E2307] shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              7 derniers jours
            </button>
            <button
              onClick={() => setFilter('month')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filter === 'month'
                  ? 'bg-[#FDBC01] text-[#2E2307] shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Ce mois-ci
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filter === 'all'
                  ? 'bg-[#FDBC01] text-[#2E2307] shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Tout
            </button>
          </div>
        </div>

        {/* Liste des commandes */}
        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FDBC01] mx-auto mb-4"></div>
            <p className="text-gray-600">Chargement de l&apos;historique...</p>
          </div>
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
                <div key={id} className="bg-white rounded-xl shadow-sm p-4 sm:p-6 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-[#FFF4D6] text-[#2E2307]">
                          {type}
                        </span>
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(status || 'pending')}`}>
                          {getStatusLabel(status || 'pending')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mb-1">
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
                      <p className="text-xl font-bold text-[#FDBC01]">{price?.toLocaleString('fr-FR')} FCFA</p>
                    </div>
                  </div>

                  {type === 'Taxi' && (
                    <div className="space-y-2 border-t pt-3">
                      <div className="flex items-start">
                        <span className="text-green-500 mr-2 mt-1">●</span>
                        <div>
                          <p className="text-xs text-gray-500">Départ</p>
                          <p className="font-medium text-gray-900">{pickup || 'Non spécifié'}</p>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <span className="text-red-500 mr-2 mt-1">●</span>
                        <div>
                          <p className="text-xs text-gray-500">Arrivée</p>
                          <p className="font-medium text-gray-900">{destination || 'Non spécifié'}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {type === 'Livraison' && (
                    <div className="border-t pt-3">
                      <p className="text-sm text-gray-600">{description || 'Aucune description'}</p>
                      {destination && (
                        <p className="text-sm text-gray-500 mt-1">
                          <span className="font-medium">Destination :</span> {destination}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 text-lg font-medium">Aucune commande trouvée</p>
            <p className="text-gray-400 text-sm mt-2">
              {filter === 'today' && "Vous n'avez passé aucune commande aujourd'hui"}
              {filter === 'week' && "Aucune commande dans les 7 derniers jours"}
              {filter === 'month' && "Aucune commande ce mois-ci"}
              {filter === 'all' && "Votre historique est vide"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
