// src/hooks/useDriverRegistration.ts
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db, storage, app } from '@/config/firebase';
import { createUserWithEmailAndPassword, onAuthStateChanged, deleteUser, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp as firestoreServerTimestamp, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AuthService } from '@/services';
import { serverEncryptionService } from '@/services/server-encryption.service';
import { auditLoggingService } from '@/services/audit-logging.service';
import { secureStorage } from '@/services/secureStorage.service';
import { StructuredLogger } from '@/utils/logger';
import { retryWithBackoff } from '@/utils/retry';
import { redirectWithFallback } from '@/utils/navigation';
import { useConnectivityMonitor, checkConnectivity } from '@/hooks/useConnectivityMonitor';
import { DEFAULT_DRIVER_COUNTRY_CODE, ACTIVE_MARKET } from '@/utils/constants';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
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
  const browserListenerRef = useRef<{ remove: () => void } | null>(null);
  const hasRestoredProgressRef = useRef(false);
  const loggerRef = useRef<StructuredLogger>(new StructuredLogger(null, 'DriverRegistration'));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (emailRetryTimerRef.current) clearTimeout(emailRetryTimerRef.current);
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      browserListenerRef.current?.remove();
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
          // Forcer le refresh du token avant la lecture Firestore
          // Évite les erreurs permission-denied sur mobile où le token
          // peut ne pas être propagé quand onAuthStateChanged se déclenche.
          await user.getIdToken(true);
          const driverDoc = await getDoc(doc(db, 'drivers', user.uid));
          if (driverDoc.exists()) {
            const data = driverDoc.data();
            if (data.status === 'action_required' || data.status === 'rejected') {
              setRejectionCode(data.rejectionCode || 'R000');
              setRejectionReason(data.rejectionReason || data.rejectionMessage || 'Votre dossier nécessite une action.');
              // RGPD #C2 : les PII (dob/nationality/address) vivent dans la
              // sous-collection `drivers/{uid}/private/personal`.
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
                dob: (privateData.dob as string) || '',
                nationality: (privateData.nationality as string) || DEFAULT_DRIVER_COUNTRY_CODE,
                ssn: '',
                address: (privateData.address as string) || '',
                city: data.city || '',
                zipCode: data.zipCode || '',
              }));
            } else if (['pending', 'approved', 'active'].includes(data.status)) {
              setError('Votre dossier est en cours de traitement ou déjà validé.');
              setTimeout(() =>
                (redirectTimeoutRef.current = redirectWithFallback(router, '/driver/dashboard')),
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
    // Référence capturée immédiatement après la création — protège contre
    // les race conditions où auth.currentUser pourrait changer entre la
    // création du compte et l'entrée dans le bloc catch (onAuthStateChanged async).
    let newlyCreatedUser: User | null = null;
    try {
      if (!isExistingUser) {
        // Créer uniquement le compte Firebase Auth — le profil driver complet
        // est créé à Step5 via Cloud Function createDriverProfile.
        // Ne pas écrire dans users/ (réservé aux clients, userType='client').
        const credential = await createUserWithEmailAndPassword(auth, data.email, data.password);
        newlyCreatedUser = credential.user;
      }
      setStep1Data(data);
      // Envoyer le code OTP — Step1 reste visible en Phase B
      // Le passage à Step2 est déclenché par Step1Intent après vérification réussie
      const sendResult = await handleSendVerificationCode(data.email);
      if (!sendResult.success) {
        throw new Error(sendResult.error ?? 'Erreur lors de l\'envoi du code de vérification.');
      }
      // Ne PAS appeler setCurrentStep(2) ici
    } catch (err: unknown) {
      // Nettoyer le compte Auth si créé dans cette session mais étape suivante échouée.
      // On utilise newlyCreatedUser (capturé juste après la création) plutôt que
      // auth.currentUser pour éviter les race conditions avec onAuthStateChanged.
      if (newlyCreatedUser) {
        try {
          await deleteUser(newlyCreatedUser);
        } catch (cleanupErr) {
          console.error('[useDriverRegistration] Erreur suppression compte Auth orphelin après échec OTP:', cleanupErr);
        }
      }
      const error = err as { code?: string; message?: string };
      if (error?.code === 'auth/email-already-in-use') {
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
    data: Step3FormData,
    files: {
      registration?: File;
      insurance?: File;
      techControl?: File;
      interiorPhoto?: File;
      exteriorPhoto?: File;
    }
  ) => {
    setStep3Data(data);
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
        return uploadFileWithRetry(file, category, userId);
      };

      uploadResults = await Promise.allSettled([
        uploadFileWithRetry(biometricsPhoto, 'biometrics', userId),
        requiresVehicleDocs ? uploadIfValid(vehicleFiles.registration, 'documents') : Promise.resolve(null),
        requiresVehicleDocs ? uploadIfValid(vehicleFiles.insurance, 'documents') : Promise.resolve(null),
        requiresVehicleDocs ? uploadIfValid(vehicleFiles.techControl, 'documents') : Promise.resolve(null),
        requiresVehicleDocs ? uploadIfValid(vehicleFiles.exteriorPhoto, 'vehicle_photos') : Promise.resolve(null),
        requiresVehicleDocs ? uploadIfValid(vehicleFiles.interiorPhoto, 'vehicle_photos') : Promise.resolve(null),
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
        isSubmittingRef.current = false;
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

      // Construit la map documents conditionnellement : n'inclure une entrée
      // que si l'upload a effectivement produit une URL (évite les faux documents
      // "pending" avec url=null pour les livreurs non-voiture).
      // RGPD #C2 : cette map vit dans la sous-collection `drivers/{uid}/private/personal`
      // et NON à la racine du doc driver.
      const documents: Record<string, { url: string; status: string }> = {};
      const addDoc = (key: string, url: string | null) => {
        if (url) documents[key] = { url, status: 'pending' };
      };
      addDoc('biometricPhoto', getValue(uploadResults[0]));
      addDoc('carRegistration', getValue(uploadResults[1]));
      addDoc('insurance', getValue(uploadResults[2]));
      addDoc('techControl', getValue(uploadResults[3]));
      addDoc('vehicleExterior', getValue(uploadResults[4]));
      addDoc('vehicleInterior', getValue(uploadResults[5]));
      addDoc('idFront', getValue(uploadResults[6]));
      addDoc('idBack', getValue(uploadResults[7]));
      addDoc('licenseFront', getValue(uploadResults[8]));
      addDoc('licenseBack', getValue(uploadResults[9]));

      // === RGPD #C2 : split public vs private ===
      // Champs publics — doc racine `drivers/{uid}` (lisible par utilisateurs auth)
      const publicData: Record<string, unknown> = {
        uid: userId,
        firstName: step2Data.firstName,
        lastName: step2Data.lastName,
        email: step1Data.email || auth.currentUser?.email || '',
        phone: step2Data.phone || step1Data.phone || '',
        city: step2Data.city,
        zipCode: step2Data.zipCode,
        driverType,
        vehicleType,
        cityId: process.env.NEXT_PUBLIC_DEFAULT_CITY_ID || 'edmonton',
        status: 'pending',
        userType: 'chauffeur',
        createdAt: firestoreServerTimestamp(),
        updatedAt: firestoreServerTimestamp(),
        isAvailable: false,
        rating: 0,
        tripsCompleted: 0,
      };

      if (carData) {
        publicData.car = carData;
      }

      // Champs sensibles — sous-collection `drivers/{uid}/private/personal`
      const privateData: Record<string, unknown> = {
        dob: step2Data.dob,
        nationality: step2Data.nationality,
        address: step2Data.address,
        ssn: encryptedSsn,
        documents,
        updatedAt: firestoreServerTimestamp(),
      };

      await auth.currentUser?.getIdToken(true);
      const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
      const functions = getFunctions(app, functionsRegion);
      const createDriverProfile = httpsCallable(functions, 'createDriverProfile');
      // 1) CF crée le doc racine (Admin SDK — seul moyen d'écrire userType='chauffeur')
      await retryWithBackoff(() => createDriverProfile({ driverId: userId, driverData: publicData }), {
        maxAttempts: 3,
      });

      // 2) Client écrit la sous-collection privée (owner uniquement via rules)
      // Utilise un writeBatch pour garantir l'atomicité de l'écriture privée.
      const batch = writeBatch(db);
      batch.set(doc(db, 'drivers', userId, 'private', 'personal'), privateData, { merge: true });
      await batch.commit();

      await clearProgress();
      setSubmissionSuccess(true);

      let stripeOnboardingUrl: string | null = null;
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        if (token && auth.currentUser?.email) {
          const connectRes = await fetch('/api/stripe/connect/account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ email: auth.currentUser.email, country: ACTIVE_MARKET }),
          });
          if (connectRes.ok || connectRes.status === 409) {
            const onboardRes = await fetch('/api/stripe/connect/onboard', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                returnUrl: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/driver/verify?onboarding=success`,
                refreshUrl: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/driver/verify?onboarding=refresh`,
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
        if (Capacitor.isNativePlatform()) {
          browserListenerRef.current?.remove();
          await Browser.open({ url: stripeOnboardingUrl });
          const listener = await Browser.addListener('browserFinished', () => {
            browserListenerRef.current = null;
            router.push('/driver/dashboard?submission=1&stripe=pending');
          });
          browserListenerRef.current = listener;
        } else {
          window.location.href = stripeOnboardingUrl;
        }
      } else {
        redirectTimeoutRef.current = redirectWithFallback(
          router,
          '/driver/dashboard?submission=1&stripe=pending'
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
      let errorMessage = "Erreur lors de la soumission. Vos fichiers ont été supprimés. Veuillez réessayer — si l'erreur persiste, reconnectez-vous pour reprendre votre dossier.";
      if (error?.code === 'permission-denied') {
        errorMessage = 'Session expirée. Veuillez vous reconnecter puis reprendre votre inscription.';
      } else if (error?.code === 'storage/unauthorized') {
        errorMessage = "Erreur lors de l'upload des fichiers. Veuillez réessayer.";
      } else if (error?.message) {
        errorMessage = `Erreur : ${error.message}`;
      }
      setError(errorMessage);
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
