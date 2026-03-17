"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { auth, db, storage, app } from '../../../config/firebase';
import { createUserWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp as firestoreServerTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { AuthService } from '@/services';
import { serverEncryptionService } from '../../../services/server-encryption.service';
import { auditLoggingService, AuditEventType, AuditLogLevel } from '../../../services/audit-logging.service';
import { secureStorage } from '../../../services/secureStorage.service';
import { emailVerificationService } from '../../../services/email-verification.service';
import { StructuredLogger } from '@/utils/logger';
import { SUPPORTED_COUNTRIES, DEFAULT_DRIVER_COUNTRY_CODE } from '@/utils/constants';

// Import des étapes
import Step1Intent, { Step1FormData } from './components/Step1Intent';
import Step2Identity, { Step2FormData } from './components/Step2Identity';
import Step3Vehicle, { Step3FormData } from './components/Step3Vehicle';
import Step4Compliance, { Step4Files } from './components/Step4Compliance';
import Step5Monetization, { Step5FormData } from './components/Step5Monetization';
import { AlertCircle, FileEdit, LogOut, Wifi, WifiOff } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';

// ==========================================
// 1. MÉCANISME DE RETRY AVEC BACKOFF EXPONENTIEL
// ==========================================

/**
 * Interface pour les options de retry
 */
interface RetryOptions {
  maxAttempts?: number; // Nombre maximum de tentatives (défaut: 3)
  baseDelay?: number; // Délai de base en ms (défaut: 1000ms)
  maxDelay?: number; // Délai maximum en ms (défaut: 10000ms)
  onRetry?: (attempt: number, error: Error) => void; // Callback à chaque tentative
}

/**
 * Fonction générique de retry avec backoff exponentiel
 * Implémente un délai exponentiel entre les tentatives : 1s, 2s, 4s, etc.
 * 
 * @param operation - L'opération async à retenter
 * @param options - Options de configuration du retry
 * @returns Le résultat de l'opération réussie
 * @throws La dernière erreur si toutes les tentatives échouent
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    onRetry
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Logger le début de la tentative
      console.log(`[Retry] Tentative ${attempt}/${maxAttempts} à ${new Date().toISOString()}`);
      
      const result = await operation();
      
      // Succès : logger et retourner le résultat
      console.log(`[Retry]  Succès à la tentative ${attempt}/${maxAttempts}`);
      return result;
      
    } catch (error) {
      lastError = error as Error;
      
      // Logger l'erreur avec contexte
      console.error(`[Retry] Erreur à la tentative ${attempt}/${maxAttempts}:`, {
        message: lastError.message,
        code: (lastError as any).code,
        stack: lastError.stack
      });

      // Si ce n'est pas la dernière tentative, attendre avant de réessayer
      if (attempt < maxAttempts) {
        // Calculer le délai avec backoff exponentiel
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        
        console.log(`[Retry] ⏳ Nouvelle tentative dans ${delay}ms...`);
        
        // Callback de retry pour logging externe
        if (onRetry) {
          onRetry(attempt, lastError);
        }
        
        // Attendre avant la prochaine tentative
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Toutes les tentatives ont échoué
  console.error(`[Retry] Toutes les ${maxAttempts} tentatives ont échoué`);
  throw lastError;
}

// ==========================================
// 2. VÉRIFICATION DE CONNECTIVITÉ
// ==========================================

/**
 * Vérifie si le navigateur a une connexion réseau active
 * Utilise l'API Navigator.onLine et des événements de connectivité
 * 
 * @returns true si connecté, false sinon
 */
function checkConnectivity(): boolean {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  console.log(`[Connectivity] Statut de connexion: ${isOnline ? ' En ligne' : 'Hors ligne'}`);
  return isOnline;
}

/**
 * Hook pour surveiller les changements de connectivité
 * Met à jour l'état de connexion et affiche des toasts appropriés
 */
function useConnectivityMonitor(showWarning: (message: string) => void) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Initialiser avec l'état actuel
    setIsOnline(checkConnectivity());

    const handleOnline = () => {
      console.log('[Connectivity]  Connexion rétablie');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.warn('[Connectivity] Connexion perdue');
      setIsOnline(false);
      showWarning('Connexion internet perdue. Veuillez vérifier votre connexion.');
    };

    // Ajouter les écouteurs d'événements
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showWarning]);

  return isOnline;
}

// ==========================================
// 3. REDIRECTION DE SECOURS
// ==========================================

/**
 * Effectue une redirection avec fallback automatique
 * Tente d'abord router.push(), puis window.location.href() après 5 secondes
 *
 * @param router - Le router Next.js
 * @param url - L'URL de destination
 * @param logger - Le logger structuré pour tracer les tentatives
 * @param isMountedRef - Ref pour vérifier si le composant est toujours monté
 * @param redirectTimeoutRef - Ref pour stocker et nettoyer le timeout de redirection
 */
