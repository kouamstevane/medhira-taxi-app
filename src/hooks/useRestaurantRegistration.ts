'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  type UserCredential,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { db, auth, functions } from '@/config/firebase';
import { mapHttpsError } from '@/services/cloud-functions.helpers';

export interface Step1Data {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phoneNumber?: string;
  country?: string;
}

export interface Step2Data {
  emailVerified: boolean;
}

export interface Step3Data {
  name: string;
  description: string;
  cuisineType: string[];
  address: string;
  phone: string;
  email: string;
  avgPricePerPerson?: number;
  imageUrl?: string;
  coverImageUrl?: string;
  location?: { lat: number; lng: number };
}

export interface Step4Data {
  openingHours: Record<string, { open: string; close: string; closed: boolean }>;
}

type Step = 1 | 2 | 3 | 4;

export function useRestaurantRegistration() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromBecomePro = searchParams.get('from') === 'become-pro';
  const resubmitRestaurantId = searchParams.get('resubmit');

  const [currentStep, setCurrentStep] = useState<Step>(fromBecomePro ? 3 : 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restoringDraft, setRestoringDraft] = useState(false);
  const [alreadyHasRestaurant, setAlreadyHasRestaurant] = useState(false);

  const [step1Data, setStep1DataState] = useState<Partial<Step1Data>>({});
  const [step2Data, setStep2DataState] = useState<Partial<Step2Data>>({});
  const [step3Data, setStep3DataState] = useState<Partial<Step3Data>>({});
  const [step4Data, setStep4DataState] = useState<Partial<Step4Data>>({});

  const goToStep = useCallback((step: number) => {
    if (step >= 1 && step <= 4) {
      setCurrentStep(step as Step);
      setError(null);
    }
  }, []);

  const skipToStep3 = useCallback(() => {
    setCurrentStep(3);
    setStep2DataState({ emailVerified: true });
    const authedEmail = auth.currentUser?.email;
    if (authedEmail) {
      setStep3DataState((prev) => ({ ...prev, email: prev.email || authedEmail }));
    }
    setError(null);
  }, []);

  const setStepData = useCallback((step: number, data: Record<string, unknown>) => {
    switch (step) {
      case 1: setStep1DataState((prev) => ({ ...prev, ...data })); break;
      case 2: setStep2DataState((prev) => ({ ...prev, ...data })); break;
      case 3: setStep3DataState((prev) => ({ ...prev, ...data })); break;
      case 4: setStep4DataState((prev) => ({ ...prev, ...data })); break;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
      if (!user) return;
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists() && snap.data().roles?.restaurant != null) {
        setAlreadyHasRestaurant(true);
        setError('Vous avez déjà un restaurant associé à ce compte.');
      }
    });
    return () => unsubscribe();
  }, []);

  const handleStep1Submit = useCallback(async (data: Step1Data) => {
    setLoading(true);
    setError(null);
    let cred: UserCredential | null = null;
    try {
      setStep1DataState(data);
      cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email: data.email,
        phoneNumber: data.phoneNumber ?? null,
        emailVerified: false,
        firstName: data.firstName,
        lastName: data.lastName,
        roles: { client: { enabled: true, joinedAt: serverTimestamp() } },
        activeRole: 'client',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCurrentStep(2);
    } catch (err: unknown) {
      if (cred) {
        try { await deleteUser(cred.user); } catch { /* silent */ }
      }
      const mapped = mapHttpsError(err);
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code: string }).code === 'auth/email-already-in-use'
      ) {
        const msg = 'Cet email est déjà utilisé. Connectez-vous pour ajouter un restaurant.';
        setError(msg);
        toast.error(msg);
      } else {
        setError(mapped.message);
        toast.error(mapped.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleStep2Verified = useCallback(async () => {
    setStep2DataState({ emailVerified: true });
    const user = auth.currentUser;
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          emailVerified: true,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // non-blocking
      }
    }
    setStep3DataState((prev) => ({
      ...prev,
      email: prev.email || step1Data.email || user?.email || '',
    }));
    setCurrentStep(3);
  }, [step1Data.email]);

  const handleDraftSave = useCallback(async (data: Partial<Step3Data>, step: 3 | 4) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const draftData = { ...data } as Record<string, unknown>;
      if ('cuisineType' in draftData) {
        draftData.cuisineTypes = draftData.cuisineType;
        delete draftData.cuisineType;
      }
      await updateDoc(doc(db, 'users', user.uid), {
        draftRestaurant: {
          currentStep: step,
          data: draftData,
          updatedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });
    } catch {
      // silent — draft is best-effort
    }
  }, []);

  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDraftDebounced = useCallback((data: Partial<Step3Data>, step: 3 | 4) => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      handleDraftSave(data, step);
    }, 1500);
  }, [handleDraftSave]);

  useEffect(() => {
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, []);

  const handleSubmit = useCallback(async (data: Step4Data) => {
    setLoading(true);
    setIsSubmitting(true);
    setError(null);
    try {
      setStep4DataState(data);
      const user = auth.currentUser;
      if (!user) throw new Error('Non authentifié');

      const submit = httpsCallable(functions, 'submitRestaurantApplication');

      const payload: Record<string, unknown> = {
        name: step3Data.name,
        description: step3Data.description,
        address: step3Data.address,
        phone: step3Data.phone,
        email: step3Data.email,
        cuisineType: step3Data.cuisineType,
        avgPricePerPerson: step3Data.avgPricePerPerson,
        imageUrl: step3Data.imageUrl,
        coverImageUrl: step3Data.coverImageUrl,
        openingHours: data.openingHours,
        location: step3Data.location,
      };
      if (resubmitRestaurantId) {
        payload.restaurantId = resubmitRestaurantId;
      }

      const result = await submit(payload);
      const resultData = result.data as { restaurantId: string };
      setRestaurantId(resultData.restaurantId);
      setSubmissionSuccess(true);
      router.replace(`/restaurant/pending?id=${resultData.restaurantId}`);
    } catch (err: unknown) {
      const mapped = mapHttpsError(err);
      setError(mapped.message);
      toast.error(mapped.message);
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  }, [step3Data, resubmitRestaurantId, router]);

  useEffect(() => {
    if (!fromBecomePro) return;
    const unsubscribe = onAuthStateChanged(getAuth(), (user) => {
      if (!user) {
        router.replace('/auth/role');
      } else {
        setStep1DataState((prev) => ({
          ...prev,
          email: user.email || prev.email || '',
          firstName: user.displayName || prev.firstName || '',
        }));
        setStep2DataState({ emailVerified: true });
      }
    });
    return () => unsubscribe();
  }, [fromBecomePro, router]);

  useEffect(() => {
    if (currentStep !== 1 && !fromBecomePro) return;
    setRestoringDraft(true);
    const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
      if (!user) {
        setRestoringDraft(false);
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.draftRestaurant && data.draftRestaurant.data) {
            const draftData = { ...data.draftRestaurant.data } as Record<string, unknown>;
            if ('cuisineTypes' in draftData) {
              (draftData as Record<string, unknown>).cuisineType = draftData.cuisineTypes;
              delete draftData.cuisineTypes;
            }
            setStep3DataState((prev) => ({ ...prev, ...draftData }));
            if (data.draftRestaurant.currentStep === 3) {
              setCurrentStep(3);
            } else if (data.draftRestaurant.currentStep === 4) {
              setStep4DataState((prev) => ({
                ...prev,
                openingHours: data.draftRestaurant.data?.openingHours || prev.openingHours,
              }));
              setCurrentStep(4);
            }
          }
        }
      } catch {
        // silent — draft restoration is best-effort
      } finally {
        setRestoringDraft(false);
      }
    });
    return () => unsubscribe();
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromBecomePro]);

  useEffect(() => {
    if (!resubmitRestaurantId) return;
    const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, 'restaurants', resubmitRestaurantId));
        if (snap.exists()) {
          const r = snap.data();
          setStep3DataState({
            name: r.name || '',
            description: r.description || '',
            cuisineType: r.cuisineType || [],
            address: r.address || '',
            phone: r.phone || '',
            email: r.email || '',
            avgPricePerPerson: r.avgPricePerPerson,
            imageUrl: r.imageUrl,
            coverImageUrl: r.coverImageUrl,
            location: r.location,
          });
          if (r.openingHours) {
            setStep4DataState({ openingHours: r.openingHours });
          }
        }
      } catch {
        // silent — pre-fill is best-effort
      }
    });
    return () => unsubscribe();
  }, [resubmitRestaurantId]);

  return {
    currentStep,
    loading,
    error,
    isSubmitting,
    submissionSuccess,
    restaurantId,
    fromBecomePro,
    restoringDraft,
    alreadyHasRestaurant,
    step1Data,
    step2Data,
    step3Data,
    step4Data,
    goToStep,
    skipToStep3,
    setStepData,
    setError,
    clearError,
    handleStep1Submit,
    handleStep2Verified,
    handleDraftSave,
    saveDraftDebounced,
    handleSubmit,
  };
}
