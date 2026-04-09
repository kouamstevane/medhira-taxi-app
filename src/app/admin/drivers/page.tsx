'use client';

import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  startAfter,
  getDocs,
  DocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '@/config/firebase';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AdminDrivers');
import type { DriverDeletionResult } from '@/utils/driver-deletion.service';
import Image from 'next/image';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import DeleteDriverModal from '@/components/admin/DeleteDriverModal';
import AdminHeader from '@/components/admin/AdminHeader';
import { BottomNav, adminNavItems } from '@/components/ui/BottomNav';

export interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneNumber?: string;
  status: 'pending' | 'approved' | 'rejected' | 'available' | 'offline' | 'busy' | 'action_required';
  driverType?: 'chauffeur' | 'livreur' | 'les_deux';
  licenseNumber: string;
  city: string;
  car: {
    model: string;
    plate: string;
    color: string;
    brand?: string;
  };
  carModel?: string;
  carPlate?: string;
  carColor?: string;
  documents: {
    licensePhoto: string;
    licenseFront?: string;
    licenseBack?: string;
    idFront?: string;
    idBack?: string;
    carRegistration: string;
    insurance?: string;
    techControl?: string;
    vehicleExterior?: string;
    vehicleInterior?: string;
    biometricPhoto?: string;
  };
  createdAt: unknown;
  rejectionReason?: string;
  isSuspended?: boolean;
  suspensionReason?: string;
  isActive?: boolean;
}

const DriverSkeleton = () => (
  <div className="space-y-4 animate-pulse p-4">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-white/10" />
          <div className="space-y-2">
            <div className="h-4 w-32 bg-white/10 rounded" />
            <div className="h-3 w-24 bg-white/10 rounded" />
          </div>
        </div>
        <div className="h-4 w-24 bg-white/10 rounded" />
        <div className="h-4 w-16 bg-white/10 rounded" />
      </div>
    ))}
  </div>
);

