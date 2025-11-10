"use client";

import { useState, useEffect } from 'react';
import { auth, db } from '@/config/firebase';
import { collection, query, where, getDocs, updateDoc, doc, Timestamp, getDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

type Driver = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  licenseNumber: string;
  car: {
    model: string;
    plate: string;
    color: string;
  };
  documents: {
    licensePhoto: string;
    carRegistration: string;
    insurance?: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  rejectionReason?: string;
};

export default function AdminDriversPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
  useEffect(() => {
    if (isAdmin) {
      loadDrivers();
    }
  }, [isAdmin, filter]);

  const loadDrivers = async () => {
    try {
      setLoading(true);
      const driversRef = collection(db, 'drivers');
      let q;

      if (filter === 'all') {
        q = query(driversRef);
      } else {
        q = query(driversRef, where('status', '==', filter));
      }

      const querySnapshot = await getDocs(q);
      const driversList: Driver[] = [];
      
      querySnapshot.forEach((doc) => {
        driversList.push({
          id: doc.id,
          ...doc.data()
        } as Driver);
      });

      // Trier par date de création (plus récent en premier)
      driversList.sort((a, b) => {
        const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

      setDrivers(driversList);
    } catch (err) {
      console.error('Erreur chargement chauffeurs:', err);
      setError('Erreur lors du chargement des chauffeurs');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (driverId: string, driverEmail: string, driverName: string) => {
    try {
      setProcessing(driverId);
      setError(null);
      setSuccess(null);

      // Mettre à jour le statut dans Firestore
      const driverRef = doc(db, 'drivers', driverId);
      await updateDoc(driverRef, {
        status: 'approved',
        updatedAt: new Date(),
        approvedAt: new Date(),
        approvedBy: currentUser.uid
      });

      // Envoyer l'email d'approbation
      await sendApprovalEmail(driverEmail, driverName);

      setSuccess(`Le compte de ${driverName} a été approuvé avec succès`);
      setSelectedDriver(null);
      loadDrivers();
    } catch (err: any) {
      console.error('Erreur approbation:', err);
      setError(`Erreur lors de l'approbation: ${err.message}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (driverId: string, driverEmail: string, driverName: string) => {
    if (!rejectionReason.trim()) {
      setError('Veuillez indiquer la raison du refus');
      return;
    }

    try {
      setProcessing(driverId);
      setError(null);
      setSuccess(null);

      // Envoyer l'email de refus AVANT la suppression
      await sendRejectionEmail(driverEmail, driverName, rejectionReason.trim());

      // Supprimer complètement le compte de la base de données
      // Cela permet à l'utilisateur de soumettre une nouvelle demande
      const driverRef = doc(db, 'drivers', driverId);
      
      try {
        await deleteDoc(driverRef);
        console.log(`✅ Compte chauffeur ${driverId} supprimé après refus`);
      } catch (deleteError: any) {
        console.error('Erreur lors de la suppression du compte:', deleteError);
        // Si la suppression échoue, on marque quand même le compte comme refusé
        // pour éviter qu'il ne soit pas traité
        await updateDoc(driverRef, {
          status: 'rejected',
          rejectionReason: rejectionReason.trim(),
          rejectedAt: new Date(),
          rejectedBy: currentUser.uid,
          updatedAt: new Date(),
        });
        throw new Error(`Le compte a été marqué comme refusé, mais la suppression a échoué: ${deleteError.message}. Veuillez supprimer manuellement le compte ${driverId}.`);
      }

      // Afficher le succès même si l'email a échoué (l'erreur est déjà gérée dans sendRejectionEmail)
      setSuccess(`Le compte de ${driverName} a été refusé et supprimé. L'utilisateur peut soumettre une nouvelle demande.`);
      setSelectedDriver(null);
      setRejectionReason('');
      loadDrivers();
    } catch (err: any) {
      console.error('Erreur refus:', err);
      setError(`Erreur lors du refus: ${err.message}`);
    } finally {
      setProcessing(null);
    }
  };

  const sendApprovalEmail = async (email: string, name: string) => {
    try {
      const response = await fetch('/api/admin/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: email,
          type: 'approval',
          driverName: name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Erreur lors de l\'envoi de l\'email');
      }

      console.log('✅ Email d\'approbation envoyé avec succès:', data);
    } catch (err: any) {
      console.error('❌ Erreur envoi email d\'approbation:', err);
      // Afficher l'erreur à l'utilisateur mais ne pas bloquer l'approbation
      setError(`Le compte a été approuvé, mais l'email n'a pas pu être envoyé: ${err.message || 'Erreur inconnue'}`);
      // Ne pas bloquer l'approbation si l'email échoue
    }
  };

  const sendRejectionEmail = async (email: string, name: string, reason: string) => {
    try {
      const response = await fetch('/api/admin/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: email,
          type: 'rejection',
          driverName: name,
          reason: reason,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Erreur lors de l\'envoi de l\'email');
      }

      console.log('✅ Email de refus envoyé avec succès:', data);
    } catch (err: any) {
      console.error('❌ Erreur envoi email de refus:', err);
      // Afficher l'erreur à l'utilisateur mais ne pas bloquer le refus
      setError(`Le compte a été refusé, mais l'email n'a pas pu être envoyé: ${err.message || 'Erreur inconnue'}`);
      // Ne pas bloquer le refus si l'email échoue
    }
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
              <p className="text-gray-300 text-sm mt-1">Gérez les demandes d'inscription des chauffeurs</p>
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
                            <div className="text-sm text-gray-500">Permis: {driver.licenseNumber}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{driver.email}</div>
                        <div className="text-sm text-gray-500">{driver.phone}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{driver.car.model}</div>
                        <div className="text-sm text-gray-500">
                          {driver.car.plate} • {driver.car.color}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(driver.status)}
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
                        {driver.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(driver.id, driver.email, `${driver.firstName} ${driver.lastName}`)}
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
                      <img
                        src={selectedDriver.documents.licensePhoto}
                        alt="Permis de conduire"
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
                      <img
                        src={selectedDriver.documents.carRegistration}
                        alt="Carte grise"
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
                        <img
                          src={selectedDriver.documents.insurance}
                          alt="Assurance"
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
                      onClick={() => handleApprove(selectedDriver.id, selectedDriver.email, `${selectedDriver.firstName} ${selectedDriver.lastName}`)}
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
                        onClick={() => handleReject(selectedDriver.id, selectedDriver.email, `${selectedDriver.firstName} ${selectedDriver.lastName}`)}
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
    </div>
  );
}

