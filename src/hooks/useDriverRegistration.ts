// src/hooks/useDriverRegistration.ts
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db, getFirebaseStorage, app } from '@/config/firebase';
import { onAuthStateChanged, deleteUser, fetchSignInMethodsForEmail, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp as firestoreServerTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AuthService } from '@/services';
import { createDriverOnboardingAccount } from '@/services/auth.service';
import { secureStorage } from '@/services/secureStorage.service';
import { StructuredLogger } from '@/utils/logger';
import { retryWithBackoff } from '@/utils/retry';
import { redirectWithFallback } from '@/utils/navigation';
import { useConnectivityMonitor, checkConnectivity } from '@/hooks/useConnectivityMonitor';
import { buildDriverApplicationPublicData, getDriverApplicationEmail } from '@/hooks/driverRegistrationPayload';
import { getDriverSubmissionErrorMessage } from '@/hooks/driverRegistrationErrors';
import type { Step1FormData } from '@/app/driver/register/components/Step1Intent';
import type { Step2FormData } from '@/app/driver/register/components/Step2Identity';
import type { Step3FormData } from '@/app/driver/register/components/Step3Vehicle';
import type { Step4Files } from '@/app/driver/register/components/Step4Compliance';
import type { Step5FormData } from '@/app/driver/register/components/Step5Monetization';
import type { DriverType } from '@/types/firestore-collections';

interface RegistrationProgress {
  step1Data: Partial<Step1FormData>;
  step2Data: Partial<Step2FormData>;
  step3Data: Partial<Step3FormData>;
  currentStep: number;
  timestamp: string;
}

