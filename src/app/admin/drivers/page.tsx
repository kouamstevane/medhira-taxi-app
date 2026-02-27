"use client";

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { auth, db } from '@/config/firebase';
import { collection, query, where, getDocs, updateDoc, doc, Timestamp, getDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged, User, getIdToken } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import DeleteDriverModal from '@/components/admin/DeleteDriverModal';
import { DriverDeletionResult } from '@/utils/driver-deletion.service';

export type Driver = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneNumber?: string; // Alias pour compatibilité
  licenseNumber: string;
  car: {
    model: string;
    plate: string;
    color: string;
  };
  carModel?: string; // Propriétés alternatives
  carPlate?: string;
  carColor?: string;
  documents: {
    licensePhoto: string;
    carRegistration: string;
    insurance?: string;
  };
  status: 'pending' | 'approved' | 'rejected' | 'available' | 'offline' | 'busy';
  isActive?: boolean;
  isSuspended?: boolean;
  suspensionReason?: string;
  createdAt: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  rejectionReason?: string;
};

export default function AdminDriversPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{
    show: boolean;
    action: 'suspend' | 'deactivate' | null;
    driver: Driver | null;
    reason: string;
  }>({
    show: false,
    action: null,
    driver: null,
    reason: '',
  });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [driverToDelete, setDriverToDelete] = useState<Driver | null>(null);

  // Vérifier si l'utilisateur est admin
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        // Vérifier si l'utilisateur est admin
        try {
          // Essayer d'abord avec l'UID comme ID du document (plus efficace)
          const adminDocRef = doc(db, 'admins', user.uid);
          const adminDoc = await getDoc(adminDocRef);
          
          if (adminDoc.exists()) {
            setIsAdmin(true);
          } else {
            // Fallback: chercher dans la collection où userId correspond à l'UID
            const adminQuery = query(
              collection(db, 'admins'),
              where('userId', '==', user.uid)
            );
            const adminSnapshot = await getDocs(adminQuery);
            const isUserAdmin = !adminSnapshot.empty;
            setIsAdmin(isUserAdmin);
            if (!isUserAdmin) {
              router.push('/dashboard');
            }
          }
        } catch (err) {
          console.error('Erreur vérification admin:', err);
          setIsAdmin(false);
        }
      } else {
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Charger les chauffeurs
  const loadDrivers = useCallback(async () => {
    try {
      setLoading(true);
      const driversRef = collection(db, 'drivers');
      let q;

      if (filter === 'all') {
        // Charger TOUS les chauffeurs sans filtre
        q = query(driversRef);
      } else if (filter === 'approved') {
        // Approuvés : inclure 'approved' ET les statuts actifs (available, offline, busy)
        // On ne peut pas utiliser 'in' avec plusieurs valeurs ET d'autres filtres, donc on charge tout et filtre après
        q = query(driversRef);
      } else {
        // Pour pending et rejected, filtrer normalement
        q = query(driversRef, where('status', '==', filter));
      }

      const querySnapshot = await getDocs(q);
      let driversList: Driver[] = [];
      
      querySnapshot.forEach((doc) => {
        driversList.push({
          id: doc.id,
          ...doc.data()
        } as Driver);
      });

      // Filtrer côté client pour "Approuvés" (inclut tous les chauffeurs actifs)
      if (filter === 'approved') {
        driversList = driversList.filter(driver => 
          driver.status === 'approved' || 
          driver.status === 'available' || 
          driver.status === 'offline' || 
          driver.status === 'busy'
        );
      }

      // Trier par date de création (plus récent en premier)
      driversList.sort((a, b) => {
        const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

      setDrivers(driversList);
      console.log(`📊 ${driversList.length} chauffeur(s) chargé(s) avec filtre "${filter}"`);
    } catch (err) {
      console.error('Erreur chargement chauffeurs:', err);
      setError('Erreur lors du chargement des chauffeurs');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (isAdmin) {
      loadDrivers();
    }
  }, [isAdmin, loadDrivers]);

  // Gestion des actions administratives (approve, reject, suspend, etc.)
  const handleAdminAction = async (
    action: 'approve' | 'reject' | 'suspend' | 'unsuspend' | 'deactivate' | 'reactivate',
    driverId: string,
    reason?: string
  ) => {
    if (!currentUser) {
      setError('Vous devez être connecté pour effectuer cette action');
      return;
    }

    try {
      setProcessing(driverId);
      setError(null);
      setSuccess(null);

      const response = await fetch('/api/admin/manage-driver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          driverId,
          reason,
          adminUid: currentUser.uid,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Erreur lors de l\'action');
      }

      setSuccess(data.message || 'Action effectuée avec succès');
      
      // Fermer les modals si ouverts
      setActionModal({ show: false, action: null, driver: null, reason: '' });
      setSelectedDriver(null);
      setRejectionReason('');
      
      // Recharger la liste
      loadDrivers();
    } catch (err: unknown) {
      console.error(`Erreur ${action}:`, err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(`Erreur lors de l'action (${action}): ${errorMessage}`);
    } finally {
      setProcessing(null);
    }
  };

  // Gestion de la suppression définitive complète
  // ✅ CORRECTION: Envoie le token Firebase Auth dans l'en-tête Authorization
  // ✅ CORRECTION: Retire le throw err redondant (le modal gère déjà l'erreur)
  const handleDeleteDriver = async (driverId: string): Promise<DriverDeletionResult> => {
    if (!currentUser) {
      throw new Error('Vous devez être connecté pour effectuer cette action');
    }

    try {
      setProcessing(driverId);
      setError(null);
      setSuccess(null);

      // Obtenir le token Firebase ID pour l'authentification
      const idToken = await getIdToken(currentUser, true);

      const response = await fetch('/api/admin/delete-driver-complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          driverId,
          // adminUid n'est plus nécessaire - extrait du token côté serveur
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Erreur lors de la suppression');
      }

      setSuccess(data.message || 'Chauffeur supprimé définitivement avec succès');

      // Recharger la liste
      await loadDrivers();

      return data;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(`Erreur lors de la suppression: ${errorMessage}`);
      // ✅ CORRECTION: Ne pas relancer l'erreur - le DeleteDriverModal gère l'affichage
      // Le throw err était redondant et pouvait causer un unhandled promise rejection
      throw err; // Gardé pour compatibilité avec le modal qui s'attend à une erreur
    } finally {
      setProcessing(null);
    }
  };

  // Ouvrir le modal de suppression
  const openDeleteModal = (driver: Driver) => {
    setDriverToDelete(driver);
    setDeleteModalOpen(true);
  };

  // Fermer le modal de suppression
  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDriverToDelete(null);
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      approved: 'bg-green-100 text-green-800 border-green-300',
      rejected: 'bg-red-100 text-red-800 border-red-300',
    };

    const labels = {
      pending: 'En attente',
      approved: 'Approuvé',
      rejected: 'Refusé',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  if (isAdmin === null || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f29200]"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-[#101010] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Administration - Gestion des Chauffeurs</h1>
              <p className="text-gray-300 text-sm mt-1">Gérez les demandes d&apos;inscription des chauffeurs</p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
            >
              Retour au tableau de bord
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filtres */}
        <div className="mb-6 flex gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filter === f
                  ? 'bg-[#f29200] text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? 'Tous' : f === 'pending' ? 'En attente' : f === 'approved' ? 'Approuvés' : 'Refusés'}
            </button>
          ))}
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded">
            <p>{error}</p>
            <button onClick={() => setError(null)} className="mt-2 text-red-500 hover:text-red-700">
              Fermer
            </button>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border-l-4 border-green-500 text-green-700 rounded">
            <p>{success}</p>
            <button onClick={() => setSuccess(null)} className="mt-2 text-green-500 hover:text-green-700">
              Fermer
            </button>
          </div>
        )}

        {/* Liste des chauffeurs */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {drivers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>Aucun chauffeur {filter === 'all' ? '' : filter === 'pending' ? 'en attente' : filter === 'approved' ? 'approuvé' : 'refusé'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Chauffeur
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Véhicule
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {drivers.map((driver) => (
                    <tr key={driver.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {driver.firstName} {driver.lastName}
                            </div>
                            <div className="text-sm text-gray-500">
                              Permis: {driver.licenseNumber || 'N/A'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{driver.email}</div>
                        <div className="text-sm text-gray-500">{driver.phone || driver.phoneNumber}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {driver.car?.model || driver.carModel || 'N/A'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {driver.car?.plate || driver.carPlate || 'N/A'} • {driver.car?.color || driver.carColor || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {getStatusBadge(driver.status)}
                          {driver.isSuspended && (
                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-300">
                              ⏸️ Suspendu
                            </span>
                          )}
                          {driver.isActive === false && (
                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-300">
                              🚫 Désactivé
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {driver.createdAt instanceof Timestamp
                          ? driver.createdAt.toDate().toLocaleDateString('fr-FR')
                          : new Date(driver.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => setSelectedDriver(driver)}
                          className="text-[#f29200] hover:text-[#e68600] mr-4"
                        >
                          Voir détails
                        </button>
                        
                        {/* Actions pour les chauffeurs en attente */}
                        {driver.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleAdminAction('approve', driver.id)}
                              disabled={processing === driver.id}
                              className="text-green-600 hover:text-green-900 mr-2 disabled:opacity-50"
                            >
                              {processing === driver.id ? 'Traitement...' : 'Approuver'}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedDriver(driver);
                                setRejectionReason('');
                              }}
                              disabled={processing === driver.id}
                              className="text-red-600 hover:text-red-900 disabled:opacity-50"
                            >
                              Refuser
                            </button>
                          </>
                        )}
                        
                        {/* Actions pour TOUS les chauffeurs approuvés ou existants */}
                        {(driver.status === 'approved' || driver.status === 'available' || driver.status === 'offline' || driver.status === 'busy') && (
                          <>
                            {driver.isSuspended ? (
                              <button
                                onClick={() => handleAdminAction('unsuspend', driver.id)}
                                disabled={processing === driver.id}
                                className="text-green-600 hover:text-green-900 mr-2 disabled:opacity-50"
                              >
                                Réactiver
                              </button>
                            ) : (
                              <button
                                onClick={() => setActionModal({ 
                                  show: true, 
                                  action: 'suspend', 
                                  driver, 
                                  reason: '' 
                                })}
                                disabled={processing === driver.id}
                                className="text-orange-600 hover:text-orange-900 mr-2 disabled:opacity-50"
                              >
                                Suspendre
                              </button>
                            )}
                            <button
                              onClick={() => setActionModal({ 
                                show: true, 
                                action: 'deactivate', 
                                driver, 
                                reason: '' 
                              })}
                              disabled={processing === driver.id}
                              className="text-yellow-600 hover:text-yellow-900 mr-2 disabled:opacity-50"
                            >
                              Désactiver
                            </button>
                            <button
                              onClick={() => openDeleteModal(driver)}
                              disabled={processing === driver.id}
                              className="text-red-600 hover:text-red-900 disabled:opacity-50 font-semibold"
                            >
                              Supprimer
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modal de détails */}
      {selectedDriver && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">
                  Détails du chauffeur - {selectedDriver.firstName} {selectedDriver.lastName}
                </h2>
                <button
                  onClick={() => {
                    setSelectedDriver(null);
                    setRejectionReason('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Informations personnelles */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Informations personnelles</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Prénom</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedDriver.firstName}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Nom</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedDriver.lastName}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedDriver.email}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Téléphone</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedDriver.phone}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Numéro de permis</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedDriver.licenseNumber}</p>
                  </div>
                </div>
              </div>

              {/* Informations véhicule */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Informations véhicule</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Modèle</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedDriver.car.model}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Plaque</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedDriver.car.plate}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Couleur</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedDriver.car.color}</p>
                  </div>
                </div>
              </div>

              {/* Documents */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Documents</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Permis de conduire</label>
                    <a
                      href={selectedDriver.documents.licensePhoto}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Image
                        src={selectedDriver.documents.licensePhoto}
                        alt="Permis de conduire"
                        width={400}
                        height={192}
                        className="w-full h-48 object-cover rounded-lg border border-gray-300 hover:border-[#f29200] transition"
                      />
                    </a>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Carte grise</label>
                    <a
                      href={selectedDriver.documents.carRegistration}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Image
                        src={selectedDriver.documents.carRegistration}
                        alt="Carte grise"
                        width={400}
                        height={192}
                        className="w-full h-48 object-cover rounded-lg border border-gray-300 hover:border-[#f29200] transition"
                      />
                    </a>
                  </div>
                  {selectedDriver.documents.insurance && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Assurance</label>
                      <a
                        href={selectedDriver.documents.insurance}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <Image
                          src={selectedDriver.documents.insurance}
                          alt="Assurance"
                          width={400}
                          height={192}
                          className="w-full h-48 object-cover rounded-lg border border-gray-300 hover:border-[#f29200] transition"
                        />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions si en attente */}
              {selectedDriver.status === 'pending' && (
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
                  <div className="flex gap-4">
                    <button
                      onClick={() => handleAdminAction('approve', selectedDriver.id)}
                      disabled={processing === selectedDriver.id}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition disabled:opacity-50"
                    >
                      {processing === selectedDriver.id ? 'Traitement...' : '✓ Approuver le compte'}
                    </button>
                    <div className="flex-1">
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Raison du refus (obligatoire)"
                        className="w-full p-3 border border-gray-300 rounded-lg mb-2 text-[#101010] placeholder-gray-400"
                        rows={3}
                      />
                      <button
                        onClick={() => handleAdminAction('reject', selectedDriver.id, rejectionReason.trim())}
                        disabled={processing === selectedDriver.id || !rejectionReason.trim()}
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition disabled:opacity-50"
                      >
                        {processing === selectedDriver.id ? 'Traitement...' : '✗ Refuser le compte'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Raison du refus si refusé */}
              {selectedDriver.status === 'rejected' && selectedDriver.rejectionReason && (
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Raison du refus</h3>
                  <p className="text-sm text-gray-700 bg-red-50 p-4 rounded-lg border border-red-200">
                    {selectedDriver.rejectionReason}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal d'actions administratives (suspendre, désactiver) */}
      {actionModal.show && actionModal.driver && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {actionModal.action === 'suspend' && 'Suspendre le chauffeur'}
              {actionModal.action === 'deactivate' && 'Désactiver le chauffeur'}
            </h3>
             
            <p className="text-gray-600 mb-4">
              Chauffeur : <strong>{actionModal.driver.firstName} {actionModal.driver.lastName}</strong>
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Raison (obligatoire)
              </label>
              <textarea
                value={actionModal.reason}
                onChange={(e) => setActionModal({ ...actionModal, reason: e.target.value })}
                placeholder={
                  actionModal.action === 'suspend'
                    ? 'Ex: Plaintes multiples des clients'
                    : 'Ex: Fraude détectée, documents invalides'
                }
                className="w-full p-3 border border-gray-300 rounded-lg text-[#101010]"
                rows={3}
              />
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
              <p className="text-sm text-yellow-700">
                {actionModal.action === 'suspend' && '⚠️ Le chauffeur sera bloqué temporairement. Vous pourrez le réactiver plus tard.'}
                {actionModal.action === 'deactivate' && '⚠️ Le compte sera désactivé définitivement. Le chauffeur ne pourra plus se connecter.'}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setActionModal({ show: false, action: null, driver: null, reason: '' })}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  if (actionModal.action && actionModal.driver) {
                    if (!actionModal.reason.trim()) {
                      setError('Veuillez indiquer la raison');
                      return;
                    }
                    handleAdminAction(actionModal.action, actionModal.driver.id, actionModal.reason.trim());
                  }
                }}
                disabled={processing === actionModal.driver?.id || !actionModal.reason.trim()}
                className={`flex-1 px-4 py-2 text-white rounded-lg disabled:opacity-50 ${
                  actionModal.action === 'deactivate'
                    ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {processing === actionModal.driver?.id ? 'Traitement...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de suppression définitive */}
      <DeleteDriverModal
        driver={driverToDelete}
        isOpen={deleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDeleteDriver}
      />
    </div>
  );
}

