'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  startAfter,
  getDocs,
  doc,
  DocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '@/config/firebase';
import type { DriverPrivate } from '@/types/firestore-collections';
import { suspendDriver, unsuspendDriver, deactivateDriver, reactivateDriver } from '@/services/admin.service';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useToast } from '@/hooks/useToast';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AdminDrivers');
import type { DriverDeletionResult } from '@/utils/driver-deletion.service';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import DeleteDriverModal from '@/components/admin/DeleteDriverModal';
import { DriverDetailsDrawer } from '@/components/admin/DriverDetailsDrawer';
import AdminHeader from '@/components/admin/AdminHeader';
import { BottomNav, adminNavItems } from '@/components/ui/BottomNav';
import { getApplicationActionsClassName, getInvitationPreparedMessage, getPendingApplicationsSummary } from './adminDriversUi';
import { buildAdminDriverActionPayload } from './adminDriversActions';

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
  zipCode?: string;
  car: {
    model: string;
    plate: string;
    color: string;
    brand?: string;
  };
  carModel?: string;
  carPlate?: string;
  carColor?: string;
  // RGPD #C2 : `documents` n'est plus à la racine — hydraté via
  // `drivers/{uid}/private/personal` dans `selectedDriverPrivate`.
  createdAt: unknown;
  rejectionReason?: string;
  isSuspended?: boolean;
  suspensionReason?: string;
  isActive?: boolean;
}

interface DriverApplication {
  id: string;
  fullName?: string;
  email: string;
  phone?: string;
  city?: string;
  role?: 'chauffeur' | 'livreur' | 'les_deux';
  status: string;
  cv?: { fileName?: string };
  createdAt?: { toDate?: () => Date };
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
  // RGPD #C2 : documents/PII depuis la sous-collection privée
  const [selectedDriverPrivate, setSelectedDriverPrivate] = useState<DriverPrivate | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const isAdmin = useAdminAuth();
  const [invitationEmail, setInvitationEmail] = useState('');
  const [invitationRole, setInvitationRole] = useState<'chauffeur' | 'livreur' | 'les_deux'>('chauffeur');
  const [invitationLoading, setInvitationLoading] = useState(false);
  const [applications, setApplications] = useState<DriverApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const invitationFormRef = useRef<HTMLFormElement>(null);
  const { showError, showSuccess } = useToast();

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

