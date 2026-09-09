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
import { getFirestoreErrorMessage, isFirestoreNetworkError, logFirestoreError } from '@/utils/firestore-error-handler';

import { shouldOpenAddressEditor } from './profile-navigation';
import { ProfileAddressField } from './ProfileAddressField';
import { buildProfileUpdate, persistProfileUpdate } from './profile-update';
import { ProfileMenuItem } from './ProfileMenuItem';
import { ProfileSupportModal } from './ProfileSupportModal';
import { ProfileReferralModal } from './ProfileReferralModal';
import { ProfileFaqModal } from './ProfileFaqModal';

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
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState(authUserData?.profileImageUrl || '');
  const [loading, setLoading] = useState(!authUserData);
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showFaqModal, setShowFaqModal] = useState(false);
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
        setHasPaymentMethod(Boolean(data.defaultPaymentMethodId));
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
      showSuccess('Profil mis à jour avec succès');
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
      showError('Impossible de vous déconnecter. Réessayez.');
      setLoggingOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'SUPPRIMER') return;
    setDeleting(true);
    try {
      const requestAccountDeletion = httpsCallable(functions, 'requestAccountDeletion');
      await requestAccountDeletion({ confirm: 'DELETE_MY_ACCOUNT' });
      try {
        await signOut(auth);
      } catch {}
      showSuccess('Votre compte a été supprimé.');
      router.replace('/login');
    } catch (err: unknown) {
      const deletionError = err as { code?: string; message?: string };
      console.error('Erreur suppression compte:', deletionError);
      let msg = 'Impossible de supprimer le compte. Réessayez plus tard.';
      if (
        deletionError?.message?.includes('courses') ||
        deletionError?.message?.includes('commandes')
      ) {
        msg =
          'Vous avez des courses ou commandes en cours. Annulez-les ou attendez leur fin avant de supprimer le compte.';
      } else if (deletionError?.code === 'functions/resource-exhausted') {
        msg = 'Trop de tentatives. Réessayez dans une heure.';
      }
      showError(msg);
      setDeleting(false);
    }
  };

  const countries = ['Canada', 'France', 'Belgique', 'Cameroun', 'Autre'];

  // User display name & phone calculation
  const fullName = [userData.firstName, userData.lastName].filter(Boolean).join(' ');
  const displayName = (fullName || currentUser?.displayName || 'VICTORINE YOUGO').toUpperCase();
  const displayPhone = userData.phone || currentUser?.phoneNumber || userData.email || '+237693372118';
  const referralCode = currentUser?.uid ? `MED-${currentUser.uid.slice(0, 6).toUpperCase()}` : 'MEDJIRA2026';

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
            aria-label="Retour à l'accueil"
          >
            <MaterialIcon name="arrow_back" className="text-[22px]" />
          </Link>
        </div>

        {/* Network Error State */}
        {isNetworkError && !userData.email && !userData.firstName ? (
          <NetworkErrorView
            title="Oops !"
            message="Impossible de charger votre profil. Veuillez vérifier votre connexion internet et réessayer."
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
              <h1 className="text-xl font-bold text-white">Modifier mes informations</h1>
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
                      alt="Photo de profil"
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
                  Changer la photo
                </label>
              </div>

              {/* Edit Form */}
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <InputField
                  type="email"
                  label="Email"
                  value={userData.email}
                  disabled
                  helperText="L'adresse email ne peut pas être modifiée."
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InputField
                    {...form.register('firstName')}
                    label="Prénom"
                    placeholder="Votre prénom"
                    required
                  />
                  <InputField
                    {...form.register('lastName')}
                    label="Nom"
                    placeholder="Votre nom"
                    required
                  />
                </div>

                <InputField
                  type="tel"
                  {...form.register('phone')}
                  label="Numéro de téléphone"
                  placeholder="693372118"
                  helperText="Format sans le code pays."
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
                    label="Ville"
                    placeholder="Votre ville"
                  />
                  <SelectField
                    {...form.register('country')}
                    label="Pays"
                    options={countries.map((c) => ({ value: c, label: c }))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    À propos de moi
                  </label>
                  <textarea
                    {...form.register('bio')}
                    rows={3}
                    className="glass-input w-full rounded-xl p-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:ring-2 focus:ring-primary"
                    placeholder="Parlez-nous un peu de vous..."
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
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold text-sm flex items-center justify-center gap-2 primary-glow transition active:scale-[0.98]"
                  >
                    {loading ? (
                      <MaterialIcon name="refresh" className="animate-spin" size="sm" />
                    ) : (
                      'Enregistrer'
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
                title="Modifier le profil"
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
                Paramètres du compte
              </h2>
              <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-1.5 divide-y divide-white/[0.04]">
                <ProfileMenuItem
                  icon="bolt"
                  iconColorVariant="sky"
                  title="Mode Chauffeur"
                  badge="Nouveau"
                  href="/auth/become-pro"
                />
                <ProfileMenuItem
                  icon="person"
                  iconColorVariant="sky"
                  title="Informations personnelles"
                  onClick={() => setEditing(true)}
                />
                <ProfileMenuItem
                  icon="credit_card"
                  iconColorVariant="sky"
                  title="Moyens de paiement & Wallet"
                  subtitle={hasPaymentMethod ? 'Carte enregistrée' : 'Ajouter un mode de paiement'}
                  href="/wallet"
                />
                <ProfileMenuItem
                  icon="lock"
                  iconColorVariant="sky"
                  title="Sécurité et connexion"
                  href="/auth/reset-password"
                />
              </div>
            </div>

            {/* SECTION 2: Obtenir de l'aide */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                Obtenir de l&apos;aide
              </h2>
              <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-1.5 divide-y divide-white/[0.04]">
                <ProfileMenuItem
                  icon="help_outline"
                  iconColorVariant="purple"
                  title="Consulter la FAQ"
                  onClick={() => setShowFaqModal(true)}
                />
                <ProfileMenuItem
                  icon="support_agent"
                  iconColorVariant="purple"
                  title="Contacter le service client"
                  onClick={() => setShowSupportModal(true)}
                />
              </div>
            </div>

            {/* SECTION 3: Activité & Services */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                Activité & Services
              </h2>
              <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-1.5 divide-y divide-white/[0.04]">
                <ProfileMenuItem
                  icon="history"
                  iconColorVariant="amber"
                  title="Historique des courses"
                  subtitle="Retrouvez vos trajets et reçus"
                  href="/historique"
                />
                <ProfileMenuItem
                  icon="storefront"
                  iconColorVariant="amber"
                  title="Villes & Services disponibles"
                  subtitle="Taxis, livraisons de repas et colis"
                  onClick={() =>
                    showSuccess('Services disponibles 24h/24 et 7j/7')
                  }
                />
              </div>
            </div>

            {/* SECTION 4: Récompenses */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                Récompenses
              </h2>
              <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-1.5 divide-y divide-white/[0.04]">
                <ProfileMenuItem
                  icon="favorite"
                  iconColorVariant="pink"
                  title="Parrainage"
                  subtitle="Invitez vos amis et gagnez des réductions"
                  onClick={() => setShowReferralModal(true)}
                />
              </div>
            </div>

            {/* SECTION 5: Mentions légales */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                Mentions légales
              </h2>
              <div className="rounded-3xl bg-[#1c1b1a] border border-white/[0.06] p-1.5 divide-y divide-white/[0.04]">
                <ProfileMenuItem
                  icon="menu_book"
                  iconColorVariant="emerald"
                  title="Politique de confidentialité"
                  href="/privacy"
                />
                <ProfileMenuItem
                  icon="description"
                  iconColorVariant="emerald"
                  title="Conditions de service"
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
                  title={loggingOut ? 'Déconnexion en cours...' : 'Se déconnecter'}
                  onClick={loggingOut ? undefined : handleLogout}
                />
                <ProfileMenuItem
                  icon="delete_forever"
                  iconColorVariant="destructive"
                  title="Supprimer mon compte"
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
                VERSION 1.0.0 (2508122)
              </p>
              <p className="text-[10px]">
                © Medjira Taxi. Tous droits réservés.
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
                <h3 className="text-lg font-bold text-white">Supprimer votre compte ?</h3>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                  Cette action est <strong className="text-destructive">irréversible</strong>. Vos données personnelles seront effacées et votre historique sera anonymisé conformément au RGPD.
                </p>
              </div>

              <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-3 text-xs text-slate-300 space-y-1">
                <p>• Profil, photos et coordonnées : supprimés</p>
                <p>• Historique financier : anonymisé (légal)</p>
                <p>• Déconnexion immédiate</p>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Tapez <span className="font-mono font-bold text-destructive">SUPPRIMER</span> pour confirmer :
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  disabled={deleting}
                  placeholder="SUPPRIMER"
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
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleting || deleteConfirmText !== 'SUPPRIMER'}
                  className="flex-1 h-12 rounded-2xl bg-destructive text-white font-bold text-sm transition-all hover:bg-destructive/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <MaterialIcon name="refresh" className="animate-spin" size="sm" />
                      Suppression...
                    </>
                  ) : (
                    'Supprimer'
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