export function useDriverRegistration() {
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning] = useState<string | null>(null);
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [rejectionCode, setRejectionCode] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [driverType, setDriverType] = useState<DriverType>('chauffeur');
  const [vehicleType, setVehicleType] = useState<'velo' | 'scooter' | 'moto' | 'voiture'>('voiture');

  const [step1Data, setStep1Data] = useState<Partial<Step1FormData>>({});
  const [step2Data, setStep2Data] = useState<Partial<Step2FormData>>({});
  const [step3Data, setStep3Data] = useState<Partial<Step3FormData>>({});
  const [biometricsPhoto, setBiometricsPhoto] = useState<File | null>(null);
  const [vehicleFiles, setVehicleFiles] = useState<{
    registration?: File; insurance?: File; techControl?: File;
    exteriorPhoto?: File;
  }>({});
  const [complianceFiles, setComplianceFiles] = useState<Partial<Step4Files>>({});

  const connectivityOnline = useConnectivityMonitor(() => {});
  const isMountedRef = useRef(true);
  const emailRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasRestoredProgressRef = useRef(false);
  const loggerRef = useRef<StructuredLogger>(new StructuredLogger(null, 'DriverRegistration'));

  // Cleanup on unmount
  useEffect(() => {
    const emailRetryTimer = emailRetryTimerRef.current;
    const redirectTimeout = redirectTimeoutRef.current;
    const saveTimeout = saveTimeoutRef.current;
    return () => {
      isMountedRef.current = false;
      if (emailRetryTimer) clearTimeout(emailRetryTimer);
      if (redirectTimeout) clearTimeout(redirectTimeout);
      if (saveTimeout) clearTimeout(saveTimeout);
    };
  }, []);

  // Auto-save with debounce
  const saveProgress = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const progress: RegistrationProgress = {
        step1Data: { ...step1Data, password: undefined },
        step2Data,
        step3Data,
        currentStep,
        timestamp: new Date().toISOString(),
      };
      const key = `driver_registration_progress_${user.uid}` as const;
      await secureStorage.setItem(key, progress);
    } catch (err) {
      loggerRef.current.logError('SAVE_PROGRESS', err as Error, { step: currentStep });
    }
  }, [step1Data, step2Data, step3Data, currentStep]);

  const restoreProgress = useCallback(async (): Promise<RegistrationProgress | null> => {
    try {
      const user = auth.currentUser;
      if (!user) return null;
      const key = `driver_registration_progress_${user.uid}` as const;
      const saved = await secureStorage.getItem<RegistrationProgress>(key);
      if (saved?.timestamp) {
        const age = Date.now() - new Date(saved.timestamp).getTime();
        if (age > 30 * 60 * 1000) {
          await secureStorage.removeItem(key);
          await secureStorage.clearLegacyDriverProgress();
          return null;
        }
      }
      if (saved && typeof saved === 'object' && 'currentStep' in saved) return saved;
    } catch (err) {
      loggerRef.current.logError('RESTORE_PROGRESS', err as Error);
    }
    return null;
  }, []);

  const clearProgress = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        await secureStorage.removeItem(`driver_registration_progress_${user.uid}`);
      }
      await secureStorage.clearLegacyDriverProgress();
    } catch (err) {
      loggerRef.current.logError('CLEAR_PROGRESS', err as Error);
    }
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => { saveProgress(); }, 1000);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [step1Data, step2Data, step3Data, currentStep, saveProgress]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || currentStep <= 0) return;

    const timeout = setTimeout(async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.data()?.accountState !== 'driver_onboarding') return;

        await updateDoc(userRef, {
          'onboarding.driver.currentStep': currentStep,
          'onboarding.driver.updatedAt': firestoreServerTimestamp(),
          updatedAt: firestoreServerTimestamp(),
        });
      } catch (err) {
        loggerRef.current.logWarning('SAVE_ONBOARDING_STEP', 'Sauvegarde serveur de l’étape échouée', {
          error: (err as Error).message,
          step: currentStep,
        });
      }
    }, 1000);

    return () => clearTimeout(timeout);
  }, [currentStep]);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        loggerRef.current.setUserId(user.uid);
        setIsExistingUser(true);
        setStep1Data(prev => ({ ...prev, email: user.email || '' }));

        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const uData = userSnap.data();
            if (uData.accountState === 'active' || !uData.accountState) {
              const previousRole = uData.lastActiveRole ?? uData.activeRole ?? 'client';
              await updateDoc(userRef, {
                accountState: 'driver_onboarding',
                activeRole: 'driver_onboarding',
                lastActiveRole: previousRole,
                'onboarding.driver.status': 'draft',
                'onboarding.driver.currentStep': 1,
                'onboarding.driver.updatedAt': firestoreServerTimestamp(),
                updatedAt: firestoreServerTimestamp(),
              });
            }
          }
        } catch (e) {
          loggerRef.current.logWarning('INIT_ONBOARDING_STATE', 'Initialisation accountState driver_onboarding échouée', {
            error: (e as Error).message,
          });
        }
        if (!hasRestoredProgressRef.current) {
          hasRestoredProgressRef.current = true;
          const saved = await restoreProgress();
          if (saved?.step1Data) {
            setStep1Data(prev => ({
              ...prev,
              ...saved.step1Data,
              email: user.email || saved.step1Data.email || '',
            }));
            setStep2Data(saved.step2Data || {});
            setStep3Data(saved.step3Data || {});
            const maxRestorableStep = 2;
            setCurrentStep(Math.min(Math.max(saved.currentStep || 1, 1), maxRestorableStep));
          } else {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            const onboardingStep = userDoc.data()?.onboarding?.driver?.currentStep;
            if (userDoc.data()?.accountState === 'driver_onboarding' && typeof onboardingStep === 'number') {
              const maxRestorableStep = 2;
              setCurrentStep(Math.min(Math.max(onboardingStep, 1), maxRestorableStep));
            }
          }
        }

        try {
          await user.getIdToken(true);
          const driverDoc = await getDoc(doc(db, 'drivers', user.uid));
          if (driverDoc.exists()) {
            const data = driverDoc.data();
            if (data.status === 'action_required' || data.status === 'rejected') {
              setRejectionCode(data.rejectionCode || 'R000');
              setRejectionReason(data.rejectionReason || data.rejectionMessage || 'Votre dossier nécessite une action.');
              let privateData: Record<string, unknown> = {};
              try {
                const privateDoc = await getDoc(doc(db, 'drivers', user.uid, 'private', 'personal'));
                if (privateDoc.exists()) privateData = privateDoc.data() || {};
              } catch (e) {
                loggerRef.current.logWarning('PRIVATE_FETCH', 'Lecture private/personal échouée', { error: (e as Error).message });
              }
              setStep2Data(prev => ({
                ...prev,
                firstName: data.firstName || '',
                lastName: data.lastName || '',
                city: data.city || '',
                zipCode: data.zipCode || '',
                dob: (privateData.dob as string) || '',
                address: (privateData.address as string) || '',
                province: (privateData.province as string) || '',
                country: (privateData.country as string) || '',
              }));
            } else if (['pending', 'approved', 'active'].includes(data.status)) {
              try {
                const userDocRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userDocRef);
                if (userSnap.exists()) {
                  const uData = userSnap.data();
                  if (uData?.accountState === 'driver_onboarding' || uData?.activeRole === 'driver_onboarding') {
                    await updateDoc(userDocRef, {
                      accountState: 'active',
                      activeRole: 'driver',
                      lastActiveRole: 'driver',
                      'roles.driver': uData.roles?.driver || { joinedAt: firestoreServerTimestamp() },
                      updatedAt: firestoreServerTimestamp(),
                    });
                  }
                }
              } catch (syncErr) {
                loggerRef.current.logWarning('USER_SYNC', 'Synchronisation du profil utilisateur échouée', {
                  error: (syncErr as Error).message,
                });
              }

              redirectTimeoutRef.current = redirectWithFallback(router, '/driver/dashboard');
            }
          }
        } catch (err: unknown) {
          const error = err as { code?: string; message?: string };
          if (error?.code === 'unavailable' || error?.message?.includes('offline')) {
            loggerRef.current.logWarning('USER_CHECK', 'Hors ligne', { error: error.message });
          } else {
            loggerRef.current.logError('USER_CHECK', err as Error);
          }
        }
      } else {
        setIsExistingUser(false);
      }
    });
    return () => unsubscribe();
  }, [router, restoreProgress]);

  const uploadFileWithRetry = async (
    file: File | null,
    fileCategory: string,
    userId: string,
    isDraft = false
  ): Promise<string | null> => {
    if (!file) return null;
    return retryWithBackoff(
      async () => {
        const user = auth.currentUser;
        if (!user || user.uid !== userId) throw new Error('Utilisateur non authentifié');
        const ext = file.name.split('.').pop() || 'tmp';
        const folder = isDraft ? `drivers/${userId}/drafts/${fileCategory}` : `drivers/${userId}/${fileCategory}`;
        const storageRef = ref(getFirebaseStorage(), `${folder}/${Date.now()}.${ext}`);
        const snapshot = await uploadBytes(storageRef, file);
        return getDownloadURL(snapshot.ref);
      },
      {
        maxAttempts: 3,
        onRetry: (attempt, error) => {
          loggerRef.current.logWarning('UPLOAD_FILE', `Tentative ${attempt} échouée pour ${fileCategory}`, {
            errorMessage: error.message,
          });
        },
      }
    );
  };

  const handleStep0Next = (type: DriverType) => {
    setDriverType(type);
    setCurrentStep(1);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await AuthService.signInWithGoogleForDriver();
      const names = user.displayName?.split(' ') || [];
      setStep1Data({ email: user.email || '' });
      setStep2Data(prev => ({
        ...prev,
        firstName: names[0] || '',
        lastName: names.length > 1 ? names.slice(1).join(' ') : '',
      }));
      setCurrentStep(2);
    } catch (err: unknown) {
      setError('Erreur : ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleStep1Next = async (data: Step1FormData) => {
    setLoading(true);
    setError(null);
    let newlyCreatedUser: User | null = null;
    try {
      if (!isExistingUser) {
        const methods = await fetchSignInMethodsForEmail(auth, data.email);
        if (methods.length > 0) {
          throw new Error('EMAIL_ALREADY_IN_USE');
        }
        newlyCreatedUser = await createDriverOnboardingAccount(data.email, data.password);
      }
      setStep1Data(data);
      const sendResult = await handleSendVerificationCode(data.email);
      if (!sendResult.success) {
        throw new Error(sendResult.error ?? 'Erreur lors de l\'envoi du code de vérification.');
      }
    } catch (err: unknown) {
      if (newlyCreatedUser) {
        try {
          await deleteUser(newlyCreatedUser);
        } catch (cleanupErr) {
          console.error('[useDriverRegistration] Erreur suppression compte Auth orphelin après échec OTP:', cleanupErr);
        }
      }
      const error = err as { code?: string; message?: string };
      if (error?.code === 'auth/email-already-in-use' || error?.message === 'EMAIL_ALREADY_IN_USE') {
        setError('Un compte avec cet email existe déjà. Si vous avez commencé une inscription, connectez-vous pour reprendre votre dossier.');
      } else if (error?.code === 'auth/weak-password') {
        setError('Le mot de passe est trop faible. Utilisez au moins 6 caractères.');
      } else {
        setError(error?.message || 'Erreur inconnue');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleStep2Next = async (data: Step2FormData, photo: File | null) => {
    setLoading(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user?.uid) throw new Error('Utilisateur non connecté');
      setStep2Data(data);
      setBiometricsPhoto(photo);
      setCurrentStep(3);
    } catch (err: unknown) {
      setError('Erreur : ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleStep3Next = (
    data: Step3FormData | null,
    files: {
      registration?: File;
      insurance?: File;
      techControl?: File;
      interiorPhoto?: File;
      exteriorPhoto?: File;
    }
  ) => {
    if (data) setStep3Data(data);
    setVehicleFiles(files);
    setCurrentStep(4);
  };

  const handleStep4Next = (files: Step4Files) => {
    setComplianceFiles(files);
    setCurrentStep(5);
  };

  const handleStep5FinalSubmit = async (_data: Step5FormData) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setLoading(true);
    setError(null);

    if (!checkConnectivity()) {
      setError("Vous n'êtes pas connecté à internet.");
      setLoading(false);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      return;
    }

    const user = auth.currentUser;
    const userId = user?.uid;
    if (!userId || !user) {
      setError('Vous devez être connecté pour soumettre votre dossier.');
      setLoading(false);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      return;
    }

    // Variables accessibles dans le catch pour le cleanup Storage
    let uploadResults: PromiseSettledResult<string | null>[] = [];

    try {
      await user.getIdToken(true);

      // Documents véhicule : uniquement pour les conducteurs (chauffeur/les_deux)
      // OU les livreurs en voiture. Les livreurs vélo/scooter/moto ne fournissent
      // PAS de carte grise, contrôle technique, assurance pro, photos int/ext.
      const requiresVehicleDocs =
        driverType === 'chauffeur' ||
        driverType === 'les_deux' ||
        (driverType === 'livreur' && vehicleType === 'voiture');

      // Helper : skip l'upload si le fichier est absent ou vide (sécurité
      // anti-File([]) vide). Retourne toujours un PromiseSettledResult pour
      // conserver l'indexation stable du tableau uploadResults.
      const uploadIfValid = (file: File | undefined | null, category: string) => {
        if (!file || file.size === 0) {
          return Promise.resolve(null) as Promise<string | null>;
        }
        return uploadFileWithRetry(file, category, userId, true);
      };

      // Lance uploads
      const uploadsPromise = Promise.allSettled([
         uploadFileWithRetry(biometricsPhoto, 'biometrics', userId, true),
        requiresVehicleDocs ? uploadIfValid(vehicleFiles.registration, 'documents') : Promise.resolve(null),
        requiresVehicleDocs ? uploadIfValid(vehicleFiles.insurance, 'documents') : Promise.resolve(null),
        requiresVehicleDocs ? uploadIfValid(vehicleFiles.techControl, 'documents') : Promise.resolve(null),
        requiresVehicleDocs ? uploadIfValid(vehicleFiles.exteriorPhoto, 'vehicle_photos') : Promise.resolve(null),
         uploadFileWithRetry(complianceFiles.workEligibility!, 'compliance', userId, true),
         (vehicleType !== 'velo') ? uploadFileWithRetry(complianceFiles.driversAbstract!, 'compliance', userId, true) : Promise.resolve(null),
         (vehicleType !== 'velo') ? uploadFileWithRetry(complianceFiles.licenseFront!, 'compliance', userId, true) : Promise.resolve(null),
         (vehicleType !== 'velo') ? uploadFileWithRetry(complianceFiles.licenseBack!, 'compliance', userId, true) : Promise.resolve(null),
      ]);

      const uploadResultsValue = await uploadsPromise;
      uploadResults = uploadResultsValue;

      const failedUploads = uploadResults.filter(r => r.status === 'rejected');
      if (failedUploads.length > 0) {
        throw new Error("Erreur lors de l'upload de certains fichiers. Veuillez réessayer.");
      }

      const getValue = (r: PromiseSettledResult<string | null>) =>
        r.status === 'fulfilled' ? r.value : null;

      // Construit la map documents conditionnellement
      const documents: Record<string, { url: string; status: string }> = {};
      const addDoc = (key: string, url: string | null) => {
        if (url) documents[key] = { url, status: 'pending' };
      };
      addDoc('biometricPhoto', getValue(uploadResults[0]));
      addDoc('carRegistration', getValue(uploadResults[1]));
      addDoc('insurance', getValue(uploadResults[2]));
      addDoc('techControl', getValue(uploadResults[3]));
      addDoc('vehicleExterior', getValue(uploadResults[4]));
      addDoc('workEligibility', getValue(uploadResults[5]));
      addDoc('driversAbstract', getValue(uploadResults[6]));
      addDoc('licenseFront', getValue(uploadResults[7]));
      addDoc('licenseBack', getValue(uploadResults[8]));

      // === RGPD #C2 : split public vs private ===
      // Champs publics — doc racine `drivers/{uid}` (lisible par utilisateurs auth)
      const publicData = buildDriverApplicationPublicData({
        userId,
        email: getDriverApplicationEmail(auth.currentUser?.email, step1Data.email),
        driverType,
        vehicleType,
        defaultCityId: process.env.NEXT_PUBLIC_DEFAULT_CITY_ID || 'edmonton',
        step2Data,
        step3Data,
      });

      // Champs sensibles — sous-collection `drivers/{uid}/private/personal`
      const privateData: Record<string, unknown> = {
        dob: step2Data.dob,
        address: step2Data.address || '',
        province: step2Data.province || '',
        country: step2Data.country || '',
        licenseNumber: complianceFiles.licenseNumber || '',
        licenseClass: complianceFiles.licenseClass || '',
        hasFourDoors: step3Data.hasFourDoors || false,
        taxId: _data.taxId || '',
        documents,
        updatedAt: firestoreServerTimestamp(),
      };

      // Optim : pas de 2ème getIdToken(true) — le refresh fait en début de
      // handleStep5FinalSubmit reste valide (TTL 1h) et la CF retry les erreurs auth.
      const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
      const functions = getFunctions(app, functionsRegion);
      const submitApplication = httpsCallable(functions, 'submitDriverApplication');
      // 1) CF crée drivers/{uid} + update users/{uid}.roles.driver (Admin SDK)
      await retryWithBackoff(() => submitApplication({ driverId: userId, driverData: publicData }), {
        maxAttempts: 3,
      });

      // 2) Client écrit la sous-collection privée (owner uniquement via rules)
      // Utilise un writeBatch pour garantir l'atomicité de l'écriture privée.
      const batch = writeBatch(db);
      batch.set(doc(db, 'drivers', userId, 'private', 'personal'), privateData, { merge: true });
      await batch.commit();

      await clearProgress();
      setSubmissionSuccess(true);
      redirectTimeoutRef.current = redirectWithFallback(router, '/driver/pending');
    } catch (err: unknown) {
      const uploadedUrls = uploadResults
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && typeof r.value === 'string')
        .map(r => r.value);

      for (const url of uploadedUrls) {
        try {
          const fileRef = ref(getFirebaseStorage(), url);
          await deleteObject(fileRef);
        } catch {
          // Ignorer les erreurs de cleanup individuel
        }
      }

      const error = err as { code?: string; message?: string };
      setError(getDriverSubmissionErrorMessage(error));
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleFixRejection = () => {
    const stepByCode: Record<string, number> = {
      R001: 4, R004: 4,
      R002: 3, R003: 3,
      R005: 2,
    };
    const targetStep = (rejectionCode && stepByCode[rejectionCode]) ? stepByCode[rejectionCode] : 2;
    setRejectionCode(null);
    setCurrentStep(targetStep);
  };

  const handleLogout = async () => {
    await auth.signOut();
    router.push('/');
  };

  // ============================================================================
  // VÉRIFICATION EMAIL OTP
  // ============================================================================

  const handleSendVerificationCode = async (email: string): Promise<{ success: boolean; error?: string }> => {
    if (!checkConnectivity()) {
      return { success: false, error: 'Pas de connexion internet.' };
    }
    try {
      const user = auth.currentUser;
      if (!user) return { success: false, error: 'Session expirée. Reconnectez-vous.' };

      await user.getIdToken(true);
      const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
      const functionsInstance = getFunctions(app, functionsRegion);
      const sendCode = httpsCallable<{ email: string }, { success: boolean; error?: string }>(
        functionsInstance, 'sendVerificationCode'
      );
      const result = await sendCode({ email });
      const data = result.data;

      if (!data.success) {
        return { success: false, error: data.error ?? 'Erreur lors de l\'envoi du code.' };
      }
      return { success: true };
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'functions/unauthenticated') {
        return { success: false, error: 'Session expirée. Reconnectez-vous.' };
      }
      if (error.code === 'functions/resource-exhausted') {
        return { success: false, error: 'Trop de tentatives. Réessayez dans quelques secondes.' };
      }
      return { success: false, error: error.message || 'Erreur réseau. Réessayez.' };
    }
  };

  const handleVerifyCode = async (code: string): Promise<{ success: boolean; error?: string; attemptsLeft?: number }> => {
    if (!checkConnectivity()) {
      return { success: false, error: 'Pas de connexion internet.' };
    }
    try {
      const user = auth.currentUser;
      if (!user) return { success: false, error: 'Session expirée. Reconnectez-vous.' };

      await user.getIdToken(true);
      const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
      const functionsInstance = getFunctions(app, functionsRegion);
      const verifyFn = httpsCallable<{ code: string }, { success: boolean; error?: string; attemptsLeft?: number }>(
        functionsInstance, 'verifyCode'
      );
      const result = await verifyFn({ code });
      const data = result.data;

      if (!data.success) {
        return { success: false, error: data.error, attemptsLeft: data.attemptsLeft };
      }

      // CORRECTION BUG : Recharger le profil Firebase Auth côté client après
      // que le Admin SDK a mis emailVerified: true via la Cloud Function verifyCode.
      // Sans ce reload(), user.emailVerified reste false dans le cache client,
      // ce qui provoque l'affichage erroné du message "Vérifiez votre email"
      // sur le driver/dashboard immédiatement après l'inscription.
      if (auth.currentUser) {
        await auth.currentUser.reload();
      }

      return { success: true };
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'functions/unauthenticated') {
        return { success: false, error: 'Session expirée. Reconnectez-vous.' };
      }
      return { success: false, error: error.message || 'Erreur réseau. Réessayez.' };
    }
  };

  return {
    // State
    currentStep,
    loading,
    error,
    warning,
    isOnline: connectivityOnline,
    isSubmitting,
    submissionSuccess,
    rejectionCode,
    rejectionReason,
    // Driver type state
    driverType,
    setDriverType,
    vehicleType,
    setVehicleType,
    // Step data
    step1Data,
    step2Data,
    step3Data,
    biometricsPhoto,
    vehicleFiles,
    complianceFiles,
    // Handlers
    handleStep0Next,
    handleGoogleSignIn,
    handleStep1Next,
    handleStep2Next,
    handleStep3Next,
    handleStep4Next,
    handleStep5FinalSubmit,
    handleFixRejection,
    handleLogout,
    handleSendVerificationCode,
    handleVerifyCode,
    setCurrentStep,
    isExistingUser,
  };
}