async function redirectWithFallback(
  router: ReturnType<typeof useRouter>,
  url: string,
  logger: StructuredLogger,
  isMountedRef: React.MutableRefObject<boolean>,
  redirectTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
): Promise<void> {
  logger.logStart('REDIRECTION', { url, method: 'router.push' });

  try {
    // Première tentative : utiliser router.push()
    await router.push(url);
    logger.logSuccess('REDIRECTION', { url, method: 'router.push' });

    // Délai de sécurité pour vérifier que la redirection a fonctionné
    // Si après 5 secondes on est toujours sur la page, utiliser le fallback
    redirectTimeoutRef.current = setTimeout(() => {
      // Vérifier si le composant est toujours monté avant d'exécuter le fallback
      if (!isMountedRef.current) {
        logger.logWarning('REDIRECTION', 'Composant démonté, annulation du fallback');
        return;
      }

      if (typeof window !== 'undefined' && window.location.pathname.includes('/driver/register')) {
        logger.logWarning('REDIRECTION', 'router.push() semble avoir échoué, utilisation du fallback', {
          currentPath: window.location.pathname,
          intendedUrl: url
        });

        console.warn('[Redirection] router.push() a échoué, utilisation de window.location.href()');
        window.location.href = url;
      }
    }, 5000);

  } catch (error) {
    logger.logError('REDIRECTION', error as Error, { url, method: 'router.push' });
    
    // Fallback immédiat en cas d'erreur
    console.warn('[Redirection] Erreur lors de router.push(), utilisation de window.location.href()');
    window.location.href = url;
  }
}

// ==========================================
// COMPOSANT PRINCIPAL
// ==========================================

