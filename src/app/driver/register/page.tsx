"use client";
/* eslint-disable */
import { useState, useEffect } from 'react';
import { auth, db, storage } from '../../../config/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import { AuthService, signInWithGoogleForDriver } from '@/services';
import { serverEncryptionService } from '../../../services/server-encryption.service';
import { auditLoggingService } from '../../../services/audit-logging.service';

// Import des étapes
import Step1Intent, { Step1FormData } from './components/Step1Intent';
import Step2Identity, { Step2FormData } from './components/Step2Identity';
import Step3Vehicle, { Step3FormData } from './components/Step3Vehicle';
import Step4Compliance, { Step4Files } from './components/Step4Compliance';
import Step5Monetization, { Step5FormData } from './components/Step5Monetization';
import { AlertCircle, FileEdit, LogOut, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';

export default function DriverRegisterWizard() {
  const router = useRouter();
  const { toasts, removeToast } = useToast();

  // ----- ÉTATS DU WIZARD -----
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExistingUser, setIsExistingUser] = useState(false);

  // ----- DONNÉES ACCUMULÉES -----
  const [step1Data, setStep1Data] = useState<Partial<Step1FormData>>({});
  const [step2Data, setStep2Data] = useState<Partial<Step2FormData>>({});
  const [biometricsPhoto, setBiometricsPhoto] = useState<File | null>(null);
  
  const [step3Data, setStep3Data] = useState<Partial<Step3FormData>>({});
  const [vehicleFiles, setVehicleFiles] = useState<{ registration?: File; insurance?: File; techControl?: File; interiorPhoto?: File; exteriorPhoto?: File }>({});
  
  const [complianceFiles, setComplianceFiles] = useState<{ idFront?: File; idBack?: File; licenseFront?: File; licenseBack?: File }>({});

  const [rejectionCode, setRejectionCode] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  // Vérifier si l'utilisateur est déjà connecté (pour l'étape 1)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsExistingUser(true);
        setStep1Data(prev => ({
          ...prev,
          email: user.email || '',
        }));
        
        // Vérifier si un brouillon ou un rejet existe déjà
        const driverDoc = await getDoc(doc(db, 'drivers', user.uid));
        if (driverDoc.exists()) {
          const data = driverDoc.data();
          if (data.status === 'action_required' || data.status === 'rejected') {
             // Handle Rejections
             setRejectionCode(data.rejectionCode || 'R000');
             setRejectionReason(data.rejectionReason || data.rejectionMessage || 'Votre dossier nécessite une action de votre part.');
          } else if (data.status === 'draft') {
            // Reprendre au bon endroit en fonction des données existantes ?
            // Pour simplifier on le laisse à l'étape 2 (Identité) avec pré-remplissage si possible
            // NOTE: Le SSN est maintenant chiffré, on ne peut pas le pré-remplir pour l'affichage
            // L'utilisateur devra le saisir à nouveau s'il revient sur cette étape
             setStep2Data({
                 firstName: data.firstName || '',
                 lastName: data.lastName || '',
                 dob: data.dob || '',
                 nationality: data.nationality || 'FR',
                 ssn: '', // SSN chiffré non affiché par sécurité (l'utilisateur doit le resaisir)
                 address: data.address || '',
                 city: data.city || '',
                 zipCode: data.zipCode || '',
             });
             setCurrentStep(2);
          } else {
             setError('Votre dossier est en cours de traitement ou déjà validé.');
             setTimeout(() => router.push('/driver/dashboard'), 2000);
          }
        }
      } else {
        setIsExistingUser(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // ----- HANDLERS ÉTAPE PAR ÉTAPE -----

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      // ✅ CORRECTION : Utiliser signInWithGoogleForDriver() au lieu de AuthService.signInWithGoogle()
      // Cela crée le document approprié avec userType: 'chauffeur' dans la collection users
      // et un document dans la collection drivers avec le statut 'draft'
      const user = await signInWithGoogleForDriver();
      
      const names = user.displayName?.split(' ') || [];
      const first = names[0] || '';
      const last = names.length > 1 ? names.slice(1).join(' ') : '';
      
      setStep1Data({ email: user.email || '' });
      setStep2Data(prev => ({ ...prev, firstName: first, lastName: last }));
      
      // La vérification d'existant est gérée par onAuthStateChanged dans tous les cas
      setCurrentStep(2);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(error);
      setError("Erreur : " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStep1Next = async (data: Step1FormData) => {
    setLoading(true);
    setError(null);
    try {
      if (!isExistingUser) {
        // Create user
        await createUserWithEmailAndPassword(auth, data.email, data.password);
      }
      
      // Vérification explicite de l'email avant de continuer
      const user = auth.currentUser;
      if (!user?.emailVerified) {
        setError("Veuillez vérifier votre email avant de continuer.");
        if (user) {
          await sendEmailVerification(user);
        }
        return;
      }
      
      setStep1Data(data);
      setCurrentStep(2);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError("Cet email est déjà utilisé. Essayez de vous connecter.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStep2Next = async (data: Step2FormData, photo: File | null) => {
    setLoading(true);
    setError(null);
    try {
       setStep2Data(data);
       setBiometricsPhoto(photo);

       const user = auth.currentUser;
       const userId = user?.uid;
       if (!userId) throw new Error("Utilisateur non connecté");

       // Vérifier que l'email est toujours vérifié avant de sauvegarder le brouillon
       if (!user.emailVerified) {
           setError("Votre email doit être vérifié avant de continuer. Veuillez vérifier votre boîte mail.");
           // Renvoyer l'email de vérification si nécessaire
           await sendEmailVerification(user);
           return;
       }

       // SÉCURITÉ RGPD: Chiffrer immédiatement le SSN, même pour le brouillon
       // Le SSN ne doit JAMAIS être stocké en clair, même temporairement
       let encryptedSsn = null;
       if (data.ssn) {
           try {
               encryptedSsn = await serverEncryptionService.encryptSSN(data.ssn);
               // Audit logging: SSN chiffré avec succès
               await auditLoggingService.logSSNEncryption(userId, true);
           } catch (encryptError: any) {
               console.error('Erreur lors du chiffrement du SSN:', encryptError);
               // Audit logging: Échec du chiffrement SSN
               await auditLoggingService.logSSNEncryption(userId, false, encryptError.message);
               setError(encryptError.message || "Erreur lors de la sécurisation de vos données. Veuillez réessayer.");
               return;
           }
       }

       // Sauvegarde en brouillon avec SSN CHIFFRÉ (conformité RGPD)
       const draftData = {
           firstName: data.firstName,
           lastName: data.lastName,
           email: step1Data.email || user.email || '',
           phone: step1Data.phone || '',
           dob: data.dob,
           nationality: data.nationality,
           address: data.address,
           city: data.city,
           zipCode: data.zipCode,
           ssn: encryptedSsn, // SSN chiffré immédiatement (conformité RGPD)
           status: 'draft',
           createdAt: new Date(),
           updatedAt: new Date()
       };

       await setDoc(doc(db, 'drivers', userId), draftData, { merge: true });
       
       // Audit logging: Brouillon sauvegardé
       await auditLoggingService.logDriverDraftSaved(userId, 2);
       
       setCurrentStep(3);

    } catch (err: unknown) {
      const error = err as Error;
      console.error(error);
      setError("Erreur finale : " + error.message);
    } finally {
        setLoading(false);
    }
  };

  const handleStep3Next = (data: Step3FormData, files: any) => {
    setStep3Data(data);
    setVehicleFiles(files);
    setCurrentStep(4);
  };

  const handleStep4Next = (files: Step4Files) => {
    setComplianceFiles(files);
    setCurrentStep(5);
  };

  // ----- UPLOAD HELPER -----
  const uploadFile = async (file: File | null, fileCategory: string, userId: string) => {
    if (!file) return null;
    const extension = file.name.split('.').pop() || 'tmp';
    const storageRef = ref(storage, `drivers/${userId}/${fileCategory}/${Date.now()}.${extension}`);
    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
  };

  const handleStep5FinalSubmit = async (data: Step5FormData) => {
    setLoading(true);
    setError(null);

    // Tracker pour les fichiers uploadés (pour nettoyage en cas d'erreur)
    const uploadedFiles: string[] = [];

    // Déclarer userId avant le bloc try pour qu'il soit accessible dans le bloc catch
    const user = auth.currentUser;
    const userId = user?.uid;
    if (!userId) throw new Error("Utilisateur non connecté");

    try {

        // Vérification explicite de l'email avant soumission finale
        if (!user?.emailVerified) {
            setError("Veuillez vérifier votre email avant de soumettre votre dossier.");
            await sendEmailVerification(user);
            return;
        }

        // 1. Upload tous les fichiers lourds (Vehicle + Compliance + Biometric)
        // Utiliser Promise.allSettled pour continuer même si certains uploads échouent
        const uploadResults = await Promise.allSettled([
            uploadFile(biometricsPhoto, 'biometrics', userId),
            uploadFile(vehicleFiles.registration!, 'documents', userId),
            uploadFile(vehicleFiles.insurance || null, 'documents', userId),
            uploadFile(vehicleFiles.techControl!, 'documents', userId),
            uploadFile(vehicleFiles.exteriorPhoto!, 'vehicle_photos', userId),
            uploadFile(vehicleFiles.interiorPhoto!, 'vehicle_photos', userId),
            uploadFile(complianceFiles.idFront!, 'compliance', userId),
            uploadFile(complianceFiles.idBack!, 'compliance', userId),
            uploadFile(complianceFiles.licenseFront!, 'compliance', userId),
            uploadFile(complianceFiles.licenseBack!, 'compliance', userId),
        ]);

        // Vérifier les résultats et extraire les URLs
        const [
            bioResult, regResult, insResult, techResult, extResult, intResult,
            idFrontResult, idBackResult, licFrontResult, licBackResult
        ] = uploadResults;

        // Si un upload a échoué, nettoyer les fichiers réussis et retourner une erreur
        const failedUploads = uploadResults.filter(r => r.status === 'rejected');
        if (failedUploads.length > 0) {
            // Nettoyer les fichiers uploadés avec succès
            const successfulUrls = uploadResults
                .filter(r => r.status === 'fulfilled' && r.value)
                .map(r => (r as PromiseFulfilledResult<string>).value);

            // Nettoyer les fichiers via la Cloud Function avec droits admin
            if (successfulUrls.length > 0) {
                try {
                    const { getFunctions, httpsCallable } = await import('firebase/functions');
                    const functions = getFunctions();
                    const cleanupFailedUploads = httpsCallable(functions, 'cleanupFailedUploads');
                    
                    await cleanupFailedUploads({ fileUrls: successfulUrls });
                    console.log('Fichiers uploadés nettoyés après échec:', successfulUrls.length);
                } catch (cleanupError: any) {
                    console.error('Erreur lors du nettoyage des fichiers:', cleanupError);
                    // On continue quand même, l'erreur de nettoyage ne doit pas bloquer
                }
            }

            setError("Erreur lors de l'upload de certains fichiers. Veuillez réessayer.");
            return;
        }

        // Extraire les URLs des uploads réussis
        const bioUrl = bioResult.status === 'fulfilled' ? bioResult.value : null;
        const regUrl = regResult.status === 'fulfilled' ? regResult.value : null;
        const insUrl = insResult.status === 'fulfilled' ? insResult.value : null;
        const techUrl = techResult.status === 'fulfilled' ? techResult.value : null;
        const extUrl = extResult.status === 'fulfilled' ? extResult.value : null;
        const intUrl = intResult.status === 'fulfilled' ? intResult.value : null;
        const idFrontUrl = idFrontResult.status === 'fulfilled' ? idFrontResult.value : null;
        const idBackUrl = idBackResult.status === 'fulfilled' ? idBackResult.value : null;
        const licFrontUrl = licFrontResult.status === 'fulfilled' ? licFrontResult.value : null;
        const licBackUrl = licBackResult.status === 'fulfilled' ? licBackResult.value : null;

        // NOTE: Le SSN est déjà chiffré depuis l'étape 2 (brouillon)
        // Pas besoin de le rechiffrer ici, on utilise directement la valeur du brouillon
        
        // 2.5. Valider les données bancaires avant chiffrement (Cloud Function)
        let encryptedBank = null;
        if (data.accountHolder && data.iban && data.bic) {
            try {
                // Importer les fonctions Firebase
                const { getFunctions, httpsCallable } = await import('firebase/functions');
                const functions = getFunctions();
                
                // Valider les données bancaires côté serveur
                const validateBankDetails = httpsCallable(functions, 'validateBankDetails');
                const validationResult = await validateBankDetails({
                    accountHolder: data.accountHolder,
                    iban: data.iban,
                    bic: data.bic
                });

                // Vérifier le résultat de la validation avec typage correct
                const result = validationResult.data as { isValid: boolean; errors: { [key: string]: string } };
                if (!result.isValid) {
                    const errorMessages = Object.values(result.errors).join(', ');
                    // Audit logging: Échec validation bancaire
                    await auditLoggingService.logBankValidation(userId, false, result.errors);
                    setError(`Coordonnées bancaires invalides: ${errorMessages}`);
                    return;
                }

                // Audit logging: Validation bancaire réussie
                await auditLoggingService.logBankValidation(userId, true);

                // Si la validation réussit, chiffrer les données bancaires
                try {
                    encryptedBank = await serverEncryptionService.encryptBankData(
                        data.accountHolder,
                        data.iban,
                        data.bic
                    );
                    // Audit logging: Chiffrement bancaire réussi
                    await auditLoggingService.logBankEncryption(userId, true);
                } catch (bankEncryptError: any) {
                    // Audit logging: Échec chiffrement bancaire
                    await auditLoggingService.logBankEncryption(userId, false, bankEncryptError.message);
                    throw bankEncryptError;
                }
            } catch (encryptError: any) {
                console.error('Erreur lors du traitement des données bancaires:', encryptError);
                // Gérer les erreurs spécifiques
                if (encryptError.code === 'resource-exhausted') {
                    await auditLoggingService.logRateLimitExceeded(userId, 'bank_validation');
                    setError('Trop de tentatives. Veuillez réessayer dans une minute.');
                } else if (encryptError.code === 'unauthenticated') {
                    await auditLoggingService.logUnauthorizedAccess(userId, 'bank_validation', 'User not authenticated');
                    setError('Vous devez être connecté pour effectuer cette action.');
                } else {
                    setError(encryptError.message || "Erreur lors du traitement de vos données bancaires. Veuillez réessayer.");
                }
                return;
            }
        }

        // 3. Mettre à jour Firestore avec le statut pending
        const finalDriverData = {
           // Données précédentes (Identity) ont déjà été sauvegardées en "merge", mais on les remet au cas où
           firstName: step2Data.firstName,
           lastName: step2Data.lastName,
           email: step1Data.email || auth.currentUser?.email || '',
           phone: step1Data.phone || '',
           dob: step2Data.dob,
           nationality: step2Data.nationality,
           address: step2Data.address,
           city: step2Data.city,
           zipCode: step2Data.zipCode,
           ssn: step2Data.ssn, // SSN déjà chiffré depuis l'étape 2

           // Nouveautés Étape 3 (Véhicule)
           car: {
               brand: step3Data.carBrand,
               model: step3Data.carModel,
               year: step3Data.productionYear,
               color: step3Data.carColor,
               seats: step3Data.passengerSeats,
               fuelType: step3Data.fuelType,
               mileage: step3Data.mileage,
               techControlDate: step3Data.techControlDate
           },

           // Identité Bancaire (Étape 5) - CHIFFRÉE
           bank: encryptedBank, // { data, iv, salt } - Données bancaires chiffrées

           // URLs des documents uploadés
           documents: {
               biometricPhoto: bioUrl,
               carRegistration: regUrl,
               insurance: insUrl || null,
               techControl: techUrl,
               vehicleExterior: extUrl,
               vehicleInterior: intUrl,
               idFront: idFrontUrl,
               idBack: idBackUrl,
               licenseFront: licFrontUrl,
               licenseBack: licBackUrl
           },

           status: 'pending', // Passe de draft à pending
           updatedAt: new Date(),
           isAvailable: false,
           rating: 0,
           tripsCompleted: 0
        };

        await setDoc(doc(db, 'drivers', userId), finalDriverData, { merge: true });

        // Audit logging: Inscription chauffeur complétée
        await auditLoggingService.logDriverRegistrationCompleted(userId);

        // Redirection vers vérification email (comme dans l'ancien flux)
        router.push('/driver/verify-email');

    } catch (err: any) {
        console.error(err);
        // Audit logging: Échec inscription
        await auditLoggingService.logDriverRegistrationFailed(userId, err.message);
        setError("Erreur finale d'inscription: " + err.message);
    } finally {
        setLoading(false);
    }
  };

  // ----- REJECTIONS UI HANDLERS -----
  const handleFixRejection = () => {
      if (rejectionCode === 'R001' || rejectionCode === 'R004') {
          // Documents illisibles (ID)
          setRejectionCode(null);
          setCurrentStep(4);
      } else if (rejectionCode === 'R002' || rejectionCode === 'R003') {
          // Vehicule expiré ou problème
          setRejectionCode(null);
          setCurrentStep(3);
      } else {
          // Par defaut, on rouvre le wizard à l'étape 2 (profile) 
          setRejectionCode(null);
          setCurrentStep(2);
      }
  }

  const handleLogout = async () => {
     await auth.signOut();
     router.push('/');
  }

  if (rejectionCode) {
      return (
         <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
             <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8 text-center border-t-4 border-red-500">
                  <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
                      <AlertCircle className="h-8 w-8 text-red-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-[#101010] mb-2">Action Requise</h2>
                  <p className="text-gray-600 mb-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <span className="font-mono text-xs text-red-500 block mb-1">Code: {rejectionCode}</span>
                      {rejectionReason}
                  </p>

                  <div className="space-y-3 mt-8">
                       {rejectionCode !== 'R005' && ( // R005 = Casier (Definitif)
                           <button onClick={handleFixRejection} className="w-full flex items-center justify-center bg-[#f29200] text-white py-4 rounded-xl font-bold hover:bg-[#e68600] transition-colors">
                               <FileEdit className="mr-2" size={20} /> Mettre à jour mon dossier
                           </button>
                       )}
                       
                       {rejectionCode === 'R006' && ( // Liste d'attente
                            <p className="text-sm text-gray-500 italic mb-4">Nous vous recontacterons dès qu'une place se libérera dans votre zone.</p>
                       )}

                       <button onClick={handleLogout} className="w-full flex items-center justify-center bg-white border border-gray-300 text-gray-700 py-4 rounded-xl font-bold hover:bg-gray-50 transition-colors">
                           <LogOut className="mr-2" size={20} /> Se déconnecter
                       </button>
                  </div>
             </div>
         </div>
      );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      {/* Toast Container */}
      <ToastContainer toasts={toasts} onRemove={removeToast} position="top-right" />
      
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
        
        {/* PROGRESS BAR */}
        <div className="h-2 w-full bg-gray-200">
             <div
                className="h-full bg-[#f29200] transition-all duration-300"
                style={{ width: `${(currentStep / 6) * 100}%` }}
             ></div>
        </div>

        <div className="p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex border border-red-200">
                <svg className="w-5 h-5 mr-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {error}
              </div>
            )}

            {currentStep === 1 && (
                <Step1Intent 
                    onNext={handleStep1Next} 
                    onGoogleSignIn={handleGoogleSignIn}
                    loading={loading}
                    initialData={step1Data}
                />
            )}
            
            {currentStep === 2 && (
                <Step2Identity
                    onNext={handleStep2Next}
                    onBack={() => setCurrentStep(1)}
                    loading={loading}
                    initialData={step2Data}
                />
            )}

            {currentStep === 3 && (
                <Step3Vehicle
                    onNext={handleStep3Next}
                    onBack={() => setCurrentStep(2)}
                    loading={loading}
                    initialData={step3Data}
                />
            )}

            {currentStep === 4 && (
                <Step4Compliance 
                    onNext={handleStep4Next} 
                    onBack={() => setCurrentStep(3)}
                    loading={loading}
                />
            )}

            {currentStep === 5 && (
                 <Step5Monetization 
                     onSubmitFinal={handleStep5FinalSubmit} 
                     onBack={() => setCurrentStep(4)}
                     loading={loading}
                 />
            )}
            
        </div>
      </div>
    </div>
  );
}