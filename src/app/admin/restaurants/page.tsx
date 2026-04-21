'use client';

import React, { useState, useEffect } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import Image from 'next/image';
import { toast } from 'react-hot-toast';
import { Timestamp, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '@/config/firebase';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { Restaurant } from '@/types/food-delivery';
import AdminHeader from '@/components/admin/AdminHeader';
import { BottomNav, adminNavItems } from '@/components/ui/BottomNav';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AdminRestaurants');

const RestaurantSkeleton = () => (
  <div className="space-y-4 animate-pulse p-4">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-white/10" />
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
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending_approval' | 'approved' | 'rejected' | 'all'>('pending_approval');
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = useAdminAuth();

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
          setError('Erreur d\'index Firestore. Veuillez déployer les index avec "firebase deploy --only firestore:indexes".');
        } else {
          setError('Impossible de charger les restaurants. Vérifiez votre connexion.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRestaurants();
  }, [isAdmin, filter]);

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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour du statut.';
      logger.error('Mise à jour statut restaurant', err instanceof Error ? err : new Error(String(err)));
      toast.error(message);
    } finally {
      setProcessing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string, style: string }> = {
      pending_approval: { label: 'En attente', style: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
      approved: { label: 'Actif', style: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
      rejected: { label: 'Refusé', style: 'bg-rose-500/10 text-rose-500 border-rose-500/20' },
      suspended: { label: 'Suspendu', style: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
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

  return (
    <div className="min-h-screen bg-background text-white">
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
              className={`relative overflow-hidden group p-4 rounded-2xl border transition-all duration-300 ${
                filter === f
                  ? 'bg-primary/10 border-primary/30'
                  : 'glass-card border-white/5 hover:border-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold capitalize ${filter === f ? 'text-primary' : 'text-slate-400'}`}>
                  {f === 'all' ? 'Tous' : f === 'pending_approval' ? 'En attente' : f === 'approved' ? 'Actifs' : 'Refusés'}
                </span>
                <div className={`p-2 rounded-lg ${filter === f ? 'bg-primary text-black' : 'bg-white/5 text-slate-400'}`}>
                  {f === 'all' ? <MaterialIcon name="store" size="sm" /> : f === 'pending_approval' ? <MaterialIcon name="schedule" size="sm" /> : f === 'approved' ? <MaterialIcon name="check_circle" size="sm" /> : <MaterialIcon name="cancel" size="sm" />}
                </div>
              </div>
              {filter === f && <div className="absolute bottom-0 left-0 h-1 w-full bg-primary" />}
            </button>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex items-center gap-3 mb-6 animate-in fade-in slide-in-from-top-2">
            <MaterialIcon name="warning" size="md" className="shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Content Table */}
        <div className="glass-card border border-white/5 rounded-3xl overflow-hidden">
          {loading ? (
            <RestaurantSkeleton />
          ) : restaurants.length === 0 ? (
            <div className="py-24 text-center">
              <div className="inline-flex p-4 rounded-full bg-white/5 mb-4 text-slate-500">
                <MaterialIcon name="store" size="xl" />
              </div>
              <h3 className="text-lg font-semibold text-white">Aucune demande en attente</h3>
              <p className="text-slate-400 text-sm mt-1 max-w-xs mx-auto">
                Tous les restaurants ont été traités. Revenez plus tard !
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/5">
                <thead className="bg-white/[0.03]">
                  <tr>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Restaurant</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Type / Budget</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Localisation</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Statut</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Date Création</th>
                    <th className="px-6 py-4 text-right text-[11px] font-bold text-slate-500 uppercase tracking-widest">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {restaurants.map((restaurant) => (
                    <tr key={restaurant.id} className="group hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary relative overflow-hidden">
                            {restaurant.coverImageUrl ? (
                              <Image src={restaurant.coverImageUrl} alt={restaurant.name} fill className="object-cover" />
                            ) : restaurant.imageUrl ? (
                              <Image src={restaurant.imageUrl} alt={restaurant.name} fill className="object-cover" />
                            ) : (
                              <MaterialIcon name="store" size="lg" />
                            )}
                          </div>
                          <div>
                            <div
                              className="text-sm font-bold text-white group-hover:text-primary transition-colors cursor-pointer"
                              onClick={() => setSelectedRestaurant(restaurant)}
                            >
                              {restaurant.name}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <MaterialIcon name="verified_user" size="sm" className="text-emerald-500" />
                              ID: {restaurant.ownerId.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-xs text-slate-300 font-medium">
                          {restaurant.cuisineType.slice(0, 2).join(', ')}
                          {restaurant.cuisineType.length > 2 && '...'}
                        </div>
                        <div className="text-[11px] text-slate-500">Budget: {restaurant.avgPricePerPerson}€/pers</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <MaterialIcon name="location_on" size="sm" className="text-slate-500" />
                          <span className="truncate max-w-[150px]">{restaurant.address}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(restaurant.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-[11px] font-medium text-slate-500">
                        {restaurant.createdAt instanceof Timestamp
                          ? restaurant.createdAt.toDate().toLocaleDateString('fr-FR')
                          : new Date(restaurant.createdAt as unknown as Date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => setSelectedRestaurant(restaurant)}
                          className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-primary"
                        >
                          <MaterialIcon name="chevron_right" size="md" />
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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedRestaurant(null)}
          />

          <div className="relative h-full w-full max-w-2xl bg-[#0d0d0d] border-l border-white/10 overflow-y-auto animate-in slide-in-from-right duration-500">
            {/* Modal Header */}
            <div className="sticky top-0 z-50 bg-[#0d0d0d]/80 backdrop-blur-xl border-b border-white/5 p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] flex items-center justify-center text-black">
                  <MaterialIcon name="store" size="lg" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedRestaurant.name}</h2>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedRestaurant.status)}
                    <span className="text-[10px] text-slate-500 font-mono">Vérification de compte</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedRestaurant(null)}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
                title="Fermer"
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
                    <MaterialIcon name="store" size="sm" /> Identité
                  </h3>
                  <div className="space-y-3 bg-white/[0.02] p-5 rounded-2xl border border-white/5">
                    <div>
                      <span className="block text-[10px] text-slate-500 uppercase mb-1">Cuisines</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedRestaurant.cuisineType.map(c => (
                          <span key={c} className="text-xs font-semibold px-2 py-0.5 bg-white/5 border border-white/10 rounded-lg text-slate-300">{c}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-500 uppercase mb-1">Budget Moyen</span>
                      <p className="text-sm font-bold text-white">{selectedRestaurant.avgPricePerPerson}€ / Personne</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <MaterialIcon name="location_on" size="sm" /> Contact & Localisation
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
                  <MaterialIcon name="calendar_today" size="sm" /> Horaires d&apos;Ouverture
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {selectedRestaurant.openingHours && Object.entries(selectedRestaurant.openingHours).map(([day, hours]) => (
                    <div key={day} className={`p-3 rounded-xl border ${hours ? 'bg-primary/5 border-primary/10' : 'bg-white/[0.02] border-white/5'}`}>
                      <span className="block text-[10px] font-bold capitalize text-slate-500 mb-1">{day}</span>
                      <span className="text-[11px] font-semibold text-slate-300">
                        {hours ? `${hours.open} - ${hours.close}` : 'Fermé'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Actions Section */}
              {selectedRestaurant.status === 'pending_approval' && (
                <div className="pt-8 border-t border-white/10 space-y-6">
                  <div className="flex items-center gap-3">
                    <MaterialIcon name="verified_user" size="md" className="text-emerald-500" />
                    <h3 className="text-lg font-bold text-white">Validation Requise</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                      <p className="text-xs text-emerald-400 mb-4 font-medium italic">
                        L&apos;approbation rendra le restaurant visible par tous les passagers.
                      </p>
                      <button
                        onClick={() => handleApproval(selectedRestaurant.id, true)}
                        disabled={!!processing}
                        className="w-full h-14 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-black font-bold uppercase tracking-wider rounded-2xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:opacity-50"
                      >
                        {processing === selectedRestaurant.id ? 'Traitement...' : 'Approuver'}
                      </button>
                    </div>

                    <div className="p-5 bg-rose-500/5 rounded-2xl border border-rose-500/10 space-y-4">
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Motif du refus..."
                        className="glass-input w-full p-3 rounded-xl text-sm min-h-[80px]"
                      />
                      <button
                        onClick={() => handleApproval(selectedRestaurant.id, false)}
                        disabled={!!processing || !rejectionReason.trim()}
                        className="w-full h-14 bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 border border-white/10 hover:border-rose-500/30 text-slate-400 font-bold uppercase tracking-wider rounded-2xl transition-all disabled:opacity-50"
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
      <BottomNav items={adminNavItems} />
    </div>
  );
}
