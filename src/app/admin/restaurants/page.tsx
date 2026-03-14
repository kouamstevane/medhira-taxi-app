'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Search, 
  Filter as FilterIcon,
  Store,
  ChevronRight,
  ShieldCheck,
  FileText,
  MapPin,
  Phone,
  Mail,
  Calendar
} from 'lucide-react';
import Image from 'next/image';
import { toast } from 'react-hot-toast';
import { doc, getDoc, query, collection, where, getDocs, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/config/firebase';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { Restaurant } from '@/types/food-delivery';
import AdminHeader from '@/components/admin/AdminHeader';

const RestaurantSkeleton = () => (
  <div className="space-y-4 animate-pulse p-4">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gray-100" />
          <div className="space-y-2">
            <div className="h-4 w-48 bg-gray-100 rounded" />
            <div className="h-3 w-32 bg-gray-100 rounded" />
          </div>
        </div>
        <div className="h-4 w-24 bg-gray-100 rounded" />
        <div className="h-8 w-8 bg-gray-100 rounded-lg" />
      </div>
    ))}
  </div>
);

export default function AdminRestaurantsPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending_approval' | 'approved' | 'rejected' | 'all'>('pending_approval');
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const router = useRouter();

  // Admin Check
  useEffect(() => {
    const checkAdmin = async () => {
      const user = auth.currentUser;
      if (!user) {
        setIsAdmin(false);
        router.push('/login');
        return;
      }

      try {
        const adminDoc = await getDoc(doc(db, 'admins', user.uid));
        if (adminDoc.exists()) {
          setIsAdmin(true);
        } else {
          // Fallback check
          const adminQuery = query(
            collection(db, 'admins'),
            where('userId', '==', user.uid)
          );
          const adminSnapshot = await getDocs(adminQuery);
          
          if (!adminSnapshot.empty) {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
            router.push('/dashboard');
          }
        }
      } catch (err) {
        console.error('Error checking admin status:', err);
        setIsAdmin(false);
        setError('Erreur de vérification des droits administrateur');
      }
    };

    checkAdmin();
  }, [router]);

  // Fetch Restaurants
  useEffect(() => {
    if (isAdmin !== true) return;

    const fetchRestaurants = async () => {
      setLoading(true);
      setError(null);
      try {
        // We use pending_approval by default as requested by the flow
        const result = await FoodDeliveryService.getPendingRestaurants(50);
        setRestaurants(result);
      } catch (err: any) {
        console.error('Error fetching restaurants:', err);
        // Special handling for missing index error
        if (err.message?.includes('index')) {
          setError('Erreur d\'index Firestore. Veuillez déployer les index avec "firebase deploy --only firestore:indexes".');
        } else {
          setError('Impossible de charger les restaurants. Vérifiez votre connexion.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRestaurants();
  }, [isAdmin]);

  const handleApproval = async (restaurantId: string, approve: boolean) => {
    if (!auth.currentUser) {
      toast.error('Session expirée. Veuillez vous reconnecter.');
      return;
    }

    setProcessing(restaurantId);
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const action = approve ? 'approve' : 'reject';
      
      const response = await fetch('/api/admin/manage-restaurant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action,
          restaurantId,
          adminUid: auth.currentUser.uid,
          reason: !approve ? rejectionReason : undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la mise à jour');
      }

      toast.success(approve ? 'Restaurant approuvé !' : 'Restaurant refusé.');
      
      // Mettre à jour l'état local pour retirer le restaurant traité de la liste
      setRestaurants(prev => prev.filter(r => r.id !== restaurantId));
      setSelectedRestaurant(null);
      setRejectionReason('');
    } catch (err: any) {
      console.error('Error updating restaurant status:', err);
      toast.error(err.message || 'Erreur lors de la mise à jour du statut.');
    } finally {
      setProcessing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string, style: string }> = {
      pending_approval: { label: 'En attente', style: 'bg-amber-50 text-amber-600 border-amber-200' },
      approved: { label: 'Actif', style: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
      rejected: { label: 'Refusé', style: 'bg-rose-50 text-rose-600 border-rose-200' },
      suspended: { label: 'Suspendu', style: 'bg-orange-50 text-orange-600 border-orange-200' },
    };

    const config = configs[status] || { label: status, style: 'bg-gray-50 text-gray-500 border-gray-200' };

    return (
      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${config.style}`}>
        {config.label}
      </span>
    );
  };

  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  if (isAdmin === false) return null;

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900">
      <AdminHeader 
        title="Validation Restaurants" 
        subtitle="Gérez les demandes d'adhésion des restaurateurs" 
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {(['pending_approval', 'approved', 'rejected', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                // In a real app, we'd trigger a new fetch here or filter locally
              }}
              className={`relative overflow-hidden group p-4 rounded-2xl border transition-all duration-300 shadow-sm ${
                filter === f
                  ? 'bg-amber-50 border-amber-200 shadow-amber-500/10'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold capitalize ${filter === f ? 'text-amber-600' : 'text-gray-600'}`}>
                  {f === 'all' ? 'Tous' : f === 'pending_approval' ? 'En attente' : f === 'approved' ? 'Actifs' : 'Refusés'}
                </span>
                <div className={`p-2 rounded-lg ${filter === f ? 'bg-amber-500 text-white shadow-sm' : 'bg-gray-100 text-gray-500'}`}>
                  {f === 'all' ? <Store className="w-4 h-4" /> : f === 'pending_approval' ? <Clock className="w-4 h-4" /> : f === 'approved' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                </div>
              </div>
              {filter === f && <div className="absolute bottom-0 left-0 h-1 w-full bg-amber-500" />}
            </button>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl flex items-center gap-3 mb-6 animate-in fade-in slide-in-from-top-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Content Table */}
        <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
          {loading ? (
            <RestaurantSkeleton />
          ) : restaurants.length === 0 ? (
            <div className="py-24 text-center">
              <div className="inline-flex p-4 rounded-full bg-gray-50 mb-4 text-gray-400">
                <Store className="w-12 h-12" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Aucune demande en attente</h3>
              <p className="text-gray-500 text-sm mt-1 max-w-xs mx-auto">
                Tous les restaurants ont été traités. Revenez plus tard !
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest">Restaurant</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest">Type / Budget</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest">Localisation</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest">Statut</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest">Date Création</th>
                    <th className="px-6 py-4 text-right text-[11px] font-bold text-gray-500 uppercase tracking-widest">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {restaurants.map((restaurant) => (
                    <tr key={restaurant.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 relative overflow-hidden">
                            {restaurant.coverImageUrl ? (
                              <Image src={restaurant.coverImageUrl} alt={restaurant.name} fill className="object-cover" />
                            ) : restaurant.imageUrl ? (
                              <Image src={restaurant.imageUrl} alt={restaurant.name} fill className="object-cover" />
                            ) : (
                              <Store className="w-6 h-6" />
                            )}
                          </div>
                          <div>
                            <div 
                              className="text-sm font-bold text-gray-900 group-hover:text-amber-600 transition-colors cursor-pointer"
                              onClick={() => setSelectedRestaurant(restaurant)}
                            >
                              {restaurant.name}
                            </div>
                            <div className="text-[11px] text-gray-500 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-500" />
                              ID: {restaurant.ownerId.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-xs text-gray-700 font-medium">
                          {restaurant.cuisineType.slice(0, 2).join(', ')}
                          {restaurant.cuisineType.length > 2 && '...'}
                        </div>
                        <div className="text-[11px] text-gray-500">Budget: {restaurant.avgPricePerPerson}€/pers</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                          <MapPin className="w-3 h-3 text-gray-400" />
                          <span className="truncate max-w-[150px]">{restaurant.address}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(restaurant.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-[11px] font-medium text-gray-500">
                        {restaurant.createdAt instanceof Timestamp
                          ? restaurant.createdAt.toDate().toLocaleDateString('fr-FR')
                          : new Date((restaurant.createdAt as any)).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => setSelectedRestaurant(restaurant)}
                          className="p-2 hover:bg-amber-50 rounded-xl transition-colors text-gray-400 hover:text-amber-600"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Restaurant Details Modal */}
      {selectedRestaurant && (
        <div className="fixed inset-0 z-50 flex items-center justify-end">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
            onClick={() => setSelectedRestaurant(null)}
          />
          
          <div className="relative h-full w-full max-w-2xl bg-white border-l border-gray-200 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
            {/* Modal Header */}
            <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-amber-500 flex items-center justify-center text-white shadow-lg">
                  <Store className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedRestaurant.name}</h2>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedRestaurant.status)}
                    <span className="text-[10px] text-gray-400 font-mono">Vérification de compte</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedRestaurant(null)}
                className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors"
                title="Fermer"
              >
                <XCircle className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            <div className="p-8 space-y-10">
              {/* Banner / Visual */}
              <div className="relative aspect-video rounded-3xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50">
                {selectedRestaurant.coverImageUrl ? (
                  <Image src={selectedRestaurant.coverImageUrl} alt="Banner" fill className="object-cover" />
                ) : selectedRestaurant.imageUrl ? (
                  <Image src={selectedRestaurant.imageUrl} alt="Banner" fill className="object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                    <Store className="w-16 h-16" />
                  </div>
                )}
              </div>

              {/* Informative Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Store className="w-3.5 h-3.5" /> Identité
                  </h3>
                  <div className="space-y-3 bg-gray-50/50 p-5 rounded-2xl border border-gray-100">
                    <div>
                      <span className="block text-[10px] text-gray-500 uppercase mb-1">Cuisines</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedRestaurant.cuisineType.map(c => (
                          <span key={c} className="text-xs font-semibold px-2 py-0.5 bg-white border border-gray-200 rounded-lg">{c}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[10px] text-gray-500 uppercase mb-1">Budget Moyen</span>
                      <p className="text-sm font-bold text-gray-900">{selectedRestaurant.avgPricePerPerson}€ / Personne</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5" /> Contact & Localisation
                  </h3>
                  <div className="space-y-3 bg-gray-50/50 p-5 rounded-2xl border border-gray-100">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-amber-500 mt-0.5" />
                      <p className="text-xs text-gray-700 leading-relaxed">{selectedRestaurant.address}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-amber-500" />
                      <p className="text-xs text-gray-700">{selectedRestaurant.phone}</p>
                    </div>
                  </div>
                </section>
              </div>

              {/* Working Hours */}
              <section className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" /> Horaires d'Ouverture
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {selectedRestaurant.openingHours && Object.entries(selectedRestaurant.openingHours).map(([day, hours]) => (
                    <div key={day} className={`p-3 rounded-xl border ${hours ? 'bg-amber-50/30 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
                      <span className="block text-[10px] font-bold capitalize text-gray-500 mb-1">{day}</span>
                      <span className="text-[11px] font-semibold">
                        {hours ? `${hours.open} - ${hours.close}` : 'Fermé'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Actions Section */}
              {selectedRestaurant.status === 'pending_approval' && (
                <div className="pt-8 border-t border-gray-100 space-y-6">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    <h3 className="text-lg font-bold text-gray-900">Validation Requise</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
                      <p className="text-xs text-emerald-700 mb-4 font-medium italic">
                        L'approbation rendra le restaurant visible par tous les passagers.
                      </p>
                      <button
                        onClick={() => handleApproval(selectedRestaurant.id, true)}
                        disabled={!!processing}
                        className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wider rounded-2xl transition-all shadow-lg disabled:opacity-50"
                      >
                        {processing === selectedRestaurant.id ? 'Traitement...' : 'Approuver'}
                      </button>
                    </div>

                    <div className="p-5 bg-rose-50 rounded-2xl border border-rose-100 space-y-4">
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Motif du refus..."
                        className="w-full p-3 bg-white border border-rose-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 transition-all min-h-[80px]"
                      />
                      <button
                        onClick={() => handleApproval(selectedRestaurant.id, false)}
                        disabled={!!processing || !rejectionReason.trim()}
                        className="w-full h-14 bg-rose-600 hover:bg-rose-700 text-white font-bold uppercase tracking-wider rounded-2xl transition-all shadow-lg disabled:opacity-50"
                      >
                        Refuser
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
