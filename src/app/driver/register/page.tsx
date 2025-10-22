"use client";
import { useState } from 'react';
import { auth, db, storage } from '../../lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';

export default function DriverRegister() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    licenseNumber: '',
    carModel: '',
    carPlate: '',
    carColor: ''
  });
  const [licensePhoto, setLicensePhoto] = useState<File | null>(null);
  const [carRegistration, setCarRegistration] = useState<File | null>(null);
  const [insurancePhoto, setInsurancePhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleFileChange = (
    setter: React.Dispatch<React.SetStateAction<File | null>>,
    e: React.ChangeEvent<HTMLInputElement>,
    maxSizeMB: number = 5
  ) => {
    const file = e.target.files?.[0] || null;
    
    if (file && file.size > maxSizeMB * 1024 * 1024) {
      setError(`Le fichier ne doit pas dépasser ${maxSizeMB}MB`);
      return;
    }
    
    setter(file);
    setError(null);
  };

  const uploadFile = async (file: File | null, fileType: string) => {
    if (!file) throw new Error('Fichier manquant');
    if (!auth.currentUser) throw new Error('Utilisateur non authentifié');
    
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop();
    const fileName = `${fileType}_${timestamp}.${fileExtension}`;
    
    const storageRef = ref(storage, `drivers/${auth.currentUser.uid}/${fileName}`);
    
    try {
      const snapshot = await uploadBytes(storageRef, file);
      return await getDownloadURL(snapshot.ref);
    } catch (error: any) {
      console.error('Erreur upload:', error);
      throw new Error(`Échec de l'upload du ${fileType}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation des fichiers
    if (!licensePhoto || !carRegistration) {
      setError('Veuillez uploader tous les documents requis');
      setLoading(false);
      return;
    }

    try {
      // 1. Créer le compte utilisateur
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );

      // 2. Upload des documents
      const [licenseUrl, registrationUrl] = await Promise.all([
        uploadFile(licensePhoto, 'license'),
        uploadFile(carRegistration, 'registration'),
        insurancePhoto ? uploadFile(insurancePhoto, 'insurance') : Promise.resolve(null)
      ]);

      // 3. Enregistrer dans la collection drivers
      await setDoc(doc(db, 'drivers', userCredential.user.uid), {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        licenseNumber: formData.licenseNumber,
        car: {
          model: formData.carModel,
          plate: formData.carPlate,
          color: formData.carColor
        },
        documents: {
          licensePhoto: licenseUrl,
          carRegistration: registrationUrl,
          ...(insurancePhoto && { insurance: await uploadFile(insurancePhoto, 'insurance') })
        },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        isAvailable: false,
        rating: 0,
        tripsCompleted: 0
      });

      // 4. Déconnexion et redirection
      await auth.signOut();
      router.push('/auth/driver/verify');

    } catch (error: any) {
      console.error('Erreur complète:', error);
      
      // Gestion d'erreurs spécifiques
      if (error.code === 'auth/email-already-in-use') {
        setError('Cet email est déjà utilisé');
      } else if (error.code === 'auth/weak-password') {
        setError('Le mot de passe doit contenir au moins 6 caractères');
      } else if (error.message.includes('upload')) {
        setError(error.message);
      } else {
        setError(error.message || "Erreur lors de l'inscription");
      }
      
      // Annuler la création du compte en cas d'erreur
      if (auth.currentUser) {
        try {
          await auth.currentUser.delete();
        } catch (deleteError) {
          console.error('Erreur suppression compte:', deleteError);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md w-full max-w-2xl overflow-hidden">
        <div className="bg-[#101010] p-6 text-center text-white">
          <h1 className="text-2xl font-bold">Devenir Chauffeur Medjira</h1>
          <p className="mt-2">Remplissez le formulaire pour postuler</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Colonne gauche - Informations personnelles */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg text-[#101010] border-b pb-2">
              Informations personnelles
            </h3>
            
            {[
              { label: 'Prénom', key: 'firstName', type: 'text' },
              { label: 'Nom', key: 'lastName', type: 'text' },
              { label: 'Email', key: 'email', type: 'email' },
              { label: 'Téléphone', key: 'phone', type: 'tel' },
              { label: 'Mot de passe', key: 'password', type: 'password' },
              { label: 'Numéro de permis', key: 'licenseNumber', type: 'text' }
            ].map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-[#101010] mb-1">
                  {field.label}
                </label>
                <input
                  type={field.type}
                  value={formData[field.key as keyof typeof formData]}
                  onChange={(e) => setFormData({
                    ...formData, 
                    [field.key]: e.target.value
                  })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f29200] focus:border-transparent"
                  required
                  minLength={field.type === 'password' ? 6 : undefined}
                  placeholder={field.label}
                />
              </div>
            ))}
          </div>

          {/* Colonne droite - Informations véhicule et documents */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg text-[#101010] border-b pb-2">
              Informations véhicule
            </h3>
            
            {[
              { label: 'Modèle de voiture', key: 'carModel', type: 'text' },
              { label: 'Plaque d\'immatriculation', key: 'carPlate', type: 'text' },
              { label: 'Couleur du véhicule', key: 'carColor', type: 'text' }
            ].map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-[#101010] mb-1">
                  {field.label}
                </label>
                <input
                  type={field.type}
                  value={formData[field.key as keyof typeof formData]}
                  onChange={(e) => setFormData({
                    ...formData, 
                    [field.key]: e.target.value
                  })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f29200] focus:border-transparent"
                  required
                  placeholder={field.label}
                />
              </div>
            ))}

            {/* Upload des documents */}
            <div className="space-y-4 pt-4">
              <h4 className="font-semibold text-[#101010]">Documents requis</h4>
              
              {[
                {
                  label: 'Photo du permis de conduire',
                  accept: 'image/*,.pdf',
                  setter: setLicensePhoto,
                  required: true
                },
                {
                  label: 'Carte grise du véhicule',
                  accept: 'image/*,.pdf',
                  setter: setCarRegistration,
                  required: true
                },
                {
                  label: 'Assurance (optionnel)',
                  accept: 'image/*,.pdf',
                  setter: setInsurancePhoto,
                  required: false
                }
              ].map((doc, index) => (
                <div key={index}>
                  <label className="block text-sm font-medium text-[#101010] mb-1">
                    {doc.label} {doc.required && '*'}
                  </label>
                  <input
                    type="file"
                    onChange={(e) => handleFileChange(doc.setter, e)}
                    className="w-full p-2 border border-gray-300 rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#f29200] file:text-white hover:file:bg-[#e68600]"
                    accept={doc.accept}
                    required={doc.required}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Bouton de soumission */}
          <div className="md:col-span-2 pt-6 border-t">
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#f29200] hover:bg-[#e68600] text-white font-bold py-3 px-6 rounded-lg transition duration-200 flex items-center justify-center disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Traitement en cours...
                </>
              ) : (
                'Soumettre ma candidature'
              )}
            </button>

            <p className="text-sm text-gray-600 mt-4 text-center">
              * Les documents seront vérifiés par notre équipe sous 48h
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}