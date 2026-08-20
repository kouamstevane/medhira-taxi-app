'use client';

import { useState, useCallback, useContext, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getAuth,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  runTransaction,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { db, auth, functions } from '@/config/firebase';
import { mapHttpsError } from '@/services/cloud-functions.helpers';
import { createRestaurantOnboardingAccount, signInWithGoogleForRestaurant } from '@/services/auth.service';
import { AuthContext } from '@/context/AuthContext';
import {
  getRestaurantImagePathFromUrl,
  prepareRestaurantImage,
} from '@/utils/restaurant-image';
import {
  deleteRestaurantImage,
  uploadRestaurantImage,
} from '@/services/restaurant-image.service';

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
  logoUrl?: string;
  coverImageUrl?: string;
  logoFile?: File;
  coverFile?: File;
  logoRemoved?: boolean;
  coverRemoved?: boolean;
  location: { lat: number; lng: number };
}

export interface Step4Data {
  openingHours: Record<string, { open: string; close: string; closed: boolean }>;
}

type Step = 1 | 2 | 3 | 4;

export function useRestaurantRegistration() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authContext = useContext(AuthContext);
  const fromBecomePro = searchParams.get('from') === 'become-pro';
  const resumeRestaurant = searchParams.get('resume') === 'restaurant';
  const resubmitRestaurantId = searchParams.get('resubmit');

  const [currentStep, setCurrentStep] = useState<Step>(resumeRestaurant ? 2 : fromBecomePro ? 3 : 1);
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

  const markRestaurantOnboarding = useCallback(async (userId: string, currentStep: 2 | 3 | 4) => {
    const now = serverTimestamp();
    await updateDoc(doc(db, 'users', userId), {
      'onboarding.restaurant.status': 'draft',
      'onboarding.restaurant.currentStep': currentStep,
      'onboarding.restaurant.updatedAt': now,
      activeRole: 'restaurant_onboarding',
      accountState: 'restaurant_onboarding',
      updatedAt: now,
    });
  }, []);

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
    try {
      setStep1DataState(data);
      await createRestaurantOnboardingAccount(data.email, data.password, {
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber ?? null,
      });
      setCurrentStep(2);
    } catch (err: unknown) {
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

  const handleGoogleSignIn = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await signInWithGoogleForRestaurant();
      await markRestaurantOnboarding(user.uid, 3);
      skipToStep3();
    } catch (err: unknown) {
      const mapped = mapHttpsError(err);
      setError(mapped.message);
      toast.error(mapped.message);
    } finally {
      setLoading(false);
    }
  }, [markRestaurantOnboarding, skipToStep3]);

  const handleStep2Verified = useCallback(async () => {
    setStep2DataState({ emailVerified: true });
    const user = auth.currentUser;
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          'onboarding.restaurant.status': 'draft',
          'onboarding.restaurant.currentStep': 3,
          'onboarding.restaurant.updatedAt': serverTimestamp(),
          activeRole: 'restaurant_onboarding',
          accountState: 'restaurant_onboarding',
          updatedAt: serverTimestamp(),
        });
        if (authContext) {
          await authContext.reloadUser();
        } else {
          await user.reload();
        }
      } catch (err: unknown) {
        const mapped = mapHttpsError(err);
        setError(mapped.message);
        toast.error(mapped.message);
        return;
      }
    }
    setStep3DataState((prev) => ({
      ...prev,
      email: prev.email || step1Data.email || user?.email || '',
    }));
    setCurrentStep(3);
  }, [authContext, step1Data.email]);

  const handleDraftSave = useCallback(async (data: Record<string, unknown> | Partial<Step3Data> | Partial<Step4Data>, step: 3 | 4) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const newFields = { ...data } as Record<string, unknown>;
      delete newFields.logoFile;
      delete newFields.coverFile;
      if ('cuisineType' in newFields) {
        newFields.cuisineTypes = newFields.cuisineType;
        delete newFields.cuisineType;
      }

      const userRef = doc(db, 'users', user.uid);
      await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        const existingDraftData = (userSnap.data()?.draftRestaurant?.data ?? {}) as Record<string, unknown>;
        const mergedDraftData = { ...existingDraftData, ...newFields };
        const now = serverTimestamp();

        transaction.update(userRef, {
          draftRestaurant: {
            currentStep: step,
            data: mergedDraftData,
            updatedAt: now,
          },
          'onboarding.restaurant.status': 'draft',
          'onboarding.restaurant.currentStep': step,
          'onboarding.restaurant.updatedAt': now,
          activeRole: 'restaurant_onboarding',
          accountState: 'restaurant_onboarding',
          updatedAt: now,
        });
      });
    } catch {
      // silent — draft is best-effort
    }
  }, []);

  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDraftDebounced = useCallback((data: Record<string, unknown> | Partial<Step3Data> | Partial<Step4Data>, step: 3 | 4) => {
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

      if (!step3Data.location) {
        throw new Error("Impossible de soumettre le restaurant sans coordonnées vérifiées.");
      }

      const payload: Record<string, unknown> = {
        name: step3Data.name,
        description: step3Data.description,
        address: step3Data.address,
        phone: step3Data.phone,
        email: step3Data.email,
        cuisineType: step3Data.cuisineType,
        avgPricePerPerson: step3Data.avgPricePerPerson,
        imageUrl: step3Data.imageUrl,
        logoUrl: step3Data.logoUrl,
        coverImageUrl: step3Data.coverImageUrl,
        openingHours: data.openingHours,
        location: step3Data.location,
      };

      const requestPayload: Record<string, unknown> = { data: payload };
      if (resubmitRestaurantId) {
        requestPayload.restaurantId = resubmitRestaurantId;
      }

      const result = await submit(requestPayload);
      const resultData = result.data as { restaurantId: string };

      const uploadedPaths: string[] = [];
      const visualUpdates: Record<string, unknown> = {};
      try {
        const visualInputs: Array<{
          kind: 'logo' | 'cover';
          file?: File;
          removed?: boolean;
          field: 'logoUrl' | 'coverImageUrl';
          previousUrl?: string;
        }> = [
          {
            kind: 'logo',
            file: step3Data.logoFile,
            removed: step3Data.logoRemoved,
            field: 'logoUrl',
            previousUrl: step3Data.logoUrl,
          },
          {
            kind: 'cover',
            file: step3Data.coverFile,
            removed: step3Data.coverRemoved,
            field: 'coverImageUrl',
            previousUrl: step3Data.coverImageUrl,
          },
        ];

        for (const visual of visualInputs) {
          if (visual.file) {
            const preparedImage = await prepareRestaurantImage(visual.file, visual.kind);
            const uploadedImage = await uploadRestaurantImage({
              restaurantId: resultData.restaurantId,
              kind: visual.kind,
              blob: preparedImage,
            });
            uploadedPaths.push(uploadedImage.path);
            visualUpdates[visual.field] = uploadedImage.url;
          } else if (visual.removed) {
            visualUpdates[visual.field] = null;
          }
        }

        if (Object.keys(visualUpdates).length > 0) {
          await updateDoc(doc(db, 'restaurants', resultData.restaurantId), {
            ...visualUpdates,
            updatedAt: serverTimestamp(),
          });
        }

        for (const visual of visualInputs) {
          const nextUrl = visualUpdates[visual.field];
          const previousPath = visual.previousUrl
            ? getRestaurantImagePathFromUrl(visual.previousUrl)
            : null;
          if (previousPath && nextUrl !== undefined && nextUrl !== visual.previousUrl) {
            await deleteRestaurantImage(previousPath);
          }
        }
      } catch (visualError) {
        await Promise.all(uploadedPaths.map((path) => deleteRestaurantImage(path).catch(() => undefined)));
        throw visualError;
      }

      if (authContext) {
        await authContext.reloadUser();
      }
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
  }, [authContext, step3Data, resubmitRestaurantId, router]);

  useEffect(() => {
    if (!resumeRestaurant) return;
    setRestoringDraft(true);
    const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
      if (!user) {
        router.replace('/auth/role');
        return;
      }
      try {
        setStep1DataState((prev) => ({
          ...prev,
          email: user.email || prev.email || '',
        }));
        await markRestaurantOnboarding(user.uid, 2);
      } catch {
        setError('Impossible de reprendre cette inscription. Réessayez.');
      } finally {
        setRestoringDraft(false);
      }
    });
    return () => unsubscribe();
  }, [markRestaurantOnboarding, resumeRestaurant, router]);

  useEffect(() => {
    if (!fromBecomePro) return;
    const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
      if (!user) {
        router.replace('/auth/role');
      } else {
        try {
          await markRestaurantOnboarding(user.uid, 3);
        } catch {
          setError('Impossible de reprendre cette inscription. Réessayez.');
          return;
        }
        setStep1DataState((prev) => ({
          ...prev,
          email: user.email || prev.email || '',
          firstName: user.displayName || prev.firstName || '',
        }));
        setStep2DataState({ emailVerified: true });
      }
    });
    return () => unsubscribe();
  }, [fromBecomePro, markRestaurantOnboarding, router]);

  useEffect(() => {
    if (currentStep !== 1 && !fromBecomePro && !resumeRestaurant) return;
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
  }, [fromBecomePro, resumeRestaurant]);

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
            logoUrl: r.logoUrl,
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
    handleGoogleSignIn,
    handleStep2Verified,
    handleDraftSave,
    saveDraftDebounced,
    handleSubmit,
  };
}
