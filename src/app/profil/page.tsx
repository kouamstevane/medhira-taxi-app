"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { Controller, useForm } from 'react-hook-form';

import { auth, db, functions, getFirebaseStorage } from '@/config/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { GlassCard } from '@/components/ui/GlassCard';
import { BottomNav } from '@/components/ui/BottomNav';
import { NetworkErrorView } from '@/components/ui';
import { InputField } from '@/components/forms/InputField';
import { SelectField } from '@/components/forms/SelectField';
import { ProtectedPageGuard } from '@/components/auth/ProtectedPageGuard';
import type { PlaceSuggestion } from '@/types';
import { useTranslation } from '@/hooks/useTranslation';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import { getFirestoreErrorMessage, isFirestoreNetworkError, logFirestoreError } from '@/utils/firestore-error-handler';

import { shouldOpenAddressEditor } from './profile-navigation';
import { ProfileAddressField } from './ProfileAddressField';
import { buildProfileUpdate, persistProfileUpdate } from './profile-update';
import { ProfileMenuItem } from './ProfileMenuItem';
import { ProfileSupportModal } from './ProfileSupportModal';
import { ProfileReferralModal } from './ProfileReferralModal';
import { ProfileFaqModal } from './ProfileFaqModal';
import { ProfilePartnerModal } from './ProfilePartnerModal';
import { ProfilePaymentMethodsModal, type CardDetails } from './ProfilePaymentMethodsModal';
import { subscribeToWallet } from '@/services/wallet.service';

interface ProfileFormData {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  bio: string;
}

