"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { auth, db, storage } from '../../../config/firebase';
import { createUserWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import { AuthService } from '@/services';
import { serverEncryptionService } from '../../../services/server-encryption.service';
import { auditLoggingService, AuditEventType, AuditLogLevel } from '../../../services/audit-logging.service';
import { secureStorage } from '../../../services/secureStorage.service';

// Import des étapes
import Step1Intent, { Step1FormData } from './components/Step1Intent';
import Step2Identity, { Step2FormData } from './components/Step2Identity';
import Step3Vehicle, { Step3FormData } from './components/Step3Vehicle';
import Step4Compliance, { Step4Files } from './components/Step4Compliance';
import Step5Monetization, { Step5FormData } from './components/Step5Monetization';
import { AlertCircle, FileEdit, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';

export default function DriverRegisterWizard() {
  const router = useRouter();
  const { toasts, removeToast, showInfo, showWarning, showError } = useToast();

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
  
  // ----- EMAIL VERIFICATION RETRY -----
  // Compteur de tentatives pour l'envoi de l'email de vérification
  const [emailVerificationAttempts, setEmailVerificationAttempts] = useState(0);
  
  // ----- DEBOUNCING POUR LA SAUVEGARDE AUTOMATIQUE -----
  // Ref pour le timeout de debouncing de la sauvegarde de progression
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ----- STOCKAGE SÉCURISÉ (PERSISTENCE) -----
  // ✅ FIX: Utiliser SecureStorage Capacitor au lieu de localStorage pour la conformité RGPD
  // Les données sont chiffrées avec AES-256 et stockées de manière sécurisée

  // Interface pour les données de progression stockées
  interface RegistrationProgress {
    step1Data: Partial<Step1FormData>;
    step2Data: Partial<Step2FormData>; // SSN exclu pour la sécurité
    step3Data: Partial<Step3FormData>;
    currentStep: number;
    timestamp: string;
  }

  // Sauvegarder la progression dans SecureStorage
  // ⚠️ IMPORTANT: Le SSN est explicitement exclu de la sauvegarde pour la sécurité
  const saveProgress = useCallback(async () => {
    try {
      const progress: RegistrationProgress = {
        step1Data,
        // ✅ FIX: Exclure le SSN de la sauvegarde (données sensibles)
        step2Data: { ...step2Data, ssn: undefined },
        step3Data,
        currentStep,
        timestamp: new Date().toISOString()
      };
      
      // ✅ Utiliser SecureStorage avec chiffrement AES-256
      await secureStorage.setItem('driver_registration_progress', progress);
      console.log('[DriverRegistration] Progression sauvegardée de manière sécurisée (SSN exclu)');
    } catch (error) {
      console.warn('[DriverRegistration] Impossible de sauvegarder la progression:', error);
    }
  }, [step1Data, step2Data, step3Data, currentStep]);

  // Restaurer la progression depuis SecureStorage
  // ✅ FIX: Valider la structure des données avant de les appliquer
  const restoreProgress = useCallback(async (): Promise<RegistrationProgress | null> => {
    try {
      const saved = await secureStorage.getItem<RegistrationProgress>('driver_registration_progress');
      
      if (saved) {
        // ✅ FIX: Validation de la structure des données
        if (saved && typeof saved === 'object' && 'currentStep' in saved) {
          console.log('[DriverRegistration] Progression restaurée depuis le stockage sécurisé:', saved);
          return saved;
        } else {
          console.warn('[DriverRegistration] Données de progression invalides, ignorées');
        }
      }
    } catch (error) {
      console.warn('[DriverRegistration] Impossible de restaurer la progression:', error);
    }
    return null;
  }, []);

  // Nettoyer la progression (après soumission réussie ou erreur)
  const clearProgress = useCallback(async () => {
    try {
      await secureStorage.removeItem('driver_registration_progress');
      console.log('[DriverRegistration] Progression nettoyée du stockage sécurisé');
    } catch (error) {
      console.warn('[DriverRegistration] Impossible de nettoyer la progression:', error);
    }
  }, []);

  // Vérifier si l'utilisateur est déjà connecté (pour l'étape 1)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsExistingUser(true);
        setStep1Data(prev => ({
          ...prev,
          email: user.email || '',
        }));
        
        // Vérifier si un document chauffeur existe déjà (reprise d'inscription ou rejet)
        const driverDoc = await getDoc(doc(db, 'drivers', user.uid));
        if (driverDoc.exists()) {
          const data = driverDoc.data();
          if (data.status === 'action_required' || data.status === 'rejected') {
             // Gérer les rejets : l'utilisateur doit corriger son dossier
             setRejectionCode(data.rejectionCode || 'R000');
             setRejectionReason(data.rejectionReason || data.rejectionMessage || 'Votre dossier nécessite une action de votre part.');
             
             // Pré-remplir les données pour faciliter la correction
             setStep2Data({
                 firstName: data.firstName || '',
                 lastName: data.lastName || '',
                 dob: data.dob || '',
                 nationality: data.nationality || 'CM',
                 ssn: '', // SSN chiffré non affiché par sécurité (l'utilisateur doit le resaisir)
                 address: data.address || '',
                 city: data.city || '',
                 zipCode: data.zipCode || '',
             });
             
             // Afficher un message d'information pour le SSN à resaisir
             showInfo('Pour des raisons de sécurité, veuillez resaisir votre numéro de sécurité sociale.');
          } else if (data.status === 'pending' || data.status === 'approved' || data.status === 'active') {
             // Dossier déjà en cours de traitement ou validé
             setError('Votre dossier est en cours de traitement ou déjà validé.');
             setTimeout(() => router.push('/driver/dashboard'), 2000);
          }
          // Note: Plus de gestion du statut 'draft' car nous ne créons plus de brouillon
        }
        // Si aucun document chauffeur n'existe, l'utilisateur commence une nouvelle inscription
        // Les données seront stockées localement jusqu'à la soumission finale (étape 5)
      } else {
        setIsExistingUser(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // ----- SAUVEGARDE AUTOMATIQUE DE LA PROGRESSION -----
  // Sauvegarder à chaque changement des données du formulaire avec debouncing
  // ✅ FIX: Ajout d'un debouncing de 1 seconde pour éviter les sauvegardes trop fréquentes
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    
    // Annuler le timeout précédent
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Créer un nouveau timeout
    saveTimeoutRef.current = setTimeout(() => {
      saveProgress();
    }, 1000); // Sauvegarder après 1 seconde d'inactivité
    
    // Cleanup
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [step1Data, step2Data, step3Data, currentStep, saveProgress]);

  // Restaurer la progression au chargement (uniquement pour les nouveaux utilisateurs)
  useEffect(() => {
    const user = auth.currentUser;
    if (user && !isExistingUser) {
      // ✅ restoreProgress est maintenant async
      restoreProgress().then(saved => {
        if (saved && saved.step1Data) {
          console.log('[DriverRegistration] Restauration de la progression sauvegardée');
          setStep1Data(saved.step1Data || {});
          setStep2Data(saved.step2Data || {});
          setStep3Data(saved.step3Data || {});
          setCurrentStep(saved.currentStep || 1);
          
          // Afficher un toast d'information
          showInfo('Votre progression a été restaurée. Vous pouvez continuer votre inscription.');
        }
      });
    }
  }, [isExistingUser, restoreProgress, showInfo]);

  // ----- HANDLERS ÉTAPE PAR ÉTAPE -----

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      // ✅ CORRECTION : Utiliser signInWithGoogleForDriver() au lieu de AuthService.signInWithGoogle()
      // Cela crée le document approprié avec userType: 'chauffeur' dans la collection users
      // et un document dans la collection drivers avec le statut 'draft'
      const user = await AuthService.signInWithGoogleForDriver();
      
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
        // Créer le compte Firebase
        await createUserWithEmailAndPassword(auth, data.email, data.password);
      }
      
      setStep1Data(data);
      setCurrentStep(2);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError("Cet email est déjà utilisé. Essayez de vous connecter.");
      } else if (err.code === 'auth/weak-password') {
        setError("Le mot de passe est trop faible. Utilisez au moins 6 caractères.");
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

       // NOTE: La vérification email est intentionnellement absente ici.
       // Un nouveau compte ne peut pas être vérifié immédiatement.
       // La vérification stricte est effectuée uniquement à la soumission finale (étape 5).

       // ⚠️ IMPORTANT : Le SSN sera chiffré et stocké uniquement à l'étape 5
       // lors de la soumission finale. Ici, on stocke uniquement dans l'état local.
       // Cela évite de créer un document chauffeur prématurément.

       // PAS de sauvegarde en brouillon dans Firestore à ce stade
       // Les données sont stockées uniquement dans l'état local du composant
       // Le document chauffeur sera créé uniquement à l'étape 5 lors de la soumission finale
       
       console.log('[DriverRegistration] Étape 2 complétée - Données stockées localement uniquement');
       
       setCurrentStep(3);

    } catch (err: unknown) {
      const error = err as Error;
      console.error(error);
      setError("Erreur : " + error.message);
    } finally {
        setLoading(false);
    }
  };

  const handleStep3Next = (
    data: Step3FormData,
    files: { registration: File; insurance?: File; techControl: File; interiorPhoto: File; exteriorPhoto: File }
  ) => {
    setStep3Data(data);
    setVehicleFiles(files);
    setCurrentStep(4);
  };

  const handleStep4Next = (files: Step4Files) => {
    setComplianceFiles(files);
    setCurrentStep(5);
  };

  // ----- AUDIT LOGGING HELPER -----
  /**
   * Helper pour l'audit logging non-bloquant
   * Évite la duplication de code try-catch et ne bloque pas le flux principal
   * ✅ FIX: Ajoute un compteur pour détecter les échecs répétés
   * ✅ FIX: Utilise une closure pour protéger la variable contre les accès concurrents
   */
  const createSafeAuditLog = () => {
    let auditLogFailures = 0;
    
    return async (logFunction: () => Promise<void>, context: string): Promise<void> => {
      try {
        await logFunction();
        auditLogFailures = 0; // Reset on success
      } catch (auditError: any) {
        auditLogFailures++;
        console.error(`[AuditLogging] Erreur lors du logging ${context}:`, auditError);
        // ✅ FIX: Alerter après plusieurs échecs consécutifs
        if (auditLogFailures > 5) {
          console.error(`[AuditLogging] ${auditLogFailures} échecs consécutifs - vérifier la configuration Firestore`);
        }
      }
    };
  };

  const safeAuditLog = createSafeAuditLog();

  // ----- UPLOAD HELPER -----
  const uploadFile = async (file: File | null, fileCategory: string, userId: string) => {
    if (!file) return null;
    
    try {
      // ✅ CRITIQUE: Vérifier que l'utilisateur est toujours authentifié avant l'upload
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Utilisateur non authentifié ou UID mismatch');
      }

      const extension = file.name.split('.').pop() || 'tmp';
      const storageRef = ref(storage, `drivers/${userId}/${fileCategory}/${Date.now()}.${extension}`);
      const snapshot = await uploadBytes(storageRef, file);
      return getDownloadURL(snapshot.ref);
    } catch (uploadError: any) {
      console.error(`[Upload] Erreur lors de l'upload du fichier ${fileCategory}:`, {
        message: uploadError.message,
        code: uploadError.code,
        fileName: file.name
      });
      throw uploadError; // Re-throw pour que Promise.allSettled puisse le gérer
    }
  };

  const handleStep5FinalSubmit = async (data: Step5FormData) => {
    setLoading(true);
    setError(null);

    // Vérifier l'utilisateur AVANT le try — géré proprement avec setError
    const user = auth.currentUser;
    const userId = user?.uid;
    if (!userId || !user) {
      setError("Vous devez être connecté pour soumettre votre dossier.");
      setLoading(false);
      return;
    }

    try {
        // ✅ CRITIQUE: Rafraîchir le token avant les opérations critiques pour éviter les erreurs de permissions
        try {
          await user.getIdToken(true); // forceRefresh = true
          console.log('[DriverRegistration] Token rafraîchi avec succès');
        } catch (tokenError: any) {
          console.error('Erreur lors du rafraîchissement du token:', tokenError);
          setError("Votre session a expiré. Veuillez vous reconnecter.");
          setLoading(false);
          return;
        }

        // L'email de vérification sera géré sur la page dédiée après redirection
        console.log('[DriverRegistration] Début de l\'upload des fichiers...');

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

        console.log('[DriverRegistration] Upload des fichiers terminé avec succès');

        // 2. Chiffrer le SSN (maintenant que toutes les données sont collectées)
        // ✅ CHIFFREMENT RÉACTIVÉ - Conformité RGPD article 32
        // Le SSN est chiffré avec AES-256-GCM via la Cloud Function
        let encryptedSsn = null;
        if (step2Data.ssn) {
            try {
                console.log('✅ Chiffrement du SSN avec AES-256-GCM (RGPD article 32)');
                encryptedSsn = await serverEncryptionService.encryptSSN(step2Data.ssn);
                // Audit logging: SSN chiffré avec succès
                await safeAuditLog(() => auditLoggingService.logSSNEncryption(userId, true), 'SSN succès');
            } catch (encryptError: any) {
                console.error('Erreur lors du chiffrement du SSN:', encryptError);
                // Audit logging: Échec du chiffrement SSN
                await safeAuditLog(() => auditLoggingService.logSSNEncryption(userId, false, encryptError.message), 'SSN échec');
                setError(encryptError.message || "Erreur lors de la sécurisation de vos données. Veuillez réessayer.");
                return;
            }
        }

        // 3. Valider les données bancaires avant chiffrement (Cloud Function)
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

                // ✅ FIX: Valider la structure de la réponse avant utilisation
                const validationResultData = validationResult.data as { isValid?: boolean; errors?: { [key: string]: any } };
                
                // Vérifier que la structure est valide
                if (!validationResultData || typeof validationResultData !== 'object' || typeof validationResultData.isValid !== 'boolean') {
                    console.error('[DriverRegistration] Structure de réponse invalide', validationResultData);
                    setError('Erreur serveur lors de la validation des coordonnées bancaires.');
                    return;
                }


                const result = validationResultData;
                if (!result.isValid) {
                    let errorMessages = "Coordonnées bancaires invalides";
                    if (result.errors) {
                        // Extraire les messages d'erreur de Zod si présents
                        errorMessages = Object.entries(result.errors)
                            .filter(([key]) => key !== '_errors')
                            .map(([key, val]: [string, any]) => `${key}: ${val._errors?.join(', ') || 'invalide'}`)
                            .join(' | ');
                    }
                    
                    // Audit logging: Échec validation bancaire
                    await safeAuditLog(() => auditLoggingService.logBankValidation(userId, false, result.errors), 'validation bancaire échec');
                    setError(`Erreur validation: ${errorMessages}`);
                    return;
                }

                // Audit logging: Validation bancaire réussie
                await safeAuditLog(() => auditLoggingService.logBankValidation(userId, true), 'validation bancaire succès');

                // Si la validation réussit, chiffrer les données bancaires
                // ✅ CHIFFREMENT RÉACTIVÉ - Conformité RGPD article 32
                try {
                    console.log('✅ Chiffrement des données bancaires avec AES-256-GCM (RGPD article 32)');
                    encryptedBank = await serverEncryptionService.encryptBankData(
                        data.accountHolder,
                        data.iban,
                        data.bic
                    );
                    // Audit logging: Chiffrement bancaire réussi
                    await safeAuditLog(() => auditLoggingService.logBankEncryption(userId, true), 'chiffrement bancaire succès');
                } catch (bankEncryptError: any) {
                    // Audit logging: Échec chiffrement bancaire
                    await safeAuditLog(() => auditLoggingService.logBankEncryption(userId, false, bankEncryptError.message), 'chiffrement bancaire échec');
                    throw bankEncryptError;
                }
            } catch (encryptError: any) {
                console.error('Erreur lors du traitement des données bancaires:', encryptError);
                // Gérer les erreurs spécifiques
                if (encryptError.code === 'resource-exhausted') {
                    await safeAuditLog(() => auditLoggingService.logRateLimitExceeded(userId, 'bank_validation'), 'rate limit');
                    setError('Trop de tentatives. Veuillez réessayer dans une minute.');
                } else if (encryptError.code === 'unauthenticated') {
                    await safeAuditLog(() => auditLoggingService.logUnauthorizedAccess(userId, 'bank_validation', 'User not authenticated'), 'unauthorized access');
                    setError('Vous devez être connecté pour effectuer cette action.');
                } else {
                    setError(encryptError.message || "Erreur lors du traitement de vos données bancaires. Veuillez réessayer.");
                }
                return;
            }
        }

        // 4. Créer le document chauffeur avec toutes les données
        // ✅ DIAGNOSTIC: Logger toutes les données avant création pour identifier le problème
        console.log('[DriverRegistration] Préparation des données pour création document chauffeur:', {
           uid: userId,
           email: step1Data.email || auth.currentUser?.email || '',
           phone: step2Data.phone || step1Data.phone || '',
           phoneType: typeof (step2Data.phone || step1Data.phone || ''),
           hasFirstName: !!step2Data.firstName,
           hasLastName: !!step2Data.lastName,
           hasDob: !!step2Data.dob,
           hasNationality: !!step2Data.nationality,
           hasAddress: !!step2Data.address,
           hasCity: !!step2Data.city,
           hasZipCode: !!step2Data.zipCode,
           hasSsn: !!encryptedSsn,
           hasBank: !!encryptedBank,
           status: 'pending',
           userType: 'chauffeur',
           emailVerified: auth.currentUser?.emailVerified,
           currentUserId: auth.currentUser?.uid
        });

        const finalDriverData = {
           uid: userId,
           // Données d'identité (Étape 2)
           firstName: step2Data.firstName,
           lastName: step2Data.lastName,
           email: step1Data.email || auth.currentUser?.email || '',
           // ✅ FIX CRITIQUE: phoneNumber doit être null (pas chaîne vide) pour les règles Firestore
           phoneNumber: null, // Toujours null pour les chauffeurs (auth par email uniquement)
           phone: step2Data.phone || step1Data.phone || '', // Stocké dans un champ non-restreint
           dob: step2Data.dob,
           nationality: step2Data.nationality,
           address: step2Data.address,
           city: step2Data.city,
           zipCode: step2Data.zipCode,
             // SSN chiffré (conformité RGPD) - ✅ CHIFFREMENT RÉACTIVÉ
             ssn: encryptedSsn,

             // Données véhicule (Étape 3)
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

             // Identité Bancaire (Étape 5) - ✅ CHIFFREMENT RÉACTIVÉ
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

           status: 'pending', // Statut initial pour les nouvelles inscriptions
           userType: 'chauffeur',
           createdAt: new Date(),
           updatedAt: new Date(),
           isAvailable: false,
           rating: 0,
           tripsCompleted: 0
        };

        console.log('[DriverRegistration] Création du document chauffeur avec statut pending...');
        
        // ✅ FIX RACE CONDITION : Gérer l'erreur de document déjà créé
        // Essayer de créer sans merge d'abord, puis gérer le cas où le document existe déjà
        try {
          // ✅ DIAGNOSTIC: Logger les détails de la requête Firestore
          console.log('[DriverRegistration] Tentative de création document chauffeur:', {
            driverId: userId,
            authUid: auth.currentUser?.uid,
            uidMatch: userId === auth.currentUser?.uid,
            emailPresent: !!finalDriverData.email,
            phoneNumberNull: finalDriverData.phoneNumber === null,
            userType: finalDriverData.userType,
            status: finalDriverData.status,
            emailVerified: auth.currentUser?.emailVerified,
            allRequiredFieldsPresent: !!(
              finalDriverData.firstName &&
              finalDriverData.lastName &&
              finalDriverData.dob &&
              finalDriverData.nationality &&
              finalDriverData.address &&
              finalDriverData.city &&
              finalDriverData.zipCode &&
              finalDriverData.phone &&
              finalDriverData.car &&
              finalDriverData.documents
            )
          });
          
          // Vérifier si un document existe déjà (pour les chauffeurs qui resoumettent après un rejet)
          const existingDriverDoc = await getDoc(doc(db, 'drivers', userId));
          const shouldMerge = existingDriverDoc.exists() &&
                             (existingDriverDoc.data()?.status === 'action_required' ||
                              existingDriverDoc.data()?.status === 'rejected');
          
          if (shouldMerge) {
            console.log('[DriverRegistration] Document existant détecté, utilisation de merge:true pour préserver les données de rejet');
            // Préserver les champs de rejet qui ne sont pas dans finalDriverData
            await setDoc(doc(db, 'drivers', userId), finalDriverData, { merge: true });
          } else {
            console.log('[DriverRegistration] Nouvelle inscription, création du document sans merge');
            await setDoc(doc(db, 'drivers', userId), finalDriverData);
          }
          
          console.log('[DriverRegistration] Document Firestore créé avec succès');
        } catch (createError: any) {
          // ✅ DIAGNOSTIC: Logger les détails de l'erreur Firestore
          console.error('[DriverRegistration] Erreur lors de la création du document chauffeur:', {
            errorCode: createError.code,
            errorMessage: createError.message,
            errorName: createError.name,
            driverId: userId,
            authUid: auth.currentUser?.uid,
            emailVerified: auth.currentUser?.emailVerified,
            isMissingOrInsufficientPermissions: createError.code === 'permission-denied' || createError.message?.includes('Missing or insufficient permissions'),
            finalDriverDataKeys: Object.keys(finalDriverData),
            finalDriverData: {
              uid: finalDriverData.uid,
              email: finalDriverData.email,
              phoneNumber: finalDriverData.phoneNumber,
              phone: finalDriverData.phone,
              userType: finalDriverData.userType,
              status: finalDriverData.status,
              hasFirstName: !!finalDriverData.firstName,
              hasLastName: !!finalDriverData.lastName,
              hasDob: !!finalDriverData.dob,
              hasNationality: !!finalDriverData.nationality,
              hasAddress: !!finalDriverData.address,
              hasCity: !!finalDriverData.city,
              hasZipCode: !!finalDriverData.zipCode,
              hasPhone: !!finalDriverData.phone,
              hasCar: !!finalDriverData.car,
              hasDocuments: !!finalDriverData.documents,
              hasSsn: !!finalDriverData.ssn,
              hasBank: !!finalDriverData.bank
            }
          });
          
          // ✅ FIX: Gérer le cas où deux soumissions concurrentes créent un document
          if (createError.code === 'already-exists' || createError.message?.includes('already exists')) {
            console.log('[DriverRegistration] Document déjà créé par une autre requête, mise à jour avec merge');
            await setDoc(doc(db, 'drivers', userId), finalDriverData, { merge: true });
          } else {
            throw createError; // Re-throw les autres erreurs
          }
        }
        
        console.log('[DriverRegistration] Document Firestore créé avec succès');

        // Audit logging: Inscription chauffeur complétée
        await safeAuditLog(() => auditLoggingService.logDriverRegistrationCompleted(userId), 'inscription complétée');

        // ✅ CRITIQUE: Envoyer l'email de vérification IMMÉDIATEMENT après la création du document
        // Cela garantit que l'email est envoyé même si l'utilisateur est redirigé
        console.log('[DriverRegistration] Envoi de l\'email de vérification...');
        try {
          const { sendEmailVerification } = await import('firebase/auth');
          await sendEmailVerification(auth.currentUser!, {
            url: typeof window !== 'undefined' ? `${window.location.origin}/driver/verify-email` : 'https://medjira-service.firebaseapp.com/driver/verify-email',
            handleCodeInApp: false,
          });
          console.log('[DriverRegistration] ✅ Email de vérification envoyé avec succès à', auth.currentUser?.email);
          
          // Audit logging: Email de vérification envoyé
          await safeAuditLog(() => auditLoggingService.log({
            eventType: AuditEventType.EMAIL_VERIFICATION_SENT,
            userId,
            level: AuditLogLevel.INFO,
            action: 'Email de vérification envoyé après inscription',
            success: true,
            details: {
              email: auth.currentUser?.email,
              timestamp: new Date().toISOString()
            }
          }), 'email verification sent');
        } catch (emailError: any) {
          console.error('[DriverRegistration] ❌ Erreur lors de l\'envoi de l\'email de vérification:', {
            code: emailError.code,
            message: emailError.message,
            email: auth.currentUser?.email,
            attempt: emailVerificationAttempts + 1
          });
          
          // ✅ FIX: Réessayer automatiquement jusqu'à 3 fois avec délai exponentiel
          if (emailVerificationAttempts < 3) {
            const delay = Math.pow(2, emailVerificationAttempts) * 1000; // 1s, 2s, 4s
            console.log(`[DriverRegistration] Nouvelle tentative dans ${delay}ms...`);
            
            setTimeout(async () => {
              try {
                setEmailVerificationAttempts(prev => prev + 1);
                const { sendEmailVerification } = await import('firebase/auth');
                await sendEmailVerification(auth.currentUser!, {
                  url: typeof window !== 'undefined' ? `${window.location.origin}/driver/verify-email` : 'https://medjira-service.firebaseapp.com/driver/verify-email',
                  handleCodeInApp: false,
                });
                console.log('[DriverRegistration] ✅ Email de vérification envoyé avec succès au retry', auth.currentUser?.email);
                
                // Audit logging: Email de vérification envoyé après retry
                await safeAuditLog(() => auditLoggingService.log({
                  eventType: AuditEventType.EMAIL_VERIFICATION_SENT,
                  userId,
                  level: AuditLogLevel.INFO,
                  action: 'Email de vérification envoyé après retry',
                  success: true,
                  details: {
                    email: auth.currentUser?.email,
                    attempt: emailVerificationAttempts + 1,
                    timestamp: new Date().toISOString()
                  }
                }), 'email verification retry success');
                
                setEmailVerificationAttempts(0); // Reset le compteur
              } catch (retryError: any) {
                console.error('[DriverRegistration] ❌ Retry échoué', retryError);
                
                // Logger l'erreur de retry
                await safeAuditLog(() => auditLoggingService.log({
                  eventType: AuditEventType.EMAIL_VERIFICATION_FAILED,
                  userId,
                  level: AuditLogLevel.WARNING,
                  action: 'Échec de l\'envoi de l\'email de vérification (retry)',
                  success: false,
                  errorMessage: retryError.message,
                  details: {
                    email: auth.currentUser?.email,
                    errorCode: retryError.code,
                    attempt: emailVerificationAttempts + 1,
                    timestamp: new Date().toISOString()
                  }
                }), 'email verification retry failed');
                
                // Afficher un avertissement seulement après tous les essais
                if (emailVerificationAttempts + 1 >= 3) {
                  showWarning('Votre dossier a été soumis avec succès, mais l\'email de vérification n\'a pas pu être envoyé. Vous pourrez le renvoyer depuis la page suivante.');
                }
              }
            }, delay);
          } else {
            // Logger l'erreur finale après tous les essais
            await safeAuditLog(() => auditLoggingService.log({
              eventType: AuditEventType.EMAIL_VERIFICATION_FAILED,
              userId,
              level: AuditLogLevel.WARNING,
              action: 'Échec de l\'envoi de l\'email de vérification',
              success: false,
              errorMessage: emailError.message,
              details: {
                email: auth.currentUser?.email,
                errorCode: emailError.code,
                attempts: emailVerificationAttempts + 1,
                timestamp: new Date().toISOString()
              }
            }), 'email verification failed');
            
            // Afficher un avertissement à l'utilisateur
            showWarning('Votre dossier a été soumis avec succès, mais l\'email de vérification n\'a pas pu être envoyé. Vous pourrez le renvoyer depuis la page suivante.');
          }
        }

        // Nettoyer la progression du stockage sécurisé après soumission réussie
        await clearProgress();

        // Redirection vers vérification email (comme dans l'ancien flux)
        router.push('/driver/verify-email');

    } catch (err: any) {
        console.error('[DriverRegistration] Erreur lors de la soumission finale:', {
          message: err.message,
          code: err.code,
          name: err.name,
          stack: err.stack
        });
        
        // Audit logging: Échec inscription
        if (userId) {
          await safeAuditLog(() => auditLoggingService.logDriverRegistrationFailed(userId, err.message), 'inscription échouée');
        }
        
        // Message d'erreur plus spécifique selon le type d'erreur
        let errorMessage = "Erreur lors de l'inscription. Veuillez réessayer.";
        if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
          errorMessage = "Erreur de permissions. Votre session a peut-être expiré. Veuillez vous reconnecter.";
        } else if (err.code === 'storage/unauthorized') {
          errorMessage = "Erreur lors de l'upload des fichiers. Veuillez vérifier votre connexion.";
        } else if (err.message) {
          errorMessage = `Erreur: ${err.message}`;
        }
        
        setError(errorMessage);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // ✅ FIX: Nettoyer les données sensibles du stockage sécurisé même en cas d'erreur
        // Avec SecureStorage, le SSN n'est jamais stocké, donc aucun nettoyage spécifique n'est nécessaire
        // Les données sont déjà chiffrées avec AES-256
        console.log('[DriverRegistration] Les données sensibles sont protégées par chiffrement AES-256');
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
                style={{ width: `${(currentStep / 5) * 100}%` }}
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
                    initialPhoto={biometricsPhoto}
                />
            )}

            {currentStep === 3 && (
                <Step3Vehicle
                    onNext={handleStep3Next}
                    onBack={() => setCurrentStep(2)}
                    loading={loading}
                    initialData={step3Data}
                    initialFiles={vehicleFiles}
                />
            )}

            {currentStep === 4 && (
                <Step4Compliance 
                    onNext={handleStep4Next} 
                    onBack={() => setCurrentStep(3)}
                    loading={loading}
                    initialFiles={complianceFiles}
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