export default function AdminDriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [driverTypeFilter, setDriverTypeFilter] = useState<'all' | 'chauffeur' | 'livreur' | 'les_deux'>('all');
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const isAdmin = useAdminAuth();

  const PAGE_SIZE = 25;

  // States for administrative action modale
  const [actionModal, setActionModal] = useState<{
    show: boolean,
    action: 'suspend' | 'unsuspend' | 'deactivate' | null,
    driver: Driver | null,
    reason: string
  }>({
    show: false,
    action: null,
    driver: null,
    reason: ''
  });

  // States for deletion modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [driverToDelete, setDriverToDelete] = useState<Driver | null>(null);

  useEffect(() => {
    setCurrentPage(0);
    setDrivers([]);
  }, [filter]);

  useEffect(() => {
    if (!isAdmin) return;

    setLoading(true);
    const driversRef = collection(db, 'drivers');
    const q = filter === 'all'
      ? query(driversRef, orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
      : query(driversRef, where('status', '==', filter), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const driversData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Driver[];

      setDrivers(driversData);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
      setLoading(false);
    }, (err) => {
      logger.error('Chargement des chauffeurs', err instanceof Error ? err : new Error(String(err)));
      setError('Erreur lors du chargement des chauffeurs');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [filter, isAdmin]);

  const loadMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const driversRef = collection(db, 'drivers');
      const q = filter === 'all'
        ? query(driversRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE))
        : query(driversRef, where('status', '==', filter), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE));

      const snapshot = await getDocs(q);
      const newDrivers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Driver[];

      setDrivers(prev => [...prev, ...newDrivers]);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (err) {
      logger.error('Chargement page suivante', err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleAdminAction = async (action: string, driverId: string, reason?: string) => {
    setProcessing(driverId);
    setError(null);
    setSuccess(null);

    try {
      if (!auth.currentUser) throw new Error('Non authentifié');
      const idToken = await auth.currentUser.getIdToken(true);

      const response = await fetch('/api/admin/manage-driver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action,
          driverId,
          reason,
          adminUid: auth.currentUser.uid
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'action');
      }

      setSuccess(`Action "${action}" effectuée avec succès`);
      setSelectedDriver(null);
      setRejectionReason('');
      setActionModal({ show: false, action: null, driver: null, reason: '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour du statut';
      logger.error('Action admin sur chauffeur', err instanceof Error ? err : new Error(String(err)));
      setError(message);
    } finally {
      setProcessing(null);
    }
  };


  const handleDeleteDriver = async (driverId: string): Promise<DriverDeletionResult> => {
    setProcessing(driverId);
    setError(null);
    setSuccess(null);

    const startTime = Date.now();

    try {
      // 1. Obtenir le token ID de l'administrateur actuel
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Vous devez être connecté pour effectuer cette action');
      }

      const idToken = await currentUser.getIdToken();

      // 2. Appeler l'API de suppression complète
      const response = await fetch('/api/admin/delete-driver-complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ driverId })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erreur lors de la suppression complète');
      }

      setSuccess('Le compte chauffeur et toutes ses données ont été supprimés définitivement');
      setDeleteModalOpen(false);
      setDriverToDelete(null);
      setSelectedDriver(null);

      return result as DriverDeletionResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de la suppression du compte';
      logger.error('Suppression chauffeur', err instanceof Error ? err : new Error(String(err)));
      setError(errorMessage);

      return {
        success: false,
        deletedCollections: [],
        deletedFiles: 0,
        errors: [errorMessage],
        duration: Date.now() - startTime
      };
    } finally {
      setProcessing(null);
    }
  };

  const openDeleteModal = (driver: Driver) => {
    setDriverToDelete(driver);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDriverToDelete(null);
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      approved: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      rejected: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
      available: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      offline: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
      busy: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
      action_required: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
    };

    const labels = {
      pending: 'En attente',
      approved: 'Approuvé',
      rejected: 'Refusé',
      available: 'Disponible',
      offline: 'Hors ligne',
      busy: 'En course',
      action_required: 'Action requise',
    };

    const statusKey = status as keyof typeof styles;
    const style = styles[statusKey] || 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    const label = labels[statusKey] || status;

    return (
      <span className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold border backdrop-blur-sm ${style}`}>
        {label}
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

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-white">
      <AdminHeader
        title="Gestion des Chauffeurs"
        subtitle="Validation et suivi des chauffeurs"
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Statistics or Quick Filters Card */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`relative overflow-hidden group p-4 rounded-2xl border transition-all duration-500 ${
                filter === f
                  ? 'bg-primary/10 border-primary/30'
                  : 'glass-card border-white/5 hover:border-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold capitalize transition-colors ${filter === f ? 'text-primary' : 'text-slate-400'}`}>
                  {f === 'all' ? 'Tous' : f === 'pending' ? 'En attente' : f === 'approved' ? 'Approuvés' : 'Refusés'}
                </span>
                <div className={`p-2 rounded-lg transition-colors ${filter === f ? 'bg-primary text-black' : 'bg-white/5 text-slate-400'}`}>
                  {f === 'all' ? <MaterialIcon name="verified_user" size="sm" /> : f === 'pending' ? <MaterialIcon name="warning" size="sm" /> : f === 'approved' ? <MaterialIcon name="check_circle" size="sm" /> : <MaterialIcon name="cancel" size="sm" />}
                </div>
              </div>
              {filter === f && <div className="absolute bottom-0 left-0 h-1 w-full bg-primary" />}
            </button>
          ))}
        </div>

        {/* Driver Type Filter */}
        <div className="flex gap-2 mb-6">
          {(['all', 'chauffeur', 'livreur', 'les_deux'] as const).map((t) => (
            <button key={t} onClick={() => setDriverTypeFilter(t)}
              className={['px-4 h-8 rounded-xl text-xs font-medium transition-all',
                driverTypeFilter === t ? 'bg-primary text-white' : 'bg-white/5 text-slate-400'].join(' ')}>
              {t === 'all' ? 'Tous types' : t === 'les_deux' ? 'Les deux' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Global Messages */}
        <div className="space-y-4 mb-6">
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <MaterialIcon name="warning" size="md" className="shrink-0" />
              <p className="text-sm font-medium flex-1">{error}</p>
              <button onClick={() => setError(null)} className="p-1 hover:bg-rose-500/10 rounded-lg">
                <MaterialIcon name="cancel" size="sm" />
              </button>
            </div>
          )}
          {success && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <MaterialIcon name="check_circle" size="md" className="shrink-0" />
              <p className="text-sm font-medium flex-1">{success}</p>
              <button onClick={() => setSuccess(null)} className="p-1 hover:bg-green-500/10 rounded-lg">
                <MaterialIcon name="cancel" size="sm" />
              </button>
            </div>
          )}
        </div>

        {/* Search & Action Bar */}
        <div className="flex flex-col md:flex-row gap-4 mb-6 items-center justify-between">
          <div className="relative w-full md:w-96">
            <MaterialIcon name="search" size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher un chauffeur..."
              className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2.5 glass-card border border-white/5 rounded-xl hover:bg-white/5 text-slate-400 transition">
              <MaterialIcon name="filter_list" size="sm" />
            </button>
          </div>
        </div>

        {/* Liste des chauffeurs */}
        <div className="glass-card border border-white/5 rounded-3xl overflow-hidden">
          {loading ? (
            <DriverSkeleton />
          ) : drivers.length === 0 ? (
            <div className="py-24 text-center">
              <div className="inline-flex p-4 rounded-full bg-white/5 mb-4 text-slate-500">
                <MaterialIcon name="person" size="xl" />
              </div>
              <h3 className="text-lg font-semibold text-white">Aucun chauffeur trouvé</h3>
              <p className="text-slate-400 text-sm mt-1 max-w-xs mx-auto">
                Il n&apos;y a aucun profil correspondant à votre filtre &quot;{filter}&quot; pour le moment.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/5">
                <thead className="bg-white/[0.03]">
                  <tr>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Chauffeur</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Contact</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Véhicule</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Statut</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Date</th>
                    <th className="px-6 py-4 text-right text-[11px] font-bold text-slate-500 uppercase tracking-widest">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {drivers.filter(d => driverTypeFilter === 'all' || (d.driverType ?? 'chauffeur') === driverTypeFilter).slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((driver) => (
                    <tr key={driver.id} className="group hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold">
                            {(driver.firstName || 'U').charAt(0).toUpperCase()}
                            {(driver.lastName || '').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div
                              className="text-sm font-semibold text-white group-hover:text-primary transition-colors cursor-pointer"
                              onClick={() => setSelectedDriver(driver)}
                            >
                              {driver.firstName || 'Utilisateur'} {driver.lastName || ''}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-500 font-medium">Permis: {driver.licenseNumber || 'N/A'}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                driver.driverType === 'livreur' ? 'bg-amber-500/10 text-amber-400' :
                                driver.driverType === 'les_deux' ? 'bg-purple-500/10 text-purple-400' :
                                'bg-primary/10 text-primary'}`}>
                                {driver.driverType === 'livreur' ? 'Livreur' : driver.driverType === 'les_deux' ? 'Les deux' : 'Chauffeur'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-300">{driver.email}</div>
                        <div className="text-[11px] text-slate-500">{driver.phone || driver.phoneNumber}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <MaterialIcon name="directions_car" size="sm" className="text-primary" />
                          <div className="text-sm text-slate-300 font-medium">{driver.car?.model || driver.carModel || 'N/A'}</div>
                        </div>
                        <div className="text-[11px] text-slate-500 uppercase tracking-tighter opacity-70">
                          {driver.car?.plate || driver.carPlate || 'N/A'} • {driver.car?.color || driver.carColor || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1.5">
                          {getStatusBadge(driver.status)}
                          {driver.isSuspended && (
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 uppercase tracking-tighter w-fit">
                              <span className="h-1 w-1 rounded-full bg-orange-400 animate-pulse" /> Suspendu
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-[11px] font-medium text-slate-500">
                        {driver.createdAt instanceof Timestamp
                          ? driver.createdAt.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                          : new Date(driver.createdAt as number).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => setSelectedDriver(driver)}
                          className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white"
                        >
                          <MaterialIcon name="chevron_right" size="md" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination controls */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
                <span className="text-xs text-slate-500">
                  {drivers.length} chauffeur{drivers.length !== 1 ? 's' : ''} chargés
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Page précédente"
                  >
                    <MaterialIcon name="chevron_left" size="sm" />
                  </button>
                  <span className="text-xs text-slate-400 px-2">
                    {currentPage + 1} / {Math.ceil(drivers.length / PAGE_SIZE) || 1}
                  </span>
                  {(currentPage + 1) * PAGE_SIZE < drivers.length ? (
                    <button
                      onClick={() => setCurrentPage(p => p + 1)}
                      className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 transition-all"
                      title="Page suivante"
                    >
                      <MaterialIcon name="chevron_right" size="sm" />
                    </button>
                  ) : hasMore ? (
                    <button
                      onClick={() => {
                        loadMore();
                        setCurrentPage(p => p + 1);
                      }}
                      disabled={loadingMore}
                      className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-all disabled:opacity-50"
                    >
                      {loadingMore ? 'Chargement...' : 'Charger plus'}
                    </button>
                  ) : (
                    <button disabled className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 opacity-30 cursor-not-allowed">
                      <MaterialIcon name="chevron_right" size="sm" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modern Side Modal (Drawer style) for Details */}
      {selectedDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-end">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => { setSelectedDriver(null); setRejectionReason(''); }}
          />

          {/* Content */}
          <div className="relative h-full w-full max-w-2xl bg-[#0d0d0d] border-l border-white/10 overflow-y-auto animate-in slide-in-from-right duration-500">
            <div className="sticky top-0 z-50 bg-[#0d0d0d]/80 backdrop-blur-xl border-b border-white/5 p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-primary to-[#ffae33] flex items-center justify-center text-black font-black text-xl shadow-[0_0_20px_rgba(242,146,0,0.3)]">
                  {selectedDriver.firstName[0]}{selectedDriver.lastName[0]}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedDriver.firstName} {selectedDriver.lastName}</h2>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedDriver.status)}
                    <span className="text-[10px] text-slate-500 font-mono">ID: {selectedDriver.id.substring(0, 8)}...</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setSelectedDriver(null); setRejectionReason(''); }}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
              >
                <MaterialIcon name="cancel" size="lg" className="text-slate-400" />
              </button>
            </div>

            <div className="p-8 space-y-12">
              {/* Informations Personnelles */}
              <section>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <MaterialIcon name="person" size="md" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Informations Personnelles</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                  {[
                    { label: 'Prénom', value: selectedDriver.firstName },
                    { label: 'Nom', value: selectedDriver.lastName },
                    { label: 'Email', value: selectedDriver.email },
                    { label: 'Téléphone', value: (selectedDriver.phone || selectedDriver.phoneNumber) },
                    { label: 'Numéro de permis', value: (selectedDriver.licenseNumber || 'Non renseigné') },
                    { label: 'Ville', value: (selectedDriver.city || 'Non renseignée') },
                  ].map((item, idx) => (
                    <div key={idx}>
                      <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{item.label}</span>
                      <p className="text-sm text-slate-300 font-medium">{item.value || 'N/A'}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Informations Véhicule */}
              <section>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <MaterialIcon name="directions_car" size="md" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Véhicule</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                  {[
                    { label: 'Marque/Modèle', value: (selectedDriver.car?.brand ? `${selectedDriver.car.brand} ${selectedDriver.car.model}` : (selectedDriver.car?.model || selectedDriver.carModel)) },
                    { label: 'Plaque d\'immatriculation', value: (selectedDriver.car?.plate || selectedDriver.carPlate) },
                    { label: 'Couleur', value: (selectedDriver.car?.color || selectedDriver.carColor) },
                  ].map((item, idx) => (
                    <div key={idx}>
                      <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{item.label}</span>
                      <p className="text-sm text-slate-300 font-medium">{item.value || 'N/A'}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Documents */}
              <section>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <MaterialIcon name="description" size="md" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Documents Officiels</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {[
                    { label: 'Photo de profil', src: selectedDriver.documents.biometricPhoto, id: 'biometricPhoto' },
                    { label: 'Permis (Recto)', src: selectedDriver.documents.licenseFront || selectedDriver.documents.licensePhoto, id: 'licensePhoto' },
                    { label: 'Permis (Verso)', src: selectedDriver.documents.licenseBack, id: 'licenseBack' },
                    { label: 'Identité (Recto)', src: selectedDriver.documents.idFront, id: 'idFront' },
                    { label: 'Identité (Verso)', src: selectedDriver.documents.idBack, id: 'idBack' },
                    { label: 'Carte grise', src: selectedDriver.documents.carRegistration, id: 'carRegistration' },
                    { label: 'Assurance', src: selectedDriver.documents.insurance, id: 'insurance' },
                    { label: 'Contrôle Technique', src: selectedDriver.documents.techControl, id: 'techControl' },
                    { label: 'Véhicule (Extérieur)', src: selectedDriver.documents.vehicleExterior, id: 'vehicleExterior' },
                    { label: 'Véhicule (Intérieur)', src: selectedDriver.documents.vehicleInterior, id: 'vehicleInterior' },
                  ].map((doc, idx) => doc.src ? (
                    <div key={idx} className="group flex flex-col gap-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{doc.label}</span>
                      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-white/5 ring-1 ring-white/5 hover:ring-primary/50 transition-all duration-300">
                        <a href={doc.src} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
                          <Image
                            src={doc.src}
                            alt={doc.label}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-[2px]">
                            <span className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-xl text-xs font-bold border border-white/20">Agrandir</span>
                          </div>
                        </a>
                      </div>
                    </div>
                  ) : null)}
                </div>

                {Object.values(selectedDriver.documents).every(v => !v) && (
                  <div className="p-8 text-center bg-white/5 border border-white/10 rounded-2xl">
                    <p className="text-slate-500 text-sm">Aucun document numérique disponible.</p>
                  </div>
                )}
              </section>

              {/* Actions Section */}
              <div className="pt-8 border-t border-white/10">
                {selectedDriver.status === 'pending' ? (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <MaterialIcon name="verified_user" size="md" className="text-emerald-500" />
                      <h3 className="text-lg font-bold text-emerald-500">Validation Requise</h3>
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                        <p className="text-xs text-emerald-400 mb-4 font-medium italic">
                          En approuvant ce chauffeur, il sera immédiatement autorisé à accepter des courses.
                        </p>
                        <button
                          onClick={() => handleAdminAction('approve', selectedDriver.id)}
                          disabled={processing === selectedDriver.id}
                          className="w-full h-14 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-black font-black uppercase tracking-wider rounded-2xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:opacity-50"
                        >
                          {processing === selectedDriver.id ? 'Traitement en cours...' : 'Approuver le profil'}
                        </button>
                      </div>

                      <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl space-y-4">
                        <textarea
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder="Motif détaillé du refus..."
                          className="glass-input w-full p-4 rounded-2xl text-sm min-h-[100px]"
                        />
                        <button
                          onClick={() => handleAdminAction('reject', selectedDriver.id, rejectionReason.trim())}
                          disabled={processing === selectedDriver.id || !rejectionReason.trim()}
                          className="w-full h-12 bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 border border-white/10 hover:border-rose-500/30 text-slate-400 font-bold uppercase text-xs tracking-widest rounded-2xl transition-all disabled:opacity-50"
                        >
                          {processing === selectedDriver.id ? 'Traitement...' : 'Refuser l\'inscription'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <h3 className="text-lg font-bold text-white">Options Administratives</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedDriver.isSuspended ? (
                        <button
                          onClick={() => handleAdminAction('unsuspend', selectedDriver.id)}
                          className="h-12 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-bold transition-all uppercase tracking-widest"
                        >
                          Lever la suspension
                        </button>
                      ) : (
                        <button
                          onClick={() => setActionModal({ show: true, action: 'suspend', driver: selectedDriver, reason: '' })}
                          className="h-12 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-xl text-xs font-bold transition-all uppercase tracking-widest"
                        >
                          Suspendre
                        </button>
                      )}
                      <button
                        onClick={() => openDeleteModal(selectedDriver)}
                        className="h-12 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-bold transition-all uppercase tracking-widest"
                      >
                        Suppression Définitive
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Decision Modal */}
      {actionModal.show && actionModal.driver && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setActionModal({ show: false, action: null, driver: null, reason: '' })} />
          <div className="relative glass-card border border-white/10 rounded-3xl max-w-md w-full p-8 animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-red-500/10 rounded-2xl text-red-500">
                <MaterialIcon name="warning" size="lg" />
              </div>
              <h3 className="text-xl font-bold text-white">
                {actionModal.action === 'suspend' ? 'Suspendre' : 'Désactiver'} le chauffeur
              </h3>
            </div>

            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              Vous êtes sur le point de {actionModal.action === 'suspend' ? 'suspendre temporairement' : 'désactiver définitivement'} le compte de
              <strong className="text-white ml-1">{actionModal.driver.firstName} {actionModal.driver.lastName}</strong>.
            </p>

            <div className="space-y-2 mb-8">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Raison de l&apos;action</label>
              <textarea
                value={actionModal.reason}
                onChange={(e) => setActionModal({ ...actionModal, reason: e.target.value })}
                placeholder="Précisez la raison..."
                className="glass-input w-full p-4 rounded-2xl text-sm min-h-[100px]"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setActionModal({ show: false, action: null, driver: null, reason: '' })}
                className="flex-1 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-bold uppercase transition-all text-slate-300"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  if (actionModal.action && actionModal.driver && actionModal.reason.trim()) {
                    handleAdminAction(actionModal.action, actionModal.driver.id, actionModal.reason.trim());                  }
                }}
                disabled={!actionModal.reason.trim() || !!processing}
                className="flex-1 h-12 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl text-xs uppercase transition-all shadow-[0_0_20px_rgba(220,38,38,0.2)] disabled:opacity-50"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Driver Modal Hook */}
      {deleteModalOpen && driverToDelete && (
        <DeleteDriverModal
          isOpen={deleteModalOpen}
          onClose={closeDeleteModal}
          onConfirm={handleDeleteDriver}
          driver={driverToDelete}
        />
      )}
      <BottomNav items={adminNavItems} />
    </div>
  );
}
