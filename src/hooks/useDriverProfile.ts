// src/hooks/useDriverProfile.ts
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { auth, db, storage } from '@/config/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getFirestoreErrorMessage, logFirestoreError } from '@/utils/firestore-error-handler';
import { ACTIVE_MARKET } from '@/utils/constants';
import { useDriverStore, type DriverCoreData, type DriverPrivateData } from '@/store/driverStore';
import type { ConnectAccountStatus } from '@/types/stripe';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

export interface StripeConnectData {
  stripeAccountId: string | null;
  status: ConnectAccountStatus;
  weeklyPayoutEnabled: boolean;
  pendingBalance: number;
  currency: string;
  lastPayoutAt: string | null;
}

export function useDriverProfile() {
  const router = useRouter();
  const { isEmailVerified } = useAuth();
  const { driver, setDriver, updateDriver } = useDriverStore();

  const [loading, setLoading] = useState(!driver);
  const [error, setError] = useState<string | null>(null);
  // RGPD #C2 : données privées (dob, nationality, address, documents)
  // lues depuis `drivers/{uid}/private/personal`
  const [privateData, setPrivateData] = useState<DriverPrivateData | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<DriverCoreData>>({});
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [stripeData, setStripeData] = useState<StripeConnectData | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState('');
  const [payoutToggleLoading, setPayoutToggleLoading] = useState(false);
  const [manualPayoutLoading, setManualPayoutLoading] = useState(false);
  const [payoutSuccess, setPayoutSuccess] = useState('');

  const mountedRef = useRef(true);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const browserListenerRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      timeoutsRef.current.forEach(clearTimeout);
      browserListenerRef.current?.remove();
    };
  }, []);

  const fetchStripeData = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setStripeLoading(true);
    setStripeError('');
    try {
      const driverDoc = await getDoc(doc(db, 'drivers', user.uid));
      if (driverDoc.exists()) {
        const d = driverDoc.data();
        const cur = (d.currency as string) ?? 'cad';
        const isZeroDecimal = ['xaf', 'xof'].includes(cur.toLowerCase());
        setStripeData({
          stripeAccountId: d.stripeAccountId ?? null,
          status: (d.stripeAccountStatus as ConnectAccountStatus) ?? 'not_created',
          weeklyPayoutEnabled: d.weeklyPayoutEnabled ?? false,
          pendingBalance: d.pendingBalanceCents ? (isZeroDecimal ? d.pendingBalanceCents : d.pendingBalanceCents / 100) : 0,
          currency: cur,
          lastPayoutAt: d.lastPayoutAt?.toDate?.()?.toISOString?.() ?? null,
        });
      }
    } catch {
      // Stripe Connect optionnel
    } finally {
      setStripeLoading(false);
    }
  }, []);

  // RGPD #C2 : fetch dédié des données privées (dob/nationality/address/documents)
  const fetchPrivateData = useCallback(async (uid: string) => {
    try {
      const snap = await getDoc(doc(db, 'drivers', uid, 'private', 'personal'));
      if (!mountedRef.current) return;
      if (snap.exists()) {
        setPrivateData(snap.data() as DriverPrivateData);
      } else {
        setPrivateData({});
      }
    } catch {
      // Lecture non bloquante — si refusé, l'UI affiche simplement "Non disponible"
      if (mountedRef.current) setPrivateData({});
    }
  }, []);

  useEffect(() => {
    if (driver) {
      setFormData({
        firstName: driver.firstName,
        lastName: driver.lastName,
        phone: driver.phone,
        car: driver.car,
      });
      setLoading(false);
      fetchStripeData();
      const user = auth.currentUser;
      if (user) fetchPrivateData(user.uid);
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      router.push('/driver/login');
      return;
    }

    getDoc(doc(db, 'drivers', user.uid)).then(docSnap => {
      if (!mountedRef.current) return;
      if (docSnap.exists()) {
        const data = docSnap.data() as DriverCoreData;
        setDriver(data);
        setFormData({
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          car: data.car,
        });
        fetchStripeData();
        fetchPrivateData(user.uid);
      } else {
        setError('Profil chauffeur non trouvé');
      }
    }).catch(() => {
      setError('Erreur de chargement du profil');
    }).finally(() => {
      setLoading(false);
    });
  }, [router, driver, setDriver, fetchStripeData, fetchPrivateData]);

  const handleUpdateProfile = useCallback(async () => {
    if (!auth.currentUser || !formData) return;
    if (!isEmailVerified) {
      setError('Vous devez vérifier votre email avant de modifier votre profil.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const updates: Partial<DriverCoreData> = { ...formData };
      if (profileImage) {
        const storageRef = ref(storage, `drivers/${auth.currentUser.uid}/profile`);
        await uploadBytes(storageRef, profileImage);
        updates.profileImageUrl = await getDownloadURL(storageRef);
      }
      await updateDoc(doc(db, 'drivers', auth.currentUser.uid), updates);
      updateDriver(updates);
      setEditMode(false);
    } catch (err) {
      logFirestoreError(err, 'mise à jour du profil chauffeur');
      setError(getFirestoreErrorMessage(err, 'mise à jour de votre profil'));
    } finally {
      setLoading(false);
    }
  }, [formData, isEmailVerified, profileImage, updateDriver]);

  const toggleAvailability = useCallback(async () => {
    if (!auth.currentUser || !driver) return;
    const prevValue = driver.isAvailable;
    const newValue = !prevValue;
    updateDriver({ isAvailable: newValue });
    try {
      await updateDoc(doc(db, 'drivers', auth.currentUser.uid), { isAvailable: newValue });
    } catch (err) {
      updateDriver({ isAvailable: prevValue });
      logFirestoreError(err, 'changement de disponibilité');
      setError(getFirestoreErrorMessage(err, 'changement de statut'));
    }
  }, [driver, updateDriver]);

  const handleCreateStripeAccount = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !driver) return;
    setStripeLoading(true);
    setStripeError('');
    try {
      const createAccountFn = httpsCallable(functions, 'createConnectAccount');
      await createAccountFn({ country: ACTIVE_MARKET });

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const createLinkFn = httpsCallable<{ returnUrl: string; refreshUrl: string }, { url: string }>(functions, 'createConnectOnboardLink');
      const linkResult = await createLinkFn({
        returnUrl: `${baseUrl}/driver/payments/setup?onboarding=success`,
        refreshUrl: `${baseUrl}/driver/payments/setup?onboarding=refresh`,
      });
      const linkData = linkResult.data;
      if (linkData.url) {
        if (Capacitor.isNativePlatform()) {
          browserListenerRef.current?.remove();
          await Browser.open({ url: linkData.url });
          const listener = await Browser.addListener('browserFinished', () => {
            browserListenerRef.current = null;
            if (mountedRef.current) fetchStripeData();
          });
          browserListenerRef.current = listener;
        } else {
          window.location.href = linkData.url;
        }
      }
    } catch (err) {
      setStripeError(err instanceof Error ? err.message : 'Erreur Stripe');
    } finally {
      setStripeLoading(false);
    }
  }, [driver, fetchStripeData]);

  const handleToggleWeeklyPayout = useCallback(async (enabled: boolean) => {
    const user = auth.currentUser;
    if (!user) return;
    setPayoutToggleLoading(true);
    setStripeError('');
    try {
      const payoutFn = httpsCallable<{ action: string; weeklyPayoutEnabled: boolean }, { success: boolean; message?: string }>(functions, 'stripeConnectPayout');
      const result = await payoutFn({ action: 'toggle_weekly', weeklyPayoutEnabled: enabled });
      const data = result.data;
      setStripeData(prev => prev ? { ...prev, weeklyPayoutEnabled: enabled } : prev);
      setPayoutSuccess(data.message ?? '');
      const timeout = setTimeout(() => {
        if (mountedRef.current) setPayoutSuccess('');
        timeoutsRef.current = timeoutsRef.current.filter(t => t !== timeout);
      }, 4000);
      timeoutsRef.current.push(timeout);
    } catch (err) {
      setStripeError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setPayoutToggleLoading(false);
    }
  }, []);

  const handleManualPayout = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setManualPayoutLoading(true);
    setStripeError('');
    try {
      const payoutFn = httpsCallable<{ action: string }, { amount?: number; currency?: string }>(functions, 'stripeConnectPayout');
      const result = await payoutFn({ action: 'manual_payout' });
      const data = result.data;
      setPayoutSuccess(`Virement de ${data.amount} ${data.currency?.toUpperCase()} envoyé !`);
      const timeout = setTimeout(() => {
        if (mountedRef.current) setPayoutSuccess('');
        timeoutsRef.current = timeoutsRef.current.filter(t => t !== timeout);
      }, 5000);
      timeoutsRef.current.push(timeout);
      await fetchStripeData();
    } catch (err) {
      setStripeError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setManualPayoutLoading(false);
    }
  }, [fetchStripeData]);

  return {
    driver,
    privateData,
    loading,
    error,
    editMode,
    setEditMode,
    formData,
    setFormData,
    profileImage,
    setProfileImage,
    isEmailVerified,
    stripeData,
    stripeLoading,
    stripeError,
    payoutToggleLoading,
    manualPayoutLoading,
    payoutSuccess,
    handleUpdateProfile,
    toggleAvailability,
    handleCreateStripeAccount,
    handleToggleWeeklyPayout,
    handleManualPayout,
    fetchStripeData,
  };
}