  // RGPD #C2 : souscrire à la sous-collection privée du driver sélectionné
  useEffect(() => {
    if (!selectedDriver) {
      setSelectedDriverPrivate(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'drivers', selectedDriver.id, 'private', 'personal'),
      (snap) => {
        setSelectedDriverPrivate(snap.exists() ? (snap.data() as DriverPrivate) : {});
      },
      () => setSelectedDriverPrivate({})
    );
    return () => unsub();
  }, [selectedDriver]);

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
      showError('Erreur lors du chargement des chauffeurs');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [filter, isAdmin, showError]);

  useEffect(() => {
    if (!isAdmin) {
      setApplicationsLoading(false);
      return;
    }
    setApplicationsLoading(true);
    setApplicationsError(null);
    // Keep this query index-free while the production composite index is building.
    const applicationsQuery = query(collection(db, 'driverApplications'), where('status', '==', 'pending_review'), limit(20));
    return onSnapshot(applicationsQuery, (snapshot) => {
      const nextApplications = snapshot.docs.map((application) => ({ id: application.id, ...application.data() })) as DriverApplication[];
      nextApplications.sort((first, second) => {
        const firstTime = first.createdAt?.toDate?.().getTime() ?? 0;
        const secondTime = second.createdAt?.toDate?.().getTime() ?? 0;
        return secondTime - firstTime;
      });
      setApplications(nextApplications);
      setApplicationsLoading(false);
    }, (err) => {
      logger.error('Chargement des candidatures', err instanceof Error ? err : new Error(String(err)));
      setApplicationsError('Impossible de charger les candidatures. Vérifiez la configuration Firestore.');
      setApplicationsLoading(false);
    });
  }, [isAdmin]);

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


    try {
      if (!auth.currentUser) throw new Error('Non authentifié');
      const adminUid = auth.currentUser.uid;

      if (action === 'suspend') {
        await suspendDriver(driverId, reason || 'Suspension administrative', adminUid);
      } else if (action === 'unsuspend') {
        await unsuspendDriver(driverId, adminUid);
      } else if (action === 'deactivate') {
        await deactivateDriver(driverId, reason || 'Désactivation administrative', adminUid);
      } else if (action === 'reactivate') {
        await reactivateDriver(driverId, adminUid);
      } else {
        const adminManageDriver = httpsCallable(functions, 'adminManageDriver');
        await adminManageDriver(buildAdminDriverActionPayload(action, driverId, reason));
      }

      showSuccess(`Action "${action}" effectuée avec succès`);
      setSelectedDriver(null);
      setRejectionReason('');
      setActionModal({ show: false, action: null, driver: null, reason: '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour du statut';
      logger.error('Action admin sur chauffeur', err instanceof Error ? err : new Error(String(err)));
      showError(message);
    } finally {
      setProcessing(null);
    }
  };

  const handleCreateInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInvitationLoading(true);

    try {
      const createInvitation = httpsCallable(functions, 'adminCreateDriverInvitation');
      const result = await createInvitation({
        email: invitationEmail.trim(),
        role: invitationRole,
      });
      const data = result.data as { code: string; expiresAt: number };
      const expiry = new Date(data.expiresAt).toLocaleString('fr-FR');
      showSuccess(`Invitation envoyée. Code : ${data.code} — expiration : ${expiry}`);
      setInvitationEmail('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Impossible de créer l’invitation');
    } finally {
      setInvitationLoading(false);
    }
  };

  const handleDownloadApplicationCv = async (applicationId: string) => {
    try {
      const getCv = httpsCallable<{ applicationId: string }, { url: string }>(functions, 'adminGetDriverApplicationCv');
      const result = await getCv({ applicationId });
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Impossible de télécharger le CV');
    }
  };

  const handleApplicationForInvitation = (application: DriverApplication) => {
    setInvitationEmail(application.email);
    if (application.role) setInvitationRole(application.role);
    showSuccess(getInvitationPreparedMessage(application.email));
    requestAnimationFrame(() => {
      invitationFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };


  const handleDeleteDriver = async (driverId: string): Promise<DriverDeletionResult> => {
    setProcessing(driverId);


    const startTime = Date.now();

    try {
      // 1. Obtenir le token ID de l'administrateur actuel
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Vous devez être connecté pour effectuer cette action');
      }

      const adminDeleteDriverComplete = httpsCallable(functions, 'adminDeleteDriverComplete');
      const cfResult = await adminDeleteDriverComplete({ driverId });
      const cfData = cfResult.data as DriverDeletionResult;

      showSuccess('Le compte chauffeur et toutes ses données ont été supprimés définitivement');
      setDeleteModalOpen(false);
      setDriverToDelete(null);
      setSelectedDriver(null);

      return cfData;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur lors de la suppression du compte';
      logger.error('Suppression chauffeur', err instanceof Error ? err : new Error(String(err)));
      showError(errorMessage);

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
        title="Candidatures & conducteurs"
        subtitle="Étude des candidatures et suivi des conducteurs"
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <section className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Candidatures à étudier</h2>
              <p className="mt-1 text-xs text-slate-400">
                {applicationsLoading ? 'Recherche des nouveaux dossiers…' : getPendingApplicationsSummary(applications.length)}.
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Les CV sont privés et accessibles uniquement aux administrateurs.</p>
            </div>
            <span className="min-w-8 rounded-full bg-primary px-2 py-1 text-center text-xs font-bold text-black">
              {applicationsLoading ? '…' : applications.length}
            </span>
          </div>
          {applicationsLoading ? (
            <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">Chargement des candidatures...</p>
          ) : applicationsError ? (
            <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">{applicationsError}</p>
          ) : applications.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">Aucune candidature en attente pour le moment.</p>
          ) : (
            <div className="space-y-3">
              {applications.map((application) => (
                <div key={application.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{application.fullName ?? 'Postulant'} <span className="text-xs font-normal text-primary">{application.role ? `(${application.role})` : ''}</span></p>
                    <p className="truncate text-xs text-slate-400">{application.email}</p>
                    <p className="mt-1 truncate text-[11px] text-slate-500">{application.cv?.fileName ?? 'CV joint'} · Réf. {application.id}</p>
                  </div>
                  <div className={getApplicationActionsClassName()}>
                    <button type="button" onClick={() => handleDownloadApplicationCv(application.id)} className="w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/10 sm:w-auto">Voir le CV</button>
                    <button type="button" onClick={() => handleApplicationForInvitation(application)} className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white sm:w-auto">Préremplir l’invitation</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Statistics or Quick Filters Card */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`relative min-h-20 overflow-hidden rounded-2xl border p-3 text-left transition-all duration-300 group md:p-4 ${
                filter === f
                  ? 'bg-primary/10 border-primary/30'
                  : 'glass-card border-white/5 hover:border-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold capitalize transition-colors md:text-sm ${filter === f ? 'text-primary' : 'text-slate-400'}`}>
                  {f === 'all' ? 'Tous' : f === 'pending' ? 'En attente' : f === 'approved' ? 'Approuvés' : 'Refusés'}
                </span>
                <div className={`rounded-lg p-1.5 transition-colors md:p-2 ${filter === f ? 'bg-primary text-black' : 'bg-white/5 text-slate-400'}`}>
                  {f === 'all' ? <MaterialIcon name="verified_user" size="sm" /> : f === 'pending' ? <MaterialIcon name="warning" size="sm" /> : f === 'approved' ? <MaterialIcon name="check_circle" size="sm" /> : <MaterialIcon name="cancel" size="sm" />}
                </div>
              </div>
              <span className={`mt-2 block text-lg font-bold ${filter === f ? 'text-primary' : 'text-slate-300'}`}>
                {f === 'all' ? drivers.length : drivers.filter((driver) => driver.status === f).length}
              </span>
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

        <form ref={invitationFormRef} id="driver-invitation-form" onSubmit={handleCreateInvitation} className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-white">Inviter un nouveau postulant</h2>
            <p className="mt-1 text-xs text-slate-400">Le code envoyé par email sera valable 48 heures.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input required type="email" value={invitationEmail} onChange={(e) => setInvitationEmail(e.target.value)} placeholder="Email du postulant" className="glass-input rounded-xl px-3 py-2 text-sm" />
            <select value={invitationRole} onChange={(e) => setInvitationRole(e.target.value as typeof invitationRole)} className="glass-input rounded-xl px-3 py-2 text-sm">
              <option value="chauffeur">Chauffeur</option>
              <option value="livreur">Livreur</option>
              <option value="les_deux">Chauffeur / Livreur</option>
            </select>
            <button disabled={invitationLoading} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{invitationLoading ? 'Envoi…' : 'Générer et envoyer'}</button>
          </div>
        </form>

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

      {selectedDriver && (
        <DriverDetailsDrawer
          driver={selectedDriver}
          privateData={selectedDriverPrivate}
          rejectionReason={rejectionReason}
          processing={processing === selectedDriver.id}
          onClose={() => { setSelectedDriver(null); setRejectionReason(''); }}
          onRejectionReasonChange={setRejectionReason}
          onApprove={() => handleAdminAction('approve', selectedDriver.id)}
          onReject={() => handleAdminAction('reject', selectedDriver.id, rejectionReason.trim())}
          onSuspend={() => setActionModal({ show: true, action: 'suspend', driver: selectedDriver, reason: '' })}
          onUnsuspend={() => handleAdminAction('unsuspend', selectedDriver.id)}
          onDelete={() => openDeleteModal(selectedDriver)}
          getStatusBadge={getStatusBadge}
        />
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