export default function DriverRegisterWizard() {
  const router = useRouter();
  const { toasts, removeToast, showInfo, showWarning, showError } = useToast();

  // ----- ÉTATS DU WIZARD -----
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExistingUser, setIsExistingUser] = useState(false);

  // ----- ÉTAT DE SOUMISSION -----
  // Empêche la double soumission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  // ----- CONNECTIVITÉ -----
  const isOnline = useConnectivityMonitor(showWarning);

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
  const [emailVerificationAttempts, setEmailVerificationAttempts] = useState(0);
  const emailRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  
  // ----- DEBOUNCING POUR LA SAUVEGARDE AUTOMATIQUE -----
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ----- REDIRECTION TIMEOUT REF -----
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ----- LOGGER STRUCTURÉ -----
  const loggerRef = useRef<StructuredLogger>(new StructuredLogger(null, 'DriverRegistration'));

  // ----- CLEANUP EFFECT -----
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      
      // Nettoyer le timer de retry email
      if (emailRetryTimerRef.current) {
        clearTimeout(emailRetryTimerRef.current);
        emailRetryTimerRef.current = null;
      }
      
      // Nettoyer le timer de redirection pour éviter les conditions de course
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
      
      // Nettoyer le timer de sauvegarde automatique
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  // ==========================================
  // 5. SAUVEGARDE AUTOMATIQUE DE LA PROGRESSION
  // ==========================================

  interface RegistrationProgress {
    step1Data: Partial<Step1FormData>;
    step2Data: Partial<Step2FormData>; // SSN exclu pour la sécurité
    step3Data: Partial<Step3FormData>;
    currentStep: number;
    timestamp: string;
  }

  /**
   * Sauvegarde automatique de la progression à chaque étape
   * Utilise Capacitor SecureStorage avec chiffrement AES-256
   * Le SSN est explicitement exclu pour la sécurité RGPD
   */
  const saveProgress = useCallback(async () => {
    try {
      const progress: RegistrationProgress = {
        step1Data: { ...step1Data, password: undefined }, // Mot de passe exclu
        step2Data: { ...step2Data, ssn: undefined }, // SSN exclu
        step3Data,
        currentStep,
        timestamp: new Date().toISOString()
      };
      
      await secureStorage.setItem('driver_registration_progress', progress);
      loggerRef.current.logSuccess('SAVE_PROGRESS', {
        step: currentStep,
        hasStep1Data: Object.keys(step1Data).length > 0,
        hasStep2Data: Object.keys(step2Data).length > 0,
        hasStep3Data: Object.keys(step3Data).length > 0
      });
    } catch (error) {
      loggerRef.current.logError('SAVE_PROGRESS', error as Error, {
        step: currentStep
      });
    }
  }, [step1Data, step2Data, step3Data, currentStep]);

  /**
   * Restauration de la progression depuis SecureStorage
   * Valide la structure des données avant de les appliquer
   */
  const restoreProgress = useCallback(async (): Promise<RegistrationProgress | null> => {
    try {
      const saved = await secureStorage.getItem<RegistrationProgress>('driver_registration_progress');
      
      if (saved && typeof saved === 'object' && 'currentStep' in saved) {
        loggerRef.current.logSuccess('RESTORE_PROGRESS', {
          step: saved.currentStep,
          timestamp: saved.timestamp
        });
        return saved;
      } else {
        loggerRef.current.logWarning('RESTORE_PROGRESS', 'Données de progression invalides');
      }
    } catch (error) {
      loggerRef.current.logError('RESTORE_PROGRESS', error as Error);
    }
    return null;
  }, []);

  /**
   * Nettoyage de la progression après soumission réussie
   */
  const clearProgress = useCallback(async () => {
    try {
      await secureStorage.removeItem('driver_registration_progress');
      loggerRef.current.logSuccess('CLEAR_PROGRESS', {});
    } catch (error) {
      loggerRef.current.logError('CLEAR_PROGRESS', error as Error);
    }
  }, []);

  // ----- SAUVEGARDE AUTOMATIQUE AVEC DEBOUNCING -----
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveProgress();
    }, 1000);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [step1Data, step2Data, step3Data, currentStep, saveProgress]);

  // ----- PROGRESS RESTORATION REF -----
  const hasRestoredProgressRef = useRef(false);

  // ----- RESTAURATION AU CHARGEMENT & VÉRIFICATION UTILISATEUR EXISTANT -----
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        loggerRef.current.setUserId(user.uid);
        setIsExistingUser(true);
        setStep1Data(prev => ({
          ...prev,
          email: user.email || '',
        }));

        if (!hasRestoredProgressRef.current) {
          hasRestoredProgressRef.current = true;
          restoreProgress().then(saved => {
            if (saved && saved.step1Data) {
              setStep1Data(prev => ({ ...prev, ...saved.step1Data }));
              setStep2Data(saved.step2Data || {});
              setStep3Data(saved.step3Data || {});
              setCurrentStep(saved.currentStep || 1);
              showInfo('Votre progression a été restaurée. Vous pouvez continuer votre inscription.');
            }
          });
        }
        
        try {
          const driverDoc = await getDoc(doc(db, 'drivers', user.uid));
          if (driverDoc.exists()) {
            const data = driverDoc.data();
            if (data.status === 'action_required' || data.status === 'rejected') {
               setRejectionCode(data.rejectionCode || 'R000');
               setRejectionReason(data.rejectionReason || data.rejectionMessage || 'Votre dossier nécessite une action de votre part.');
               
               setStep2Data(prev => ({
                   ...prev,
                   firstName: data.firstName || '',
                   lastName: data.lastName || '',
                   dob: data.dob || '',
                   nationality: data.nationality || DEFAULT_DRIVER_COUNTRY_CODE,
                   ssn: '',
                   address: data.address || '',
                   city: data.city || '',
                   zipCode: data.zipCode || '',
               }));
               
               showInfo('Pour des raisons de sécurité, veuillez resaisir votre numéro de sécurité sociale.');
            } else if (data.status === 'pending' || data.status === 'approved' || data.status === 'active') {
               setError('Votre dossier est en cours de traitement ou déjà validé.');
               setTimeout(() => redirectWithFallback(router, '/driver/dashboard', loggerRef.current, isMountedRef, redirectTimeoutRef), 2000);
            }
          }
        } catch (error: any) {
          if (error?.code === 'unavailable' || error?.message?.includes('offline')) {
            loggerRef.current.logWarning('USER_CHECK', 'Impossible de récupérer le profil (hors ligne)', { error: error.message });
            console.warn('[DriverRegistration] Erreur hors ligne (non bloquante) lors de la vérification du profil existant:', error);
          } else {
            loggerRef.current.logError('USER_CHECK', error);
            console.error('[DriverRegistration] Erreur lors de la vérification du profil existant:', error);
          }
        }
      } else {
        setIsExistingUser(false);
      }
    });
    return () => unsubscribe();
  }, [router, restoreProgress, showInfo]);

  // ==========================================
  // 6. HANDLERS ÉTAPE PAR ÉTAPE
  // ==========================================

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    loggerRef.current.logStart('GOOGLE_SIGN_IN', {});

    try {
      const user = await AuthService.signInWithGoogleForDriver();
      
      const names = user.displayName?.split(' ') || [];
      const first = names[0] || '';
      const last = names.length > 1 ? names.slice(1).join(' ') : '';
      
      setStep1Data({ email: user.email || '' });
      setStep2Data(prev => ({ ...prev, firstName: first, lastName: last }));
      
      loggerRef.current.logSuccess('GOOGLE_SIGN_IN', { email: user.email });
      setCurrentStep(2);
    } catch (err: unknown) {
      const error = err as Error;
      loggerRef.current.logError('GOOGLE_SIGN_IN', error);
      setError("Erreur : " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStep1Next = async (data: Step1FormData) => {
    setLoading(true);
    setError(null);
    loggerRef.current.logStart('STEP1_NEXT', { email: data.email });

    try {
      if (!isExistingUser) {
        const credential = await createUserWithEmailAndPassword(auth, data.email, data.password);
        // Créer immédiatement un document utilisateur pour éviter les comptes orphelins
        // (auth créé mais pas de doc Firestore si l'inscription est abandonnée)
        await setDoc(doc(db, 'users', credential.user.uid), {
          uid: credential.user.uid,
          email: data.email,
          userType: 'chauffeur',
          registrationStatus: 'incomplete',
          createdAt: firestoreServerTimestamp(),
          updatedAt: firestoreServerTimestamp(),
        });
      }

      setStep1Data(data);
      loggerRef.current.logSuccess('STEP1_NEXT', {});
      setCurrentStep(2);
    } catch (err: any) {
      loggerRef.current.logError('STEP1_NEXT', err, { email: data.email });
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
    loggerRef.current.logStart('STEP2_NEXT', { 
      hasPhoto: !!photo, 
      firstName: data.firstName,
      lastName: data.lastName
    });

    try {
       setStep2Data(data);
       setBiometricsPhoto(photo);

       const user = auth.currentUser;
       const userId = user?.uid;
       if (!userId) throw new Error("Utilisateur non connecté");

       loggerRef.current.logSuccess('STEP2_NEXT', {});
       setCurrentStep(3);

    } catch (err: unknown) {
      const error = err as Error;
      loggerRef.current.logError('STEP2_NEXT', error);
      setError("Erreur : " + error.message);
    } finally {
        setLoading(false);
    }
  };

  const handleStep3Next = (
    data: Step3FormData,
    files: { registration: File; insurance?: File; techControl: File; interiorPhoto: File; exteriorPhoto: File }
  ) => {
    loggerRef.current.logStart('STEP3_NEXT', {
      carBrand: data.carBrand,
      carModel: data.carModel
    });
    setStep3Data(data);
    setVehicleFiles(files);
    setCurrentStep(4);
  };

  const handleStep4Next = (files: Step4Files) => {
    loggerRef.current.logStart('STEP4_NEXT', {
      hasIdFront: !!files.idFront,
      hasIdBack: !!files.idBack,
      hasLicenseFront: !!files.licenseFront,
      hasLicenseBack: !!files.licenseBack
    });
    setComplianceFiles(files);
    setCurrentStep(5);
  };

  // ----- AUDIT LOGGING HELPER -----
  const createSafeAuditLog = () => {
    let auditLogFailures = 0;
    
    return async (logFunction: () => Promise<void>, context: string): Promise<void> => {
      try {
        await logFunction();
        auditLogFailures = 0;
      } catch (auditError: any) {
        auditLogFailures++;
        console.error(`[AuditLogging] Erreur lors du logging ${context}:`, auditError);
        if (auditLogFailures > 5) {
          console.error(`[AuditLogging] ${auditLogFailures} échecs consécutifs - vérifier la configuration Firestore`);
        }
      }
    };
  };

  const safeAuditLog = createSafeAuditLog();

  // ==========================================
  // 7. UPLOAD FICHIER AVEC RETRY
  // ==========================================

  /**
   * Upload un fichier avec mécanisme de retry automatique
   * Utilise retryWithBackoff pour gérer les erreurs transitoires
   */
  const uploadFileWithRetry = async (
    file: File | null, 
    fileCategory: string, 
    userId: string
  ): Promise<string | null> => {
    if (!file) return null;
    
    const operation = async (): Promise<string> => {
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Utilisateur non authentifié ou UID mismatch');
      }

      const extension = file.name.split('.').pop() || 'tmp';
      const storageRef = ref(storage, `drivers/${userId}/${fileCategory}/${Date.now()}.${extension}`);
      const snapshot = await uploadBytes(storageRef, file);
      return getDownloadURL(snapshot.ref);
    };

    try {
      return await retryWithBackoff(operation, {
        maxAttempts: 3,
        baseDelay: 1000,
        onRetry: (attempt, error) => {
          loggerRef.current.logWarning('UPLOAD_FILE', `Tentative ${attempt} échouée pour ${fileCategory}`, {
            fileName: file.name,
            errorMessage: error.message
          });
        }
      });
    } catch (error) {
      loggerRef.current.logError('UPLOAD_FILE', error as Error, {
        fileCategory,
        fileName: file.name
      });
      throw error;
    }
  };

  // ==========================================
  // 8. SOUMISSION FINALE AVEC TOUTES LES AMÉLIORATIONS
  // ==========================================

  const handleStep5FinalSubmit = async (data: Step5FormData) => {
    // ----- PRÉVENTION DE LA DOUBLE SOUMISSION -----
    if (isSubmitting) {
      loggerRef.current.logWarning('SUBMISSION', 'Tentative de double soumission bloquée');
      return;
    }

    setIsSubmitting(true);
    setLoading(true);
    setError(null);

    // ----- VÉRIFICATION DE CONNECTIVITÉ -----
    if (!checkConnectivity()) {
      const errorMsg = "Vous n'êtes pas connecté à internet. Veuillez vérifier votre connexion avant de soumettre votre dossier.";
      loggerRef.current.logWarning('SUBMISSION', errorMsg);
      setError(errorMsg);
      setLoading(false);
      setIsSubmitting(false);
      return;
    }

    const user = auth.currentUser;
    const userId = user?.uid;
    if (!userId || !user) {
      setError("Vous devez être connecté pour soumettre votre dossier.");
      setLoading(false);
      setIsSubmitting(false);
      return;
    }

    loggerRef.current.setUserId(userId);
    loggerRef.current.logStart('SUBMISSION', {
      step: 'FINAL_SUBMIT',
      hasBankData: !!(data.accountHolder && data.iban && data.bic)
    });

    try {
        // Rafraîchir le token avant les opérations critiques
        try {
          await user.getIdToken(true);
          loggerRef.current.logSuccess('TOKEN_REFRESH', {});
        } catch (tokenError: any) {
          loggerRef.current.logError('TOKEN_REFRESH', tokenError);
          setError("Votre session a expiré. Veuillez vous reconnecter.");
          setLoading(false);
          setIsSubmitting(false);
          return;
        }

        // 1. Upload tous les fichiers lourds avec retry automatique
        loggerRef.current.logStart('UPLOAD_FILES', { fileCount: 10 });
        
        const uploadResults = await Promise.allSettled([
            uploadFileWithRetry(biometricsPhoto, 'biometrics', userId),
            uploadFileWithRetry(vehicleFiles.registration!, 'documents', userId),
            uploadFileWithRetry(vehicleFiles.insurance || null, 'documents', userId),
            uploadFileWithRetry(vehicleFiles.techControl!, 'documents', userId),
            uploadFileWithRetry(vehicleFiles.exteriorPhoto!, 'vehicle_photos', userId),
            uploadFileWithRetry(vehicleFiles.interiorPhoto!, 'vehicle_photos', userId),
            uploadFileWithRetry(complianceFiles.idFront!, 'compliance', userId),
            uploadFileWithRetry(complianceFiles.idBack!, 'compliance', userId),
            uploadFileWithRetry(complianceFiles.licenseFront!, 'compliance', userId),
            uploadFileWithRetry(complianceFiles.licenseBack!, 'compliance', userId),
        ]);

        const [
            bioResult, regResult, insResult, techResult, extResult, intResult,
            idFrontResult, idBackResult, licFrontResult, licBackResult
        ] = uploadResults;

        const failedUploads = uploadResults.filter(r => r.status === 'rejected');
        if (failedUploads.length > 0) {
            loggerRef.current.logError('UPLOAD_FILES', new Error(`${failedUploads.length} uploads ont échoué`), {
              failedCount: failedUploads.length
            });

            const successfulUrls = uploadResults
                .filter(r => r.status === 'fulfilled' && r.value)
                .map(r => (r as PromiseFulfilledResult<string>).value);

            if (successfulUrls.length > 0) {
                try {
                    const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
                    const functions = getFunctions(app, functionsRegion);
                    const cleanupFailedUploads = httpsCallable(functions, 'cleanupFailedUploads');
                    
                    await cleanupFailedUploads({ fileUrls: successfulUrls });
                    loggerRef.current.logSuccess('CLEANUP_UPLOADS', { fileCount: successfulUrls.length });
                } catch (cleanupError: any) {
                    loggerRef.current.logError('CLEANUP_UPLOADS', cleanupError);
                }
            }

            setError("Erreur lors de l'upload de certains fichiers. Veuillez réessayer.");
            setLoading(false);
            setIsSubmitting(false);
            return;
        }

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

        loggerRef.current.logSuccess('UPLOAD_FILES', { fileCount: 10 });

        // 2. Chiffrer le SSN avec retry
        let encryptedSsn = null;
        if (step2Data.ssn) {
            try {
                loggerRef.current.logStart('SSN_ENCRYPTION', {});
                encryptedSsn = await retryWithBackoff(
                  () => serverEncryptionService.encryptSSN(step2Data.ssn!),
                  {
                    maxAttempts: 3,
                    onRetry: (attempt, error) => {
                      loggerRef.current.logWarning('SSN_ENCRYPTION', `Tentative ${attempt} échouée`, {
                        errorMessage: error.message
                      });
                    }
                  }
                );
                loggerRef.current.logSuccess('SSN_ENCRYPTION', {});
                await safeAuditLog(() => auditLoggingService.logSSNEncryption(userId, true), 'SSN succès');
            } catch (encryptError: any) {
                loggerRef.current.logError('SSN_ENCRYPTION', encryptError);
                await safeAuditLog(() => auditLoggingService.logSSNEncryption(userId, false, encryptError.message), 'SSN échec');
                setError(encryptError.message || "Erreur lors de la sécurisation de vos données. Veuillez réessayer.");
                setLoading(false);
                setIsSubmitting(false);
                return;
            }
        }

        // 3. Valider et chiffrer les données bancaires avec retry
        let encryptedBank = null;
        if (data.accountHolder && data.iban && data.bic) {
            try {
                loggerRef.current.logStart('BANK_VALIDATION', {});

                const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
                const functions = getFunctions(app, functionsRegion);
                
                const validateBankDetails = httpsCallable(functions, 'validateBankDetails');
                const validationResult = await retryWithBackoff(
                  () => validateBankDetails({
                      accountHolder: data.accountHolder,
                      iban: data.iban,
                      bic: data.bic
                  }),
                  {
                    maxAttempts: 3,
                    onRetry: (attempt, error) => {
                      loggerRef.current.logWarning('BANK_VALIDATION', `Tentative ${attempt} échouée`, {
                        errorMessage: error.message
                      });
                    }
                  }
                );

                const validationResultData = validationResult.data as { isValid?: boolean; errors?: { [key: string]: any } };
                
                if (!validationResultData || typeof validationResultData !== 'object' || typeof validationResultData.isValid !== 'boolean') {
                    loggerRef.current.logError('BANK_VALIDATION', new Error('Structure de réponse invalide'));
                    setError('Erreur serveur lors de la validation des coordonnées bancaires.');
                    setLoading(false);
                    setIsSubmitting(false);
                    return;
                }

                const result = validationResultData;
                if (!result.isValid) {
                    let errorMessages = "Coordonnées bancaires invalides";
                    if (result.errors) {
                        errorMessages = Object.entries(result.errors)
                            .filter(([key]) => key !== '_errors')
                            .map(([key, val]: [string, any]) => `${key}: ${val._errors?.join(', ') || 'invalide'}`)
                            .join(' | ');
                    }
                    
                    loggerRef.current.logError('BANK_VALIDATION', new Error(errorMessages));
                    await safeAuditLog(() => auditLoggingService.logBankValidation(userId, false, result.errors), 'validation bancaire échec');
                    setError(`Erreur validation: ${errorMessages}`);
                    setLoading(false);
                    setIsSubmitting(false);
                    return;
                }

                loggerRef.current.logSuccess('BANK_VALIDATION', {});
                await safeAuditLog(() => auditLoggingService.logBankValidation(userId, true), 'validation bancaire succès');

                // Chiffrer les données bancaires avec retry
                try {
                    loggerRef.current.logStart('BANK_ENCRYPTION', {});
                    encryptedBank = await retryWithBackoff(
                      () => serverEncryptionService.encryptBankData(
                          data.accountHolder,
                          data.iban,
                          data.bic
                      ),
                      {
                        maxAttempts: 3,
                        onRetry: (attempt, error) => {
                          loggerRef.current.logWarning('BANK_ENCRYPTION', `Tentative ${attempt} échouée`, {
                            errorMessage: error.message
                          });
                        }
                      }
                    );
                    loggerRef.current.logSuccess('BANK_ENCRYPTION', {});
                    await safeAuditLog(() => auditLoggingService.logBankEncryption(userId, true), 'chiffrement bancaire succès');
                } catch (bankEncryptError: any) {
                    loggerRef.current.logError('BANK_ENCRYPTION', bankEncryptError);
                    await safeAuditLog(() => auditLoggingService.logBankEncryption(userId, false, bankEncryptError.message), 'chiffrement bancaire échec');
                    throw bankEncryptError;
                }
            } catch (encryptError: any) {
                loggerRef.current.logError('BANK_PROCESSING', encryptError);
                if (encryptError.code === 'resource-exhausted') {
                    await safeAuditLog(() => auditLoggingService.logRateLimitExceeded(userId, 'bank_validation'), 'rate limit');
                    setError('Trop de tentatives. Veuillez réessayer dans une minute.');
                } else if (encryptError.code === 'unauthenticated') {
                    await safeAuditLog(() => auditLoggingService.logUnauthorizedAccess(userId, 'bank_validation', 'User not authenticated'), 'unauthorized access');
                    setError('Vous devez être connecté pour effectuer cette action.');
                } else {
                    setError(encryptError.message || "Erreur lors du traitement de vos données bancaires. Veuillez réessayer.");
                }
                setLoading(false);
                setIsSubmitting(false);
                return;
            }
        }

        // 4. Rafraîchir le token explicitement avant d'appeler la Cloud Function
        try {
            if (auth.currentUser) {
                await auth.currentUser.getIdToken(true);
            }
        } catch (tokenError: any) {
            loggerRef.current.logError('TOKEN_REFRESH', tokenError);
            setError("Votre session a expiré ou est invalide. Veuillez vous reconnecter pour finaliser l'inscription.");
            setLoading(false);
            setIsSubmitting(false);
            return;
        }

        // 5. Créer le document chauffeur avec retry
        loggerRef.current.logStart('CREATE_DRIVER_PROFILE', {});

        const finalDriverData = {
           uid: userId,
           firstName: step2Data.firstName,
           lastName: step2Data.lastName,
           email: step1Data.email || auth.currentUser?.email || '',
           phoneNumber: null,
           phone: step2Data.phone || step1Data.phone || '',
           dob: step2Data.dob,
           nationality: step2Data.nationality,
           address: step2Data.address,
           city: step2Data.city,
           zipCode: step2Data.zipCode,
           ssn: encryptedSsn,
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
           bank: encryptedBank,
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
           status: 'pending',
           userType: 'chauffeur',
           createdAt: firestoreServerTimestamp(),
           updatedAt: firestoreServerTimestamp(),
           isAvailable: false,
           rating: 0,
           tripsCompleted: 0
        };

        try {
          const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
          const functions = getFunctions(app, functionsRegion);
          const createDriverProfile = httpsCallable(functions, 'createDriverProfile');
          
          await retryWithBackoff(
            () => createDriverProfile({
              driverId: userId,
              driverData: finalDriverData
            }),
            {
              maxAttempts: 3,
              onRetry: (attempt, error) => {
                loggerRef.current.logWarning('CREATE_DRIVER_PROFILE', `Tentative ${attempt} échouée`, {
                  errorMessage: error.message
                });
              }
            }
          );
          
          loggerRef.current.logSuccess('CREATE_DRIVER_PROFILE', {});
        } catch (createError: any) {
            loggerRef.current.logError('CREATE_DRIVER_PROFILE', createError);
            
            let userMessage = "Erreur lors de la création de votre profil. Veuillez réessayer.";
            
            if (createError.code === 'permission-denied' || createError.message?.includes('UID mismatch') || createError.message?.includes('Email mismatch')) {
              userMessage = "Erreur de permission ou de correspondance des données. Veuillez vous reconnecter et réessayer.";
            } else if (createError.code === 'resource-exhausted') {
              userMessage = "Trop de tentatives. Veuillez attendre une minute avant de réessayer.";
            } else if (createError.code === 'failed-precondition') {
              userMessage = createError.message || "Données invalides. Veuillez vérifier vos informations.";
            } else if (createError.code === 'invalid-argument') {
              userMessage = "Données invalides. Veuillez vérifier que toutes les informations sont correctes.";
            } else if (createError.code === 'unauthenticated') {
              userMessage = "Vous n'êtes pas connecté. Veuillez vous reconnecter.";
            }
            
            setError(userMessage);
            setLoading(false);
            setIsSubmitting(false);
            return;
        }

        // 5. Envoyer l'email de vérification avec retry
        loggerRef.current.logStart('SEND_VERIFICATION_EMAIL', {
          email: auth.currentUser?.email
        });

        try {
          const result = await retryWithBackoff(
            () => emailVerificationService.sendVerificationEmail(
              auth.currentUser?.email || '',
              step2Data.firstName || auth.currentUser?.displayName || undefined
            ),
            {
              maxAttempts: 3,
              onRetry: (attempt, error) => {
                loggerRef.current.logWarning('SEND_VERIFICATION_EMAIL', `Tentative ${attempt} échouée`, {
                  errorMessage: error.message
                });
              }
            }
          );
          
          loggerRef.current.logSuccess('SEND_VERIFICATION_EMAIL', {
            messageId: result.messageId
          });
          
          await safeAuditLog(() => auditLoggingService.log({
            eventType: AuditEventType.EMAIL_VERIFICATION_SENT,
            userId,
            level: AuditLogLevel.INFO,
            action: 'Email de vérification envoyé après inscription (via Resend)',
            success: true,
            details: {
              email: auth.currentUser?.email,
              messageId: result.messageId,
              provider: 'resend',
              timestamp: new Date().toISOString()
            }
          }), 'email verification sent');
        } catch (emailError: any) {
            loggerRef.current.logError('SEND_VERIFICATION_EMAIL', emailError);
            
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
                timestamp: new Date().toISOString()
              }
            }), 'email verification failed');
            
            showWarning('Votre dossier a été soumis avec succès, mais l\'email de validation n\'a pas pu être envoyé. Vous pourrez le renvoyer depuis votre tableau de bord.');
        }

        // 6. Nettoyer la progression et marquer comme succès
        await clearProgress();
        setSubmissionSuccess(true);
        
        loggerRef.current.logSuccess('SUBMISSION', {
          status: 'SUCCESS',
          redirectUrl: '/driver/dashboard?submission=1'
        });

        // 7. REDIRECTION AVEC FALLBACK
        await redirectWithFallback(router, '/driver/dashboard?submission=1', loggerRef.current, isMountedRef, redirectTimeoutRef);

    } catch (err: any) {
        loggerRef.current.logError('SUBMISSION', err, {
          step: 'CATCH_ALL',
          code: err.code,
          name: err.name
        });
        
        if (userId) {
          await safeAuditLog(() => auditLoggingService.logDriverRegistrationFailed(userId, err.message), 'inscription échouée');
        }
        
        // ==========================================
        // 9. GESTION AMÉLIORÉE DES ERREURS
        // ==========================================
        
        let errorMessage = "Erreur lors de l'inscription. Veuillez réessayer.";
        let actionButton: { text: string; onClick: () => void } | null = null;
        
        if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
          errorMessage = "Erreur de permissions. Votre session a peut-être expiré. Veuillez vous reconnecter.";
          actionButton = { text: "Se reconnecter", onClick: () => router.push('/driver/login') };
        } else if (err.code === 'storage/unauthorized') {
          errorMessage = "Erreur lors de l'upload des fichiers. Veuillez vérifier votre connexion.";
          actionButton = { text: "Réessayer", onClick: () => window.location.reload() };
        } else if (err.message?.includes('réseau') || err.message?.includes('network')) {
          errorMessage = "Erreur réseau. Veuillez vérifier votre connexion internet et réessayer.";
          actionButton = { text: "Réessayer", onClick: () => handleStep5FinalSubmit(data) };
        } else if (err.message) {
          errorMessage = `Erreur: ${err.message}`;
        }
        
        setError(errorMessage);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Afficher un bouton d'action si disponible
        if (actionButton) {
          showInfo(`${errorMessage} Cliquez ici pour ${actionButton.text.toLowerCase()}.`);
        }
        
    } finally {
        setLoading(false);
        setIsSubmitting(false);
    }
  };

  // ----- REJECTIONS UI HANDLERS -----
  const handleFixRejection = () => {
      if (rejectionCode === 'R001' || rejectionCode === 'R004') {
          setRejectionCode(null);
          setCurrentStep(4);
      } else if (rejectionCode === 'R002' || rejectionCode === 'R003') {
          setRejectionCode(null);
          setCurrentStep(3);
      } else {
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
                       {rejectionCode !== 'R005' && (
                           <button onClick={handleFixRejection} className="w-full flex items-center justify-center bg-[#f29200] text-white py-4 rounded-xl font-bold hover:bg-[#e68600] transition-colors">
                               <FileEdit className="mr-2" size={20} /> Mettre à jour mon dossier
                           </button>
                       )}
                       
                       {rejectionCode === 'R006' && (
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
      
      {/* Indicateur de connectivité */}
      <div className="fixed top-4 right-4 z-50">
        {isOnline ? (
          <div className="flex items-center bg-green-100 text-green-700 px-3 py-2 rounded-lg shadow-md">
            <Wifi className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">En ligne</span>
          </div>
        ) : (
          <div className="flex items-center bg-red-100 text-red-700 px-3 py-2 rounded-lg shadow-md">
            <WifiOff className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">Hors ligne</span>
          </div>
        )}
      </div>
      
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
                <div className="flex-1">
                  <p className="font-medium">{error}</p>
                  <p className="text-sm mt-1">Si le problème persiste, contactez le support technique.</p>
                </div>
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
                     loading={loading || isSubmitting}
                     disabled={isSubmitting || submissionSuccess}
                 />
            )}
            
        </div>
      </div>
    </div>
  );
}
