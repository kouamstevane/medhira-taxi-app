"use client";
import { useState, useEffect } from 'react';
import { auth, db, storage } from '../../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';

interface DriverData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  licenseNumber: string;
  car: {
    model: string;
    plate: string;
    color: string;
  };
  status: string;
  isAvailable: boolean;
  documents: {
    licensePhoto: string;
    carRegistration: string;
  };
  profileImageUrl?: string;
}

export default function DriverProfile() {
  const [driver, setDriver] = useState<DriverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<DriverData>>({});
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchDriverData = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          router.push('/driver/login');
          return;
        }

        const docRef = doc(db, 'drivers', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as DriverData;
          setDriver(data);
          setFormData({
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            car: {
              model: data.car.model,
              plate: data.car.plate,
              color: data.car.color
            }
          });
        } else {
          setError("Profil chauffeur non trouvé");
        }
      } catch (error) {
        setError("Erreur de chargement du profil");
      } finally {
        setLoading(false);
      }
    };

    fetchDriverData();
  }, [router]);

  const handleUpdateProfile = async () => {
    if (!auth.currentUser || !formData) return;

    setLoading(true);
    setError(null);

    try {
      const updates: Partial<DriverData> = { ...formData };

      // Upload de la photo de profil si elle existe
      if (profileImage) {
        const storageRef = ref(storage, `drivers/${auth.currentUser.uid}/profile`);
        await uploadBytes(storageRef, profileImage);
        const photoURL = await getDownloadURL(storageRef);
        updates.profileImageUrl = photoURL;
      }

      await updateDoc(doc(db, 'drivers', auth.currentUser.uid), updates);
      setDriver(prev => ({ ...prev!, ...updates }));
      setEditMode(false);
    } catch (error) {
      setError("Erreur lors de la mise à jour");
    } finally {
      setLoading(false);
    }
  };

  const toggleAvailability = async () => {
    if (!auth.currentUser || !driver) return;

    try {
      await updateDoc(doc(db, 'drivers', auth.currentUser.uid), {
        isAvailable: !driver.isAvailable
      });
      setDriver(prev => ({ ...prev!, isAvailable: !prev!.isAvailable }));
    } catch (error) {
      setError("Erreur lors du changement de statut");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f29200]"></div>
      </div>
    );
  }

  if (error || !driver) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <p className="text-red-500">{error}</p>
          <button 
            onClick={() => router.push('/auth/driver/login')}
            className="mt-4 bg-[#f29200] text-white px-4 py-2 rounded"
          >
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-[#101010] text-white p-4 flex items-center">
          {/* Flèche retour */}
  <button
    onClick={() => router.push('/driver/dashboard')}
    className="mr-3 p-2 rounded-full hover:bg-gray-800 transition"
  >
 <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="4" y1="12" x2="20" y2="12" strokeLinecap="round" />
    <polyline points="10 6 4 12 10 18" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
  </button>
        <h1 className="text-2xl font-bold">Profil Chauffeur</h1>
      </div>

      <div className="container mx-auto p-4">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden">
                  {/* Photo de profil */}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{driver.firstName} {driver.lastName}</h2>
                  <p className="text-gray-600">{driver.email}</p>
                </div>
              </div>

              <button
                onClick={() => setEditMode(!editMode)}
                className="bg-[#f29200] text-white px-4 py-2 rounded hover:bg-[#e68600] transition"
              >
                {editMode ? 'Annuler' : 'Modifier'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Informations personnelles</h3>
                
                {editMode ? (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
                      <input
                        type="text"
                        value={formData.firstName || ''}
                        onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                      <input
                        type="text"
                        value={formData.lastName || ''}
                        onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                      <input
                        type="tel"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Photo de profil</label>
                      <input
                        type="file"
                        onChange={(e) => setProfileImage(e.target.files?.[0] || null)}
                        className="w-full p-2 border rounded"
                        accept="image/*"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-2">
                      <span className="text-gray-600">Prénom:</span> {driver.firstName}
                    </div>
                    <div className="mb-2">
                      <span className="text-gray-600">Nom:</span> {driver.lastName}
                    </div>
                    <div className="mb-2">
                      <span className="text-gray-600">Téléphone:</span> {driver.phone}
                    </div>
                    <div className="mb-2">
                      <span className="text-gray-600">Email:</span> {driver.email}
                    </div>
                    <div className="mb-2">
                      <span className="text-gray-600">Numéro de permis:</span> {driver.licenseNumber}
                    </div>
                  </>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4">Informations véhicule</h3>
                
                {editMode ? (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Modèle</label>
                      <input
                        type="text"
                        value={formData.car?.model || ''}
  onChange={(e) => setFormData({
    ...formData,
    car: {
      model: e.target.value,
      plate: formData.car?.plate ?? '',
      color: formData.car?.color ?? ''
    }
  })}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Plaque</label>
                      <input
                        type="text"
                        value={formData.car?.plate || ''}
                        onChange={(e) => setFormData({
                          ...formData, 
                          car: {
                            model: formData.car?.model ?? '',
                            plate: e.target.value,
                            color: formData.car?.color ?? ''
                          }
                        })}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Couleur</label>
                      <input
                        type="text"
                        value={formData.car?.color || ''}
                        onChange={(e) => setFormData({
                          ...formData, 
                          car: {
                            model: formData.car?.model ?? '',
                            plate: formData.car?.plate ?? '',
                            color: e.target.value
                          }
                        })}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-2">
                      <span className="text-gray-600">Modèle:</span> {driver.car.model}
                    </div>
                    <div className="mb-2">
                      <span className="text-gray-600">Plaque:</span> {driver.car.plate}
                    </div>
                    <div className="mb-2">
                      <span className="text-gray-600">Couleur:</span> {driver.car.color}
                    </div>
                  </>
                )}

                <div className="mt-6">
                  <label className="flex items-center space-x-3">
                    <span className="text-gray-700">Disponible pour des courses</span>
                    <button
                      onClick={toggleAvailability}
                      className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${
                        driver.isAvailable ? 'bg-[#f29200]' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block w-4 h-4 transform transition-transform bg-white rounded-full ${
                          driver.isAvailable ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </div>
            </div>

            {editMode && (
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setEditMode(false)}
                  className="px-4 py-2 border border-gray-300 rounded"
                >
                  Annuler
                </button>
                <button
                  onClick={handleUpdateProfile}
                  disabled={loading}
                  className="bg-[#f29200] text-white px-4 py-2 rounded hover:bg-[#e68600] transition"
                >
                  {loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            )}

            {error && <div className="mt-4 text-red-500">{error}</div>}

            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4">Documents</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">Permis de conduire</h4>
                  <a 
                    href={driver.documents.licensePhoto} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[#f29200] hover:underline"
                  >
                    Voir le document
                  </a>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Carte grise</h4>
                  <a 
                    href={driver.documents.carRegistration} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[#f29200] hover:underline"
                  >
                    Voir le document
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}