function ProfilPageContent() {
  const { currentUser, userData: authUserData, reloadUser } = useAuth();
  const { t } = useTranslation();
  const [userData, setUserData] = useState({
    firstName: authUserData?.firstName || '',
    lastName: authUserData?.lastName || '',
    email: currentUser?.email || authUserData?.email || '',
    phone: authUserData?.phoneNumber || '',
    address: authUserData?.address || '',
    city: authUserData?.city || '',
    country: authUserData?.country || 'Canada',
    bio: authUserData?.bio || '',
  });

  const [hasPaymentMethod, setHasPaymentMethod] = useState(false);
  const [cardDetails, setCardDetails] = useState<CardDetails>({});
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState(authUserData?.profileImageUrl || '');
  const [loading, setLoading] = useState(!authUserData);
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const router = useRouter();
  const { autocompleteService } = useGoogleMaps();
  const { showSuccess, showError } = useToast();

  const form = useForm<ProfileFormData>({
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      address: '',
      city: '',
      country: 'Canada',
      bio: '',
    },
  });

  // Update form values when entering edit mode
  useEffect(() => {
    if (editing) {
      form.reset({
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone,
        address: userData.address,
        city: userData.city,
        country: userData.country,
        bio: userData.bio,
      });
    }
  }, [userData, editing, form]);

  useEffect(() => {
    if (typeof window !== 'undefined' && shouldOpenAddressEditor(window.location.search)) {
      setEditing(true);
    }
  }, []);

  // Sync with AuthContext data
  useEffect(() => {
    if (authUserData && !editing) {
      setUserData((prev) => ({
        firstName: authUserData.firstName || prev.firstName,
        lastName: authUserData.lastName || prev.lastName,
        email: currentUser?.email || authUserData.email || prev.email,
        phone: authUserData.phoneNumber || prev.phone,
        address: authUserData.address || prev.address,
        city: authUserData.city || prev.city,
        country: authUserData.country || prev.country,
        bio: authUserData.bio || prev.bio,
      }));
      if (authUserData.profileImageUrl) {
        setProfileImageUrl(authUserData.profileImageUrl);
      }
      if (authUserData.defaultPaymentMethodId) {
        setHasPaymentMethod(true);
        setCardDetails({
          last4: authUserData.cardLast4 || String(authUserData.defaultPaymentMethodId).slice(-4),
          brand: authUserData.cardBrand,
          expMonth: authUserData.cardExpMonth,
          expYear: authUserData.cardExpYear,
        });
      } else {
        setHasPaymentMethod(false);
        setCardDetails({});
      }
    }
  }, [authUserData, currentUser, editing]);

  const fetchUserData = useCallback(async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    setIsNetworkError(false);
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        const hasPm = Boolean(data.defaultPaymentMethodId);
        setHasPaymentMethod(hasPm);
        if (hasPm) {
          setCardDetails({
            last4: data.cardLast4 || (data.defaultPaymentMethodId ? String(data.defaultPaymentMethodId).slice(-4) : undefined),
            brand: data.cardBrand || undefined,
            expMonth: data.cardExpMonth || undefined,
            expYear: data.cardExpYear || undefined,
          });
        } else {
          setCardDetails({});
        }
        setUserData({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: currentUser.email || data.email || '',
          phone: data.phone || data.phoneNumber || '',
          address: data.address || '',
          city: data.city || '',
          country: data.country || 'Canada',
          bio: data.bio || '',
        });
        setProfileImageUrl(data.profileImageUrl || '');
      } else {
        router.replace('/login');
      }
    } catch (err) {
      console.error('Erreur chargement profil:', err);
      if (
        isFirestoreNetworkError(err) ||
        (err as Error)?.message?.toLowerCase().includes('offline') ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      ) {
        setIsNetworkError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser, router]);

  useEffect(() => {
    void fetchUserData();
  }, [fetchUserData]);

  // Real-time wallet balance subscription
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = subscribeToWallet(
      currentUser.uid,
      (wallet) => {
        setWalletBalance(wallet.balance || 0);
      },
      (err) => {
        console.warn('Erreur souscription wallet profil:', err);
      }
    );
    return () => {
      unsubscribe();
    };
  }, [currentUser]);

  const handleRemoveCard = async () => {
    try {
      const callable = httpsCallable<unknown, { success: boolean }>(functions, 'detachPaymentMethod');
      await callable();
      setHasPaymentMethod(false);
      setCardDetails({});
      showSuccess(t('profile.cardDeleted') || 'Carte retirée avec succès');
      await reloadUser();
    } catch (err) {
      console.error('Erreur suppression carte:', err);
      showError(t('common.error') || 'Erreur lors de la suppression de la carte');
    }
  };

  const handleRetry = useCallback(() => {
    void fetchUserData();
  }, [fetchUserData]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProfileImage(e.target.files[0]);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImageUrl(reader.result as string);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleSubmit = async (data: ProfileFormData) => {
    setError(null);
    setLoading(true);

    try {
      let imageUrl = profileImageUrl;
      if (profileImage) {
        const storageRef = ref(getFirebaseStorage(), `profile_images/${currentUser?.uid}`);
        const snapshot = await uploadBytes(storageRef, profileImage);
        imageUrl = await getDownloadURL(snapshot.ref);
      }

      const user = auth.currentUser;
      if (!user) throw new Error('No user');

      const userRef = doc(db, 'users', user.uid);
      await persistProfileUpdate(
        () =>
          setDoc(
            userRef,
            {
              ...buildProfileUpdate(data, user.email, imageUrl),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          ),
        reloadUser
      );

      setUserData((prev) => ({ ...prev, ...data }));
      setEditing(false);
      showSuccess(t('profile.profileUpdated'));
    } catch (err) {
      logFirestoreError(err, 'mise à jour du profil client');
      const errorMessage = getFirestoreErrorMessage(err, 'mise à jour de votre profil');
      showError(errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut(auth);
      router.replace('/login');
    } catch (err) {
      console.error('Erreur de déconnexion:', err);
      showError(t('profile.logoutError'));
      setLoggingOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmWord = t('profile.deleteConfirmWord');
    const inputClean = deleteConfirmText.trim().toUpperCase();
    if (inputClean !== confirmWord && inputClean !== 'SUPPRIMER' && inputClean !== 'DELETE') return;
    setDeleting(true);
    try {
      const requestAccountDeletion = httpsCallable(functions, 'requestAccountDeletion');
      await requestAccountDeletion({ confirm: 'DELETE_MY_ACCOUNT' });
      try {
        await signOut(auth);
      } catch {}
      showSuccess(t('profile.deleteSuccess'));
      router.replace('/login');
    } catch (err: unknown) {
      const deletionError = err as { code?: string; message?: string };
      console.error('Erreur suppression compte:', deletionError);
      let msg = t('profile.deleteErrorGeneral');
      if (
        deletionError?.message?.includes('courses') ||
        deletionError?.message?.includes('commandes')
      ) {
        msg = t('profile.deleteErrorActiveOrders');
      } else if (deletionError?.code === 'functions/resource-exhausted') {
        msg = t('profile.deleteErrorRateLimit');
      }
      showError(msg);
      setDeleting(false);
    }
  };

  const countries = ['Canada', 'France', 'Belgique', 'Cameroun', 'Autre'];

  // User display name & phone calculation
  const fullName = [userData.firstName, userData.lastName].filter(Boolean).join(' ');
  const displayName = (fullName || currentUser?.displayName || currentUser?.email?.split('@')[0] || t('profile.user')).toUpperCase();
  const displayPhone = userData.phone || currentUser?.phoneNumber || userData.email || '';
  const referralCode = currentUser?.uid ? `MED-${currentUser.uid.slice(0, 6).toUpperCase()}` : 'MEDJIRA2026';
  const hasDriverRole = Boolean(authUserData?.roles?.driver);
  const hasRestaurantRole = Boolean(authUserData?.roles?.restaurant);
  const hasProRole = hasDriverRole || hasRestaurantRole;

  if (loading && !editing) {
    return (
      <div className="min-h-screen bg-[#121214] font-sans text-slate-100 flex items-center justify-center">
        <MaterialIcon name="refresh" className="animate-spin text-primary text-[44px]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#141312] text-slate-100 font-sans antialiased pb-28">
      <div className="max-w-[440px] mx-auto px-4 pt-4">
        {/* Top Back Button */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/dashboard"
            className="w-11 h-11 rounded-full flex items-center justify-center text-slate-200 hover:text-white hover:bg-white/10 active:scale-95 transition"
            aria-label={t('common.back')}
          >
            <MaterialIcon name="arrow_back" className="text-[22px]" />
          </Link>
        </div>

        {/* Network Error State */}
        {isNetworkError && !userData.email && !userData.firstName ? (
          <NetworkErrorView
            title={t('common.error')}
            message={t('common.networkErrorMessage')}
            onRetry={handleRetry}
          />
        ) : editing ? (
          /* ================= VIEW B : EDIT PROFILE ================= */
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition"
              >
                <MaterialIcon name="arrow_back" size="sm" />
              </button>
              <h1 className="text-xl font-bold text-white">{t('profile.editProfileTitle')}</h1>
            </div>

            {error && (
              <div className="p-3.5 bg-destructive/15 border border-destructive/30 text-destructive text-sm rounded-2xl flex justify-between items-center">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-destructive font-bold ml-2"
                >
                  <MaterialIcon name="close" size="sm" />
                </button>
              </div>
            )}

            <GlassCard className="p-5">
              {/* Photo Upload */}
              <div className="flex flex-col items-center mb-6">
                <div className="relative w-24 h-24 rounded-full overflow-hidden ring-2 ring-primary/40 shadow-lg mb-3">
                  {profileImageUrl ? (
                    <Image
                      src={profileImageUrl}
                      alt={t('profile.profilePhoto')}
                      width={96}
                      height={96}
                      className="w-full h-full object-cover"
                      priority
                      unoptimized={profileImageUrl.includes('googleusercontent.com')}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-white/10 flex items-center justify-center">
                      <MaterialIcon name="person" className="text-slate-400 text-[40px]" />
                    </div>
                  )}
                </div>

                <label className="cursor-pointer bg-white/10 hover:bg-white/15 text-white text-xs font-semibold py-2 px-4 rounded-xl transition flex items-center gap-2 border border-white/10">
                  <MaterialIcon name="photo_camera" size="sm" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  {t('profile.changePhoto')}
                </label>
              </div>

              {/* Edit Form */}
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <InputField
                  type="email"
                  label={t('profile.email')}
                  value={userData.email}
                  disabled
                  helperText={t('profile.emailCannotChange')}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InputField
                    {...form.register('firstName')}
                    label={t('profile.firstName')}
                    placeholder={t('profile.firstNamePlaceholder')}
                    required
                  />
                  <InputField
                    {...form.register('lastName')}
                    label={t('profile.lastName')}
                    placeholder={t('profile.lastNamePlaceholder')}
                    required
                  />
                </div>

                <InputField
                  type="tel"
                  {...form.register('phone')}
                  label={t('profile.phone')}
                  placeholder={t('profile.phonePlaceholder')}
                  helperText={t('profile.phoneCountryNotice')}
                  required
                />

                <Controller
                  name="address"
                  control={form.control}
                  render={({ field }) => (
                    <ProfileAddressField
                      value={field.value}
                      onChange={field.onChange}
                      onSelect={(suggestion: PlaceSuggestion) =>
                        field.onChange(suggestion.description)
                      }
                      autocompleteService={autocompleteService}
                    />
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InputField
                    type="text"
                    {...form.register('city')}
                    label={t('profile.city')}
                    placeholder={t('profile.cityPlaceholder')}
                  />
                  <SelectField
                    {...form.register('country')}
                    label={t('profile.country')}
                    options={countries.map((c) => ({ value: c, label: c }))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {t('profile.aboutMe')}
                  </label>
                  <textarea
                    {...form.register('bio')}
                    rows={3}
                    className="glass-input w-full rounded-xl p-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:ring-2 focus:ring-primary"
                    placeholder={t('profile.aboutMePlaceholder')}
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setError(null);
                      form.reset();
                    }}
                    className="flex-1 h-12 rounded-2xl bg-white/10 hover:bg-white/15 text-slate-300 font-medium text-sm transition"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold text-sm flex items-center justify-center gap-2 primary-glow transition active:scale-[0.98]"
                  >
                    {loading ? (
                      <MaterialIcon name="refresh" className="animate-spin" size="sm" />
                    ) : (
                      t('common.save')
                    )}
                  </button>
                </div>
              </form>
            </GlassCard>
          </div>
        ) : (
          /* ================= VIEW A : MAIN PROFILE MENU ================= */
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* User Identity Header Card */}
            <div className="flex items-center justify-between py-1 px-1">
              <div className="space-y-1 pr-3 flex-1 min-w-0">
                <h1 className="text-2xl font-black tracking-tight text-white uppercase truncate">
                  {displayName}
                </h1>
                <p className="text-sm font-medium text-slate-400 truncate">
                  {displayPhone}
                </p>
              </div>

              {/* Avatar */}
              <div
                onClick={() => setEditing(true)}
                className="w-16 h-16 rounded-full overflow-hidden bg-[#262629] border border-white/15 shrink-0 flex items-center justify-center cursor-pointer active:scale-95 transition shadow-lg relative group"
                title={t('profile.editProfile')}
              >
                {profileImageUrl ? (
                  <Image
                    src={profileImageUrl}
                    alt={displayName}
                    width={64}
                    height={64}
                    className="w-full h-full object-cover"
                    priority
                    unoptimized={profileImageUrl.includes('googleusercontent.com')}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                ) : (
                  <MaterialIcon name="person" className="text-slate-400 text-[32px]" />
                )}
              </div>
            </div>

            {/* SECTION 1: Paramètres du compte */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                {t('profile.accountSettings')}
              </h2>
              <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-1.5 divide-y divide-white/[0.04]">
                <ProfileMenuItem
                  icon="handshake"
                  iconColorVariant="sky"
                  title={hasProRole ? t('profile.partnerArea') : t('profile.becomePartner')}
                  subtitle={hasProRole ? t('profile.accessProDashboard') : t('profile.becomePartnerSubtitle')}
                  badge={!hasProRole ? t('profile.newBadge') : undefined}
                  onClick={() => setShowPartnerModal(true)}
                />
                <ProfileMenuItem
                  icon="person"
                  iconColorVariant="sky"
                  title={t('profile.personalInfo')}
                  onClick={() => setEditing(true)}
                />
                <ProfileMenuItem
                  icon="credit_card"
                  iconColorVariant="sky"
                  title={t('profile.paymentMethodsAndWallet')}
                  subtitle={hasPaymentMethod ? t('profile.savedCard') : t('profile.addPaymentMethod')}
                  onClick={() => setShowPaymentModal(true)}
                />
                <ProfileMenuItem
                  icon="lock"
                  iconColorVariant="sky"
                  title={t('profile.securityAndLogin')}
                  href="/auth/reset-password"
                />
              </div>
            </div>

            {/* SECTION: Préférences & Langue */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                {t('profile.preferences')}
              </h2>
              <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                    <MaterialIcon name="language" size="md" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t('profile.language')}</p>
                    <p className="text-xs text-slate-400">{t('profile.languageDesc')}</p>
                  </div>
                </div>
                <LanguageSelector variant="toggle" />
              </div>
            </div>

            {/* SECTION 2: Obtenir de l'aide */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                {t('profile.helpSection')}
              </h2>
              <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-1.5 divide-y divide-white/[0.04]">
                <ProfileMenuItem
                  icon="help_outline"
                  iconColorVariant="purple"
                  title={t('profile.faq')}
                  subtitle={t('profile.faqSubtitle')}
                  onClick={() => setShowFaqModal(true)}
                />
                <ProfileMenuItem
                  icon="support_agent"
                  iconColorVariant="purple"
                  title={t('profile.contactSupport')}
                  subtitle={t('profile.contactSupportSubtitle')}
                  onClick={() => setShowSupportModal(true)}
                />
              </div>
            </div>

            {/* SECTION 3: Activité & Services */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                {t('profile.activitySection')}
              </h2>
              <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-1.5 divide-y divide-white/[0.04]">
                <ProfileMenuItem
                  icon="history"
                  iconColorVariant="amber"
                  title={t('profile.rideHistory')}
                  subtitle={t('profile.rideHistorySubtitle')}
                  href="/historique"
                />
                <ProfileMenuItem
                  icon="storefront"
                  iconColorVariant="amber"
                  title={t('profile.availableCities')}
                  subtitle={t('profile.availableCitiesSubtitle')}
                  onClick={() =>
                    showSuccess(t('common.appSubSlogan'))
                  }
                />
              </div>
            </div>

            {/* SECTION 4: Récompenses */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                {t('profile.referral')}
              </h2>
              <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-1.5 divide-y divide-white/[0.04]">
                <ProfileMenuItem
                  icon="favorite"
                  iconColorVariant="pink"
                  title={t('profile.referral')}
                  subtitle={t('profile.referralSubtitle')}
                  onClick={() => setShowReferralModal(true)}
                />
              </div>
            </div>

            {/* SECTION 5: Mentions légales */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                {t('auth.termsOfService')}
              </h2>
              <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-1.5 divide-y divide-white/[0.04]">
                <ProfileMenuItem
                  icon="menu_book"
                  iconColorVariant="emerald"
                  title={t('profile.privacyPolicy')}
                  href="/privacy"
                />
                <ProfileMenuItem
                  icon="description"
                  iconColorVariant="emerald"
                  title={t('profile.termsOfService')}
                  href="/terms"
                />
              </div>
            </div>

            {/* SECTION 6: Déconnexion & Compte */}
            <div className="space-y-1.5">
              <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-1.5 divide-y divide-white/[0.04]">
                <ProfileMenuItem
                  icon="logout"
                  iconColorVariant="slate"
                  title={loggingOut ? t('profile.loggingOut') : t('profile.logout')}
                  onClick={loggingOut ? undefined : handleLogout}
                />
                <ProfileMenuItem
                  icon="delete_forever"
                  iconColorVariant="destructive"
                  title={t('profile.deleteAccount')}
                  destructive
                  onClick={() => {
                    setDeleteConfirmText('');
                    setShowDeleteModal(true);
                  }}
                />
              </div>
            </div>

            {/* App Version & Copyright Footer */}
            <div className="text-center pt-4 pb-2 space-y-1 text-slate-500">
              <p className="text-[11px] font-medium tracking-wider uppercase">
                {t('profile.appVersion')} 1.0.0 (2508122)
              </p>
              <p className="text-[10px]">
                © Medjira Taxi. {t('profile.allRightsReserved')}
              </p>
            </div>
          </div>
        )}

        {/* Delete Account Confirmation Modal */}
        {showDeleteModal && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            onClick={() => !deleting && setShowDeleteModal(false)}
          >
            <div
              className="w-full max-w-md bg-[#18181b] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-destructive/15 flex items-center justify-center mb-3">
                  <MaterialIcon name="warning" className="text-destructive text-[32px]" />
                </div>
                <h3 className="text-lg font-bold text-white">{t('profile.deleteAccountConfirmTitle')}</h3>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                  {t('profile.deleteAccountIrreversible')}
                </p>
              </div>

              <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-3 text-xs text-slate-300 space-y-1">
                <p>{t('profile.deleteBulletProfile')}</p>
                <p>{t('profile.deleteBulletFinancial')}</p>
                <p>{t('profile.deleteBulletLogout')}</p>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  {t('profile.deleteTypePrompt', { confirmWord: t('profile.deleteConfirmWord') })}
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  disabled={deleting}
                  placeholder={t('profile.deleteConfirmWord')}
                  className="glass-input w-full rounded-xl p-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:ring-2 focus:ring-destructive"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="flex-1 h-12 rounded-2xl bg-white/10 hover:bg-white/15 text-slate-300 text-sm font-medium transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={
                    deleting ||
                    (deleteConfirmText.trim().toUpperCase() !== t('profile.deleteConfirmWord') &&
                      deleteConfirmText.trim().toUpperCase() !== 'SUPPRIMER' &&
                      deleteConfirmText.trim().toUpperCase() !== 'DELETE')
                  }
                  className="flex-1 h-12 rounded-2xl bg-destructive text-white font-bold text-sm transition-all hover:bg-destructive/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <MaterialIcon name="refresh" className="animate-spin" size="sm" />
                      {t('profile.deleteProgress')}
                    </>
                  ) : (
                    t('common.delete')
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modals */}
        <ProfileSupportModal
          isOpen={showSupportModal}
          onClose={() => setShowSupportModal(false)}
        />
        <ProfileReferralModal
          isOpen={showReferralModal}
          onClose={() => setShowReferralModal(false)}
          referralCode={referralCode}
        />
        <ProfileFaqModal
          isOpen={showFaqModal}
          onClose={() => setShowFaqModal(false)}
        />
        <ProfilePartnerModal
          isOpen={showPartnerModal}
          onClose={() => setShowPartnerModal(false)}
          hasDriverRole={hasDriverRole}
          hasRestaurantRole={hasRestaurantRole}
        />
        <ProfilePaymentMethodsModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          hasPaymentMethod={hasPaymentMethod}
          cardDetails={cardDetails}
          cardholderName={`${userData.firstName} ${userData.lastName}`.trim()}
          walletBalance={walletBalance}
          onRemoveCard={handleRemoveCard}
        />
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}

export default function ProfilPage() {
  return (
    <ProtectedPageGuard redirectTo="/login">
      <ProfilPageContent />
    </ProtectedPageGuard>
  );
}
