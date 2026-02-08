"use client";
/* eslint-disable */
import { useState, useEffect } from 'react';
import { auth, db, storage } from '../../../config/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc, query, collection, where, getDocs, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import { sendVerificationEmail } from '@/services/auth.service';

export default function DriverRegister() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
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
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [needsAuthentication, setNeedsAuthentication] = useState(false);
  const router = useRouter();

  // Vérifier si l'utilisateur est déjà connecté
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsExistingUser(true);
        
        // Pré-remplir les champs avec les données de l'utilisateur
        setFormData(prev => ({
          ...prev,
          email: user.email || '',
          firstName: user.displayName?.split(' ')[0] || '',
          lastName: user.displayName?.split(' ')[1] || '',
        }));
        
        // Vérifier si l'utilisateur est déjà chauffeur
        const driverDoc = await getDoc(doc(db, 'drivers', user.uid));
        if (driverDoc.exists()) {
          const driverData = driverDoc.data();
          // Si le compte est refusé, permettre la recréation
          if (driverData.status === 'rejected') {
            console.log('Compte refusé détecté, suppression pour permettre la recréation');
            await deleteDoc(doc(db, 'drivers', user.uid));
          } else {
          setError('Vous êtes déjà enregistré comme chauffeur');
          setTimeout(() => router.push('/driver/login'), 2000);
            return;
          }
        }
      } else {
        setIsExistingUser(false);
      }
    });
    
    return () => unsubscribe();
  }, [router]);

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

  const uploadFile = async (file: File | null, fileType: string, userId?: string) => {
    if (!file) throw new Error('Fichier manquant');
    
    // Utiliser l'userId fourni ou celui de l'utilisateur actuel
    const targetUserId = userId || auth.currentUser?.uid;
    if (!targetUserId) throw new Error('Utilisateur non authentifié');
    
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop();
    const fileName = `${fileType}_${timestamp}.${fileExtension}`;
    
    const storageRef = ref(storage, `drivers/${targetUserId}/${fileName}`);
    
    try {
      const snapshot = await uploadBytes(storageRef, file);
      return await getDownloadURL(snapshot.ref);
    } catch (error: any) {
      console.error('Erreur upload:', error);
      throw new Error(`Échec de l'upload du ${fileType}: ${error.message}`);
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

    // Validation du mot de passe seulement si l'utilisateur n'est pas connecté
    if (!isExistingUser && !formData.password) {
      setError('Veuillez entrer un mot de passe');
      setLoading(false);
      return;
    }

    try {
      let userId: string;
      let userCredential: any = null;
      
      // 1. Gérer l'authentification
      if (isExistingUser && auth.currentUser) {
        // L'utilisateur est déjà connecté, utiliser son compte existant
        userId = auth.currentUser.uid;
        
        // Vérifier si déjà chauffeur
        const driverCheck = await getDoc(doc(db, 'drivers', userId));
        if (driverCheck.exists()) {
          const driverData = driverCheck.data();
          // Si le compte est refusé, permettre la recréation en le supprimant
          if (driverData.status === 'rejected') {
            console.log('Compte refusé détecté, suppression pour permettre la recréation');
            await deleteDoc(doc(db, 'drivers', userId));
          } else {
          setError('Vous êtes déjà enregistré comme chauffeur');
          router.push('/driver/login');
          return;
          }
        }
      } else {
        // L'utilisateur n'est pas connecté
        // Vérifier d'abord si un compte chauffeur refusé existe avec cet email
        // (même si l'utilisateur n'est pas connecté, on peut avoir un compte refusé)
        try {
          const emailQuery = query(
            collection(db, 'drivers'),
            where('email', '==', formData.email),
            where('status', '==', 'rejected')
          );
          const emailQuerySnapshot = await getDocs(emailQuery);
          
          // Supprimer tous les comptes refusés avec cet email
          if (!emailQuerySnapshot.empty) {
            console.log(`Comptes refusés trouvés pour ${formData.email}, suppression...`);
            const deletePromises = emailQuerySnapshot.docs.map(driverDoc => {
              // Note: La suppression nécessite que l'utilisateur soit connecté
              // On va d'abord créer/connecter l'utilisateur, puis supprimer
              return driverDoc.ref;
            });
            // On supprimera après la connexion/création du compte
          }
        } catch (queryError: any) {
          console.warn('Erreur lors de la recherche de comptes refusés:', queryError);
          // Continuer même si la requête échoue
        }

        // Vérifier d'abord si le compte existe en tentant de se connecter
        try {
          console.log('Tentative de connexion avec:', formData.email);
          const signInResult = await signInWithEmailAndPassword(
            auth,
            formData.email,
            formData.password
          );
          userId = signInResult.user.uid;
          userCredential = signInResult;
          console.log('Connexion réussie, userId:', userId);
          
          // Vérifier si déjà chauffeur
          const driverCheck = await getDoc(doc(db, 'drivers', userId));
          if (driverCheck.exists()) {
            const driverData = driverCheck.data();
            // Si le compte est refusé, permettre la recréation en le supprimant
            if (driverData.status === 'rejected') {
              console.log('Compte refusé détecté, suppression pour permettre la recréation');
              try {
                await deleteDoc(doc(db, 'drivers', userId));
                console.log('✅ Compte refusé supprimé avec succès');
              } catch (deleteError: any) {
                console.error('Erreur lors de la suppression du compte refusé:', deleteError);
                // Si la suppression échoue (permissions), on continue quand même
                // L'admin devra le supprimer manuellement
                setError('Un compte refusé existe. Veuillez contacter l\'administrateur pour le supprimer.');
                setLoading(false);
                return;
              }
            } else {
            setError('Vous êtes déjà enregistré comme chauffeur');
            router.push('/driver/login');
            return;
            }
          }
          
          // Supprimer aussi les autres comptes refusés avec le même email (si l'utilisateur a plusieurs comptes)
          try {
            const emailQuery = query(
              collection(db, 'drivers'),
              where('email', '==', formData.email),
              where('status', '==', 'rejected')
            );
            const emailQuerySnapshot = await getDocs(emailQuery);
            if (!emailQuerySnapshot.empty) {
              console.log(`Suppression de ${emailQuerySnapshot.size} compte(s) refusé(s) avec le même email`);
              // Note: On ne peut supprimer que notre propre compte, les autres nécessitent l'admin
              // Mais on peut au moins essayer
              for (const driverDoc of emailQuerySnapshot.docs) {
                if (driverDoc.id === userId) {
                  // Déjà supprimé ci-dessus
                  continue;
                }
                // Pour les autres comptes, on ne peut pas les supprimer sans être admin
                // Mais on peut les ignorer car on va créer un nouveau compte
              }
            }
          } catch (queryError: any) {
            console.warn('Erreur lors de la recherche de comptes refusés:', queryError);
          }
        } catch (signInError: any) {
          console.log('Erreur de connexion:', signInError.code, signInError.message);
          if (signInError.code === 'auth/user-not-found' || signInError.code === 'auth/wrong-password' || signInError.code === 'auth/invalid-credential') {
            // Le compte n'existe pas, créer un nouveau compte
            console.log('Création d\'un nouveau compte pour:', formData.email);
            try {
              userCredential = await createUserWithEmailAndPassword(
              auth,
              formData.email,
              formData.password
            );
            userId = userCredential.user.uid;
              console.log('Compte créé avec succès, userId:', userId);
              
              // Attendre un peu pour s'assurer que Firebase Auth est bien synchronisé
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // Après création, vérifier s'il y a des comptes refusés avec le même email
              // (peu probable mais possible si l'email a été utilisé avant)
              try {
                const emailQuery = query(
                  collection(db, 'drivers'),
                  where('email', '==', formData.email),
                  where('status', '==', 'rejected')
                );
                const emailQuerySnapshot = await getDocs(emailQuery);
                if (!emailQuerySnapshot.empty) {
                  console.log(`⚠️ ${emailQuerySnapshot.size} compte(s) refusé(s) trouvé(s) avec le même email`);
                  // Ces comptes ne peuvent pas être supprimés car ils appartiennent à d'autres utilisateurs
                  // Mais on peut créer un nouveau compte quand même
                }
              } catch (queryError: any) {
                console.warn('Erreur lors de la recherche de comptes refusés:', queryError);
              }
            } catch (createError: any) {
              console.error('Erreur lors de la création du compte:', createError);
              throw createError;
            }
          } else {
            throw signInError;
          }
        }
      }

      console.log('Upload des documents pour userId:', userId);
      
      // 2. Upload des documents (passer userId explicitement)
      const [licenseUrl, registrationUrl, insuranceUrl] = await Promise.all([
        uploadFile(licensePhoto, 'license', userId),
        uploadFile(carRegistration, 'registration', userId),
        insurancePhoto ? uploadFile(insurancePhoto, 'insurance', userId) : Promise.resolve(null)
      ]);

      console.log('Documents uploadés avec succès');

      // 3. Enregistrer dans la collection drivers
      const driverData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        licenseNumber: formData.licenseNumber,
        car: {
          model: formData.carModel,
          plate: formData.carPlate,
          color: formData.carColor
        },
        documents: {
          licensePhoto: licenseUrl,
          carRegistration: registrationUrl,
          ...(insuranceUrl && { insurance: insuranceUrl })
        },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        isAvailable: false,
        rating: 0,
        tripsCompleted: 0
      };

      console.log('Enregistrement du chauffeur dans Firestore...');
      await setDoc(doc(db, 'drivers', userId), driverData);
      console.log('Chauffeur enregistré avec succès');

      // 4. Envoyer l'email de vérification
      try {
        if (auth.currentUser) {
          await sendVerificationEmail(auth.currentUser);
          console.log('Email de vérification envoyé avec succès');
        }
      } catch (emailError) {
        console.error('Erreur lors de l\'envoi de l\'email de vérification:', emailError);
        // On continue quand même, l'utilisateur peut renvoyer l'email depuis la page de vérification
      }

      // 5. Redirection vers la page de vérification email
      router.push('/driver/verify-email');

    } catch (error: any) {
      console.error('Erreur complète:', error);
      console.error('Code erreur:', error.code);
      console.error('Message erreur:', error.message);
      
      // Gestion d'erreurs spécifiques
      if (error.code === 'auth/email-already-in-use') {
        setError('Cet email est déjà utilisé. Si vous avez déjà un compte, veuillez vous connecter d\'abord.');
      } else if (error.code === 'auth/weak-password') {
        setError('Le mot de passe doit contenir au moins 6 caractères');
      } else if (error.code === 'auth/wrong-password') {
        setError('Mot de passe incorrect. Veuillez réessayer.');
      } else if (error.code === 'auth/network-request-failed') {
        setError('Erreur de connexion réseau. Veuillez vérifier votre connexion Internet et réessayer.');
      } else if (error.code === 'auth/invalid-email') {
        setError('Adresse email invalide. Veuillez vérifier et réessayer.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setError('L\'inscription par email/mot de passe n\'est pas activée. Contactez l\'administrateur.');
      } else if (error.message.includes('upload')) {
        setError(error.message);
      } else {
        setError(`Erreur lors de l'inscription: ${error.message || error.code || 'Erreur inconnue'}`);
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

        {isExistingUser && (
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 m-6 mb-0">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  Vous êtes déjà connecté. Pas besoin de saisir votre mot de passe.
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Colonne gauche - Informations personnelles */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg text-[#101010] border-b pb-2">
              Informations personnelles
            </h3>
            
            {[
              { label: 'Prénom', key: 'firstName', type: 'text' },
              { label: 'Nom', key: 'lastName', type: 'text' },
              { label: 'Email', key: 'email', type: 'email', disabled: isExistingUser },
              { label: 'Mot de passe', key: 'password', type: 'password', hidden: isExistingUser },
              { label: 'Numéro de permis', key: 'licenseNumber', type: 'text' }
            ]
            .filter(field => !field.hidden)
            .map((field) => (
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
                  disabled={field.disabled}
                  className={`w-full p-3 border border-gray-300 rounded-lg text-[#101010] placeholder-gray-400 focus:ring-2 focus:ring-[#f29200] focus:border-transparent ${field.disabled ? 'bg-gray-100 cursor-not-allowed text-gray-500' : 'bg-white'}`}
                  required={field.key !== 'password' || !isExistingUser}
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
                  className="w-full p-3 border border-gray-300 rounded-lg text-[#101010] placeholder-gray-400 bg-white focus:ring-2 focus:ring-[#f29200] focus:border-transparent"
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