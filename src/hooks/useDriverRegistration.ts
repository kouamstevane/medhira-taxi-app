// src/hooks/useDriverRegistration.ts
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db, storage, app } from '@/config/firebase';
import { createUserWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp as firestoreServerTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AuthService } from '@/services';
import { serverEncryptionService } from '@/services/server-encryption.service';
import { auditLoggingService, AuditEventType, AuditLogLevel } from '@/services/audit-logging.service';
import { secureStorage } from '@/services/secureStorage.service';
import { emailVerificationService } from '@/services/email-verification.service';
import { StructuredLogger } from '@/utils/logger';
import { retryWithBackoff } from '@/utils/retry';
import { redirectWithFallback } from '@/utils/navigation';
import { useConnectivityMonitor, checkConnectivity } from '@/hooks/useConnectivityMonitor';
import { DEFAULT_DRIVER_COUNTRY_CODE } from '@/utils/constants';
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
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [rejectionCode, setRejectionCode] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [emailVerificationAttempts, setEmailVerificationAttempts] = useState(0);

  const [driverType, setDriverType] = useState<DriverType>('chauffeur');
  const [vehicleType, setVehicleType] = useState<'velo' | 'scooter' | 'moto' | 'voiture'>('voiture');

  const [step1Data, setStep1Data] = useState<Partial<Step1FormData>>({});
  const [step2Data, setStep2Data] = useState<Partial<Step2FormData>>({});
  const [step3Data, setStep3Data] = useState<Partial<Step3FormData>>({});
  const [biometricsPhoto, setBiometricsPhoto] = useState<File | null>(null);
  const [vehicleFiles, setVehicleFiles] = useState<{
    registration?: File; insurance?: File; techControl?: File;
    interiorPhoto?: File; exteriorPhoto?: File;
  }>({});
  const [complianceFiles, setComplianceFiles] = useState<{
    idFront?: File; idBack?: File; licenseFront?: File; licenseBack?: File;
  }>({});

  const connectivityOnline = useConnectivityMonitor(() => {});
  const isMountedRef = useRef(true);
  const emailRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasRestoredProgressRef = useRef(false);
  const loggerRef = useRef<StructuredLogger>(new StructuredLogger(null, 'DriverRegistration'));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (emailRetryTimerRef.current) clearTimeout(emailRetryTimerRef.current);
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Auto-save with debounce
  const saveProgress = useCallback(async () => {
    try {
      const progress: RegistrationProgress = {
        step1Data: { ...step1Data, password: undefined },
        step2Data: { ...step2Data, ssn: undefined },
        step3Data,
        currentStep,
        timestamp: new Date().toISOString(),
      };
      await secureStorage.setItem('driver_registration_progress', progress);
    } catch (err) {
      loggerRef.current.logError('SAVE_PROGRESS', err as Error, { step: currentStep });
    }
  }, [step1Data, step2Data, step3Data, currentStep]);

  const restoreProgress = useCallback(async (): Promise<RegistrationProgress | null> => {
    try {
      const saved = await secureStorage.getItem<RegistrationProgress>('driver_registration_progress');
      if (saved && typeof saved === 'object' && 'currentStep' in saved) return saved;
    } catch (err) {
      loggerRef.current.logError('RESTORE_PROGRESS', err as Error);
    }
    return null;
  }, []);

  const clearProgress = useCallback(async () => {
    try {
      await secureStorage.removeItem('driver_registration_progress');
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

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        loggerRef.current.setUserId(user.uid);
        setIsExistingUser(true);
        setStep1Data(prev => ({ ...prev, email: user.email || '' }));

        if (!hasRestoredProgressRef.current) {
          hasRestoredProgressRef.current = true;
          const saved = await restoreProgress();
          if (saved?.step1Data) {
            setStep1Data(prev => ({ ...prev, ...saved.step1Data }));
            setStep2Data(saved.step2Data || {});
            setStep3Data(saved.step3Data || {});
            // Les objets File ne sont pas sérialisables — impossible de restaurer au-delà de l'étape 2
            // Les étapes 3+ (véhicule, documents) nécessitent de re-uploader les fichiers
            const maxRestorableStep = 2;
            setCurrentStep(Math.min(Math.max(saved.currentStep || 1, 1), maxRestorableStep));
          }
        }

        try {
          const driverDoc = await getDoc(doc(db, 'drivers', user.uid));
          if (driverDoc.exists()) {
            const data = driverDoc.data();
            if (data.status === 'action_required' || data.status === 'rejected') {
              setRejectionCode(data.rejectionCode || 'R000');
              setRejectionReason(data.rejectionReason || data.rejectionMessage || 'Votre dossier nécessite une action.');
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
            } else if (['pending', 'approved', 'active'].includes(data.status)) {
              setError('Votre dossier est en cours de traitement ou déjà validé.');
              setTimeout(() =>
                redirectWithFallback(router, '/driver/dashboard', loggerRef.current, isMountedRef, redirectTimeoutRef),
                2000
              );
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
    userId: string
  ): Promise<string | null> => {
    if (!file) return null;
    return retryWithBackoff(
      async () => {
        const user = auth.currentUser;
        if (!user || user.uid !== userId) throw new Error('Utilisateur non authentifié');
        const ext = file.name.split('.').pop() || 'tmp';
        const storageRef = ref(storage, `drivers/${userId}/${fileCategory}/${Date.now()}.${ext}`);
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

  const handleStep0Next = (selectedDriverType: DriverType) => {
    setDriverType(selectedDriverType);
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
    try {
      if (!isExistingUser) {
        const credential = await createUserWithEmailAndPassword(auth, data.email, data.password);
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
      setCurrentStep(2);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error?.code === 'auth/email-already-in-use') {
        setError('Cet email est déjà utilisé. Essayez de vous connecter.');
      } else if (error?.code === 'auth/weak-password') {
        setError('Le mot de passe est trop faible. Utilisez au moins 6 caractères.');
      } else {
        setError(error?.message || 'Erreur inconnue');
      }
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

  const handleStep5FinalSubmit = async (data: Step5FormData) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setLoading(true);
    setError(null);

    if (!checkConnectivity()) {
      setError("Vous n'êtes pas connecté à internet.");
      setLoading(false);
      setIsSubmitting(false);
      return;
    }

    const user = auth.currentUser;
    const userId = user?.uid;
    if (!userId || !user) {
      setError('Vous devez être connecté pour soumettre votre dossier.');
      setLoading(false);
      setIsSubmitting(false);
      return;
    }

    // Variables accessibles dans le catch pour le cleanup Storage
    let uploadResults: PromiseSettledResult<string | null>[] = [];

    try {
      await user.getIdToken(true);

      uploadResults = await Promise.allSettled([
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

      const failedUploads = uploadResults.filter(r => r.status === 'rejected');
      if (failedUploads.length > 0) {
        setError("Erreur lors de l'upload de certains fichiers. Veuillez réessayer.");
        return;
      }

      const getValue = (r: PromiseSettledResult<string | null>) =>
        r.status === 'fulfilled' ? r.value : null;

      if (!step2Data.ssn || step2Data.ssn.trim().length < 5) {
        setError('Le numéro d\'assurance sociale est requis. Veuillez compléter l\'étape Identité.');
        setCurrentStep(2);
        setLoading(false);
        setIsSubmitting(false);
        return;
      }
      let encryptedSsn = null;
      encryptedSsn = await retryWithBackoff(
        () => serverEncryptionService.encryptSSN(step2Data.ssn!),
        { maxAttempts: 3 }
      );
      await auditLoggingService.logSSNEncryption(userId, true);

      const carData = (driverType === 'chauffeur' || driverType === 'les_deux') ? {
        brand: step3Data.carBrand,
        model: step3Data.carModel,
        year: step3Data.productionYear,
        color: step3Data.carColor,
        seats: step3Data.passengerSeats,
        fuelType: step3Data.fuelType,
        mileage: step3Data.mileage,
        techControlDate: step3Data.techControlDate,
      } : undefined;

      const finalDriverData: Record<string, unknown> = {
        uid: userId,
        firstName: step2Data.firstName,
        lastName: step2Data.lastName,
        email: step1Data.email || auth.currentUser?.email || '',
        phone: step2Data.phone || step1Data.phone || '',
        dob: step2Data.dob,
        nationality: step2Data.nationality,
        address: step2Data.address,
        city: step2Data.city,
        zipCode: step2Data.zipCode,
        ssn: encryptedSsn,
        driverType,
        vehicleType,
        cityId: process.env.NEXT_PUBLIC_DEFAULT_CITY_ID || 'edmonton',
        documents: {
          biometricPhoto: getValue(uploadResults[0]),
          carRegistration: getValue(uploadResults[1]),
          insurance: getValue(uploadResults[2]),
          techControl: getValue(uploadResults[3]),
          vehicleExterior: getValue(uploadResults[4]),
          vehicleInterior: getValue(uploadResults[5]),
          idFront: getValue(uploadResults[6]),
          idBack: getValue(uploadResults[7]),
          licenseFront: getValue(uploadResults[8]),
          licenseBack: getValue(uploadResults[9]),
        },
        status: 'pending',
        userType: 'chauffeur',
        createdAt: firestoreServerTimestamp(),
        updatedAt: firestoreServerTimestamp(),
        isAvailable: false,
        rating: 0,
        tripsCompleted: 0,
      };

      if (carData) {
        finalDriverData.car = carData;
      }

      await auth.currentUser?.getIdToken(true);
      const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
      const functions = getFunctions(app, functionsRegion);
      const createDriverProfile = httpsCallable(functions, 'createDriverProfile');
      await retryWithBackoff(() => createDriverProfile({ driverId: userId, driverData: finalDriverData }), {
        maxAttempts: 3,
      });

      try {
        await retryWithBackoff(
          () => emailVerificationService.sendVerificationEmail(
            auth.currentUser?.email || '',
            step2Data.firstName || undefined
          ),
          { maxAttempts: 3 }
        );
        await auditLoggingService.log({
          eventType: AuditEventType.EMAIL_VERIFICATION_SENT,
          userId,
          level: AuditLogLevel.INFO,
          action: 'Email de vérification envoyé après inscription',
          success: true,
          details: { email: auth.currentUser?.email },
        });
      } catch {
        // Non-bloquant
      }

      await clearProgress();
      setSubmissionSuccess(true);

      let stripeOnboardingUrl: string | null = null;
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        if (token && auth.currentUser?.email) {
          const connectRes = await fetch('/api/stripe/connect/account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ email: auth.currentUser.email, country: 'CA' }),
          });
          if (connectRes.ok || connectRes.status === 409) {
            const onboardRes = await fetch('/api/stripe/connect/onboard', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                returnUrl: `${window.location.origin}/driver/verify?onboarding=success`,
                refreshUrl: `${window.location.origin}/driver/verify?onboarding=refresh`,
              }),
            });
            if (onboardRes.ok) {
              const { url } = await onboardRes.json();
              stripeOnboardingUrl = url;
            }
          }
        }
      } catch {
        // Non-bloquant
      }

      if (stripeOnboardingUrl) {
        window.location.href = stripeOnboardingUrl;
      } else {
        await redirectWithFallback(
          router,
          '/driver/dashboard?submission=1&stripe=pending',
          loggerRef.current,
          isMountedRef,
          redirectTimeoutRef
        );
      }
    } catch (err: unknown) {
      // Cleanup des fichiers Storage orphelins uploadés avant l'échec de createDriverProfile
      const uploadedUrls = uploadResults
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && typeof r.value === 'string')
        .map(r => r.value);

      for (const url of uploadedUrls) {
        try {
          const fileRef = ref(storage, url);
          await deleteObject(fileRef);
        } catch {
          // Ignorer les erreurs de cleanup individuel
        }
      }

      const error = err as { code?: string; message?: string };
      let errorMessage = "Erreur lors de l'inscription. Veuillez réessayer.";
      if (error?.code === 'permission-denied') {
        errorMessage = 'Erreur de permissions. Veuillez vous reconnecter.';
      } else if (error?.code === 'storage/unauthorized') {
        errorMessage = "Erreur lors de l'upload des fichiers.";
      } else if (error?.message) {
        errorMessage = `Erreur : ${error.message}`;
      }
      setError(errorMessage);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
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
      const token = await auth.currentUser?.getIdToken();
      if (!token) return { success: false, error: 'Session expirée. Reconnectez-vous.' };

      const res = await fetch('/api/auth/send-verification-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error ?? 'Erreur lors de l\'envoi du code.' };
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Erreur réseau. Réessayez.' };
    }
  };

  const handleVerifyCode = async (code: string): Promise<{ success: boolean; error?: string; attemptsLeft?: number }> => {
    if (!checkConnectivity()) {
      return { success: false, error: 'Pas de connexion internet.' };
    }
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return { success: false, error: 'Session expirée. Reconnectez-vous.' };

      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error, attemptsLeft: data.attemptsLeft };
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Erreur réseau. Réessayez.' };
    }
  };

  return {
    // State
    currentStep,
    loading,
    error,
    isOnline: connectivityOnline,
    isSubmitting,
    submissionSuccess,
    rejectionCode,
    rejectionReason,
    emailVerificationAttempts,
    setEmailVerificationAttempts,
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
  };
}
