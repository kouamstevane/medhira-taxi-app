'use client';

import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
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
import { DriverInviteModal } from '@/components/admin/DriverInviteModal';
import { DriverMobileCard } from '@/components/admin/DriverMobileCard';
import AdminHeader from '@/components/admin/AdminHeader';
import { BottomNav, adminNavItems } from '@/components/ui/BottomNav';
import {
  countAdminDriversByStatus,
  filterAdminDrivers,
  hideReviewedDriverApplications,
} from './adminDriversData';
import { getApplicationActionsClassName, getInvitationPreparedMessage } from './adminDriversUi';
import { buildAdminDriverActionPayload } from './adminDriversActions';

export interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneNumber?: string;
  status: 'pending' | 'approved' | 'rejected' | 'available' | 'offline' | 'busy' | 'action_required' | 'suspended';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  // RGPD #C2 : documents/PII depuis la sous-collection privée
  const [selectedDriverPrivate, setSelectedDriverPrivate] = useState<DriverPrivate | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const isAdmin = useAdminAuth();
  const [activeTab, setActiveTab] = useState<'drivers' | 'applications'>('drivers');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [invitationEmail, setInvitationEmail] = useState('');
  const [invitationRole, setInvitationRole] = useState<'chauffeur' | 'livreur' | 'les_deux'>('chauffeur');
  const [invitationLoading, setInvitationLoading] = useState(false);
  const [applications, setApplications] = useState<DriverApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
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
  }, [filter, driverTypeFilter, searchTerm]);

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
    if (!selectedDriver) return;
    const liveDriver = drivers.find((driver) => driver.id === selectedDriver.id);
    if (liveDriver && liveDriver !== selectedDriver) {
      setSelectedDriver(liveDriver);
    }
  }, [drivers, selectedDriver]);

  useEffect(() => {
    if (!isAdmin) return;

    setLoading(true);
    const driversRef = collection(db, 'drivers');
    const q = query(driversRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const driversData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Driver[];

      setDrivers(driversData);
      setLoading(false);
    }, (err) => {
      logger.error('Chargement des chauffeurs', err instanceof Error ? err : new Error(String(err)));
      showError('Erreur lors du chargement des chauffeurs');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin, showError]);

  useEffect(() => {
    if (!isAdmin) {
      setApplicationsLoading(false);
      return;
    }
    setApplicationsLoading(true);
    setApplicationsError(null);
    // Keep this query index-free while the production composite index is building.
    const applicationsQuery = query(collection(db, 'driverApplications'), where('status', '==', 'pending_review'));
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
      setIsInviteModalOpen(false);
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
    setIsInviteModalOpen(true);
    showSuccess(getInvitationPreparedMessage(application.email));
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
      suspended: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      available: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      offline: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
      busy: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
      action_required: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
    };

    const labels = {
      pending: 'En attente',
      approved: 'Approuvé',
      rejected: 'Refusé',
      suspended: 'Suspendu',
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

  const visibleApplications = hideReviewedDriverApplications(applications, drivers);
  const filteredDrivers = filterAdminDrivers(drivers, {
    status: filter,
    driverType: driverTypeFilter,
    search: searchTerm,
  });
  const driverCounts = countAdminDriversByStatus(drivers);
  const totalPages = Math.max(1, Math.ceil(filteredDrivers.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages - 1);
  const paginatedDrivers = filteredDrivers.slice(safeCurrentPage * PAGE_SIZE, (safeCurrentPage + 1) * PAGE_SIZE);
  const countsByFilter = {
    all: driverCounts.all,
    pending: driverCounts.pending,
    approved: driverCounts.approved,
    rejected: driverCounts.rejected,
  };

  return (
    <div className="min-h-screen bg-background text-white">
      <AdminHeader
        title="Candidatures & conducteurs"
        subtitle="Étude des candidatures et suivi des conducteurs"
      />

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        {/* Top bar with Navigation Tabs and "+ Inviter" action */}
        <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Navigation principale" className="flex w-full items-center gap-1 rounded-xl bg-white/[0.03] p-1 sm:w-auto">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'drivers'}
              onClick={() => setActiveTab('drivers')}
              className={`flex min-h-[44px] flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                activeTab === 'drivers'
                  ? 'bg-white/[0.09] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <MaterialIcon name="directions_car" size="sm" className={activeTab === 'drivers' ? 'text-primary' : 'text-slate-400'} />
              <span>Chauffeurs</span>
              <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300 font-bold">
                {driverCounts.all}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'applications'}
              onClick={() => setActiveTab('applications')}
              className={`flex min-h-[44px] flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                activeTab === 'applications'
                  ? 'bg-white/[0.09] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <MaterialIcon name="assignment" size="sm" className={activeTab === 'applications' ? 'text-amber-400' : 'text-slate-400'} />
              <span>Candidatures</span>
              {visibleApplications.length > 0 ? (
                <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">
                  {visibleApplications.length}
                </span>
              ) : (
                <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-400 font-bold">
                  0
                </span>
              )}
            </button>
          </div>

          {/* Action button "+ Inviter" */}
          <button
            type="button"
            onClick={() => setIsInviteModalOpen(true)}
            className="flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.99]"
          >
            <MaterialIcon name="person_add" size="sm" />
            <span>Inviter un chauffeur</span>
          </button>
        </div>

        {/* Candidatures Section */}
        {activeTab === 'applications' && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-6">
            <div className="mb-5">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                  <MaterialIcon name="assignment" className="text-primary" />
                  Candidatures à étudier
                </h2>
                <p className="mt-1 text-[11px] text-slate-500">CV privés, accessibles uniquement aux administrateurs autorisés.</p>
              </div>
            </div>

            {applicationsLoading ? (
              <div className="py-12 text-center text-sm text-slate-400">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Chargement des candidatures en cours...
              </div>
            ) : applicationsError ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-300">
                {applicationsError}
              </div>
            ) : visibleApplications.length === 0 ? (
              <div className="py-16 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-slate-500">
                  <MaterialIcon name="check_circle" size="lg" className="text-emerald-400" />
                </div>
                <h3 className="text-base font-semibold text-white">Toutes les candidatures ont été traitées</h3>
                <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                  Aucun nouveau dossier en attente. Les candidatures validées apparaissent dans la liste des chauffeurs.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleApplications.map((application) => (
                  <div key={application.id} className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#151515] p-4 transition-colors hover:border-white/[0.16] sm:p-5">
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-base font-semibold text-white">
                          {application.fullName ?? 'Postulant'}
                        </p>
                        {application.role && (
                            <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-semibold text-slate-300 capitalize">
                            {application.role}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-400">{application.email}</p>
                      <p className="mt-2 truncate text-[11px] text-slate-500">
                        {application.cv?.fileName ?? 'CV joint'} · Réf. {application.id}
                      </p>
                    </div>
                    <div className={getApplicationActionsClassName()}>
                      <button
                        type="button"
                        onClick={() => handleDownloadApplicationCv(application.id)}
                        className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10"
                      >
                        <MaterialIcon name="visibility" size="sm" />
                        <span>Voir le CV</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplicationForInvitation(application)}
                        className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
                      >
                        <MaterialIcon name="send" size="sm" />
                        <span>Préparer l’invitation</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Drivers Section */}
        {activeTab === 'drivers' && (
          <div className="space-y-5 sm:space-y-6">
            {/* 4-column Segmented Controls for Status */}
            <section className="rounded-xl bg-white/[0.03] p-1.5 sm:p-2">
              <div role="tablist" aria-label="Filtres statut chauffeurs" className="grid grid-cols-4 gap-1.5">
                {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={filter === f}
                    onClick={() => setFilter(f)}
                    className={`flex min-h-[44px] sm:min-h-14 min-w-0 items-center justify-start gap-1.5 rounded-xl px-2.5 py-2 text-left transition-colors sm:px-3.5 ${
                      filter === f
                        ? 'bg-white/[0.09] text-white shadow-sm'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className={`truncate text-[11px] font-semibold transition-colors sm:text-xs ${filter === f ? 'text-primary' : 'text-slate-400'}`}>
                      {f === 'all' ? 'Tous' : f === 'pending' ? 'En attente' : f === 'approved' ? 'Approuvés' : 'Refusés'}
                    </span>
                    <span className={`inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold sm:text-xs ${filter === f ? 'bg-primary text-white' : 'bg-white/10 text-slate-300'}`}>
                      {countsByFilter[f]}
                    </span>
                  </button>
                ))}
              </div>

              {/* Profile Type filter pills */}
              <div role="tablist" aria-label="Types de profil" className="mt-1 flex gap-1.5 overflow-x-auto pt-1">
                {(['all', 'chauffeur', 'livreur', 'les_deux'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={driverTypeFilter === t}
                    onClick={() => setDriverTypeFilter(t)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px] flex items-center ${
                      driverTypeFilter === t
                        ? 'bg-white/[0.09] text-white shadow-sm'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {t === 'all' ? 'Tous types' : t === 'les_deux' ? 'Les deux' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </section>

            {/* Search Bar */}
            <div className="relative w-full">
              <MaterialIcon name="search" size="sm" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                aria-label="Rechercher un chauffeur"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Rechercher un chauffeur..."
                className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm min-h-[44px]"
              />
            </div>

            {/* Drivers List: Mobile Cards + Desktop Table */}
            <div className="glass-card border border-white/5 rounded-3xl overflow-hidden p-3 sm:p-0">
              {loading ? (
                <DriverSkeleton />
              ) : filteredDrivers.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="inline-flex p-4 rounded-full bg-white/5 mb-4 text-slate-500">
                    <MaterialIcon name="person" size="xl" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Aucun chauffeur trouvé</h3>
                  <p className="text-slate-400 text-sm mt-1 max-w-xs mx-auto">
                    Il n&apos;y a aucun profil correspondant à votre filtre &quot;{filter}&quot; pour le moment.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile Card View (block md:hidden) - NO horizontal scrollbar! */}
                  <div className="block md:hidden space-y-3">
                    {paginatedDrivers.map((driver) => (
                      <DriverMobileCard
                        key={driver.id}
                        driver={driver}
                        onSelect={setSelectedDriver}
                        statusBadge={getStatusBadge(driver.status)}
                      />
                    ))}
                  </div>

                  {/* Desktop Table View (hidden md:block) */}
                  <div className="hidden md:block overflow-x-auto">
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
                        {paginatedDrivers.map((driver) => (
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
                                aria-label="Voir le profil du chauffeur"
                              >
                                <MaterialIcon name="chevron_right" size="md" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination controls */}
                  <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-t border-white/5">
                    <span className="text-xs text-slate-400">
                      {filteredDrivers.length} chauffeur{filteredDrivers.length !== 1 ? 's' : ''} affiché{filteredDrivers.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                        disabled={safeCurrentPage === 0}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        title="Page précédente"
                      >
                        <MaterialIcon name="chevron_left" size="sm" />
                      </button>
                      <span className="text-xs text-slate-300 font-medium px-2">
                        {safeCurrentPage + 1} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => p + 1)}
                        disabled={safeCurrentPage + 1 >= totalPages}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        title="Page suivante"
                      >
                        <MaterialIcon name="chevron_right" size="sm" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Driver Invitation Modal (replaces bottom static form) */}
      <DriverInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        email={invitationEmail}
        onEmailChange={setInvitationEmail}
        role={invitationRole}
        onRoleChange={setInvitationRole}
        onSubmit={handleCreateInvitation}
        isLoading={invitationLoading}
      />

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
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
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
