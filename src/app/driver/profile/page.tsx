"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteUser, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/config/firebase';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav, driverNavItems } from '@/components/ui/BottomNav';
import { useDriverProfile } from '@/hooks/useDriverProfile';
import { useAuth } from '@/hooks/useAuth';
import { CardSkeleton } from '@/components/ui/Skeleton';
import {
  getDriverAvailabilityProfileState,
  getDriverVerificationBadges,
  getVehicleProfileSummary,
} from './profile-ui';

function initialsOf(firstName?: string, lastName?: string): string {
  return [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
}

interface SectionTitleProps {
  icon: string;
  children: React.ReactNode;
}

function SectionTitle({ icon, children }: SectionTitleProps) {
  return (
    <div className="mb-3 flex items-center gap-2 px-1">
      <MaterialIcon name={icon} className="text-primary text-[18px]" />
      <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">{children}</h3>
    </div>
  );
}

interface InfoRowProps {
  label: string;
  value?: string | null;
  italic?: boolean;
}

function InfoRow({ label, value, italic }: InfoRowProps) {
  const display = value && value.length > 0 ? value : 'Non spécifié';
  const isEmpty = !value || value.length === 0;

  return (
    <div className="py-2">
      <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-[15px] text-white ${isEmpty || italic ? 'italic text-slate-500' : ''}`}>{display}</p>
    </div>
  );
}

export default function DriverProfilePage() {
  const router = useRouter();
  const { userData, reloadUser } = useAuth();
  const {
    driver,
    loading,
    error,
    editMode,
    setEditMode,
    formData,
    setFormData,
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
  } = useDriverProfile();

  const [signOutLoading, setSignOutLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [clientActivationLoading, setClientActivationLoading] = useState(false);
  const [clientActivationMessage, setClientActivationMessage] = useState<string | null>(null);
  const [clientActivationError, setClientActivationError] = useState<string | null>(null);

  const canActivateClientRole = userData?.roles?.client == null && userData?.activeRole !== 'driver_onboarding';

  async function handleSignOut() {
    setSignOutLoading(true);
    try {
      await signOut(auth);
      router.replace('/driver/login');
    } finally {
      setSignOutLoading(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== 'SUPPRIMER') return;
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        router.replace('/driver/login');
        return;
      }
      await deleteUser(user);
      router.replace('/driver/login');
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'auth/requires-recent-login') {
        setDeleteError('Pour des raisons de sécurité, reconnectez-vous puis réessayez.');
      } else {
        setDeleteError('Impossible de supprimer le compte. Réessayez ou contactez le support.');
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleActivateClientRole() {
    setClientActivationLoading(true);
    setClientActivationError(null);
    setClientActivationMessage(null);

    try {
      const activateClientRole = httpsCallable<unknown, { success: boolean }>(functions, 'activateClientRole');
      await activateClientRole();
      await reloadUser();
      setClientActivationMessage('Espace client activé. Vous pouvez maintenant changer d’espace depuis le sélecteur.');
    } catch (e: unknown) {
      const message = (e as { message?: string })?.message;
      setClientActivationError(message || 'Impossible d’activer l’espace client pour le moment.');
    } finally {
      setClientActivationLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[430px] space-y-4 bg-background p-4 font-sans text-slate-100 antialiased min-h-screen">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!driver && error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 font-sans text-slate-100 antialiased">
        <div className="glass-card w-full max-w-md rounded-2xl p-6 text-center">
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
          <button
            onClick={() => router.push('/driver/login')}
            className="primary-glow h-14 w-full rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] font-bold text-white transition-transform active:scale-[0.98]"
          >
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  if (!driver) return null;

  const vehicleSummary = getVehicleProfileSummary(driver.car);
  const verificationBadges = getDriverVerificationBadges({
    isEmailVerified,
    driverStatus: driver.status,
  });
  const availabilityState = getDriverAvailabilityProfileState({
    isApproved: driver.status === 'approved',
    isAvailable: Boolean(driver.isAvailable),
  });

  return (
    <div className="min-h-screen bg-background pb-28 font-sans text-slate-100 antialiased">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[430px] items-center justify-between px-4 py-4">
          <button onClick={() => router.push('/driver/dashboard')} className="-ml-2 rounded-xl p-2 transition hover:bg-white/5">
            <MaterialIcon name="arrow_back" className="text-[24px] text-primary" />
          </button>
          <h1 className="text-lg font-bold text-primary">Profil</h1>
          <button
            onClick={() => {
              if (isEmailVerified) setEditMode(!editMode);
            }}
            disabled={!isEmailVerified}
            className="-mr-2 rounded-xl p-2 transition hover:bg-white/5 disabled:opacity-40"
            aria-label={editMode ? 'Annuler' : 'Modifier'}
          >
            <MaterialIcon name={editMode ? 'close' : 'edit'} className="text-[22px] text-primary" />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[430px] space-y-5 px-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
            <MaterialIcon name="error" size="md" className="mt-0.5 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        <div className="glass-card flex flex-col items-center rounded-2xl p-6 text-center">
          <div className="mb-3 h-24 w-24 rounded-full border-2 border-primary p-1">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-white/5">
              <span className="text-2xl font-bold text-white">{initialsOf(driver.firstName, driver.lastName)}</span>
            </div>
          </div>
          <h2 className="text-xl font-bold text-white">{driver.firstName} {driver.lastName}</h2>
          <p className="text-sm text-slate-400">{driver.email}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {verificationBadges.map((badge) => (
              <span
                key={badge.label}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                  badge.tone === 'success'
                    ? 'border-green-500/30 bg-green-500/15 text-green-400'
                    : badge.tone === 'danger'
                      ? 'border-red-500/30 bg-red-500/15 text-red-400'
                      : badge.tone === 'neutral'
                        ? 'border-white/10 bg-white/5 text-slate-300'
                        : 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                }`}
              >
                <MaterialIcon
                  name={badge.tone === 'success' ? 'verified' : badge.tone === 'danger' ? 'error' : 'schedule'}
                  className="text-[12px]"
                />
                {badge.label}
              </span>
            ))}
          </div>
          {!editMode && (
            <button
              onClick={() => {
                if (isEmailVerified) setEditMode(true);
              }}
              disabled={!isEmailVerified}
              className="mt-4 h-10 rounded-full bg-white/10 px-6 text-sm font-medium text-white transition hover:bg-white/15 disabled:opacity-40"
            >
              Modifier
            </button>
          )}
        </div>

        <div className="glass-card flex items-center justify-between rounded-2xl px-4 py-3">
          <div className="pr-3">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${availabilityState.displayAvailable ? 'bg-green-500' : 'bg-slate-500'}`} />
              <span className="text-sm font-medium text-white">{availabilityState.label}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {availabilityState.detail} · {availabilityState.description}
            </p>
          </div>
          <button
            onClick={availabilityState.isInteractive ? toggleAvailability : undefined}
            disabled={!availabilityState.isInteractive}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              availabilityState.displayAvailable ? 'bg-primary' : 'bg-white/10'
            }`}
            aria-pressed={availabilityState.displayAvailable}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                availabilityState.displayAvailable ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div>
          <SectionTitle icon="person">Informations personnelles</SectionTitle>
          <div className="glass-card divide-y divide-white/[0.04] rounded-2xl px-5 py-3">
            {editMode ? (
              <div className="space-y-3 py-2">
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Prénom</label>
                  <input
                    type="text"
                    value={formData.firstName || ''}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="glass-input h-11 w-full rounded-xl px-3 text-white outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Nom</label>
                  <input
                    type="text"
                    value={formData.lastName || ''}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="glass-input h-11 w-full rounded-xl px-3 text-white outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Téléphone</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="glass-input h-11 w-full rounded-xl px-3 text-white outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Photo de profil</label>
                  <input
                    type="file"
                    onChange={(e) => setProfileImage(e.target.files?.[0] || null)}
                    className="glass-input h-11 w-full rounded-xl px-3 text-white file:mr-3 file:rounded-lg file:border-0 file:bg-primary/20 file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary"
                    accept="image/*"
                  />
                </div>
              </div>
            ) : (
              <>
                <InfoRow label="Prénom" value={driver.firstName} />
                <InfoRow label="Nom" value={driver.lastName} />
                <InfoRow label="Téléphone" value={driver.phone} />
                <InfoRow label="Email" value={driver.email} />
                <InfoRow label="Permis" value={driver.licenseNumber} />
              </>
            )}
          </div>
        </div>

        <div>
          <SectionTitle icon="directions_car">Véhicule</SectionTitle>
          <div className={`glass-card rounded-2xl ${editMode ? 'divide-y divide-white/[0.04] px-5 py-3' : 'p-4'}`}>
            {editMode ? (
              <div className="space-y-3 py-2">
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Modèle</label>
                  <input
                    type="text"
                    value={formData.car?.model || ''}
                    onChange={(e) => setFormData({ ...formData, car: { ...formData.car, model: e.target.value || undefined } })}
                    className="glass-input h-11 w-full rounded-xl px-3 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Plaque</label>
                  <input
                    type="text"
                    value={formData.car?.plate || ''}
                    onChange={(e) => setFormData({ ...formData, car: { ...formData.car, plate: e.target.value || undefined } })}
                    className="glass-input h-11 w-full rounded-xl px-3 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Couleur</label>
                  <input
                    type="text"
                    value={formData.car?.color || ''}
                    onChange={(e) => setFormData({ ...formData, car: { ...formData.car, color: e.target.value || undefined } })}
                    className="glass-input h-11 w-full rounded-xl px-3 text-white outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex size-11 flex-shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                  <MaterialIcon name="directions_car" className="text-[22px] text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{vehicleSummary.title}</p>
                  <p className="truncate text-xs text-slate-400">{vehicleSummary.subtitle}</p>
                </div>
                <button
                  onClick={() => {
                    if (isEmailVerified) setEditMode(true);
                  }}
                  disabled={!isEmailVerified}
                  className="h-9 flex-shrink-0 rounded-full bg-white/5 px-3 text-xs font-bold text-primary transition hover:bg-white/10 disabled:opacity-40"
                >
                  {vehicleSummary.isComplete ? 'Modifier' : 'Compléter'}
                </button>
              </div>
            )}
          </div>
        </div>

        {editMode && (
          <div className="flex gap-3">
            <button
              onClick={() => setEditMode(false)}
              className="h-12 flex-1 rounded-2xl bg-white/5 font-medium text-slate-300 transition-transform active:scale-[0.98]"
            >
              Annuler
            </button>
            <button
              onClick={handleUpdateProfile}
              disabled={loading}
              className="primary-glow h-12 flex-1 rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        )}

        <div>
          <SectionTitle icon="account_balance">Paiements & Stripe</SectionTitle>
          <div className="glass-card space-y-4 rounded-2xl p-5">
            {stripeError && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
                <MaterialIcon name="error" className="mt-0.5 text-[18px] text-destructive" />
                <span className="text-sm text-destructive">{stripeError}</span>
              </div>
            )}
            {payoutSuccess && (
              <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 p-3">
                <MaterialIcon name="check_circle" className="text-[18px] text-green-400" />
                <span className="text-sm text-green-400">{payoutSuccess}</span>
              </div>
            )}

            {stripeLoading ? (
              <div className="flex justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : !stripeData || stripeData.status === 'not_created' ? (
              <>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Solde en attente</p>
                  <p className="mt-1 text-3xl font-bold text-white">
                    0.00 <span className="text-base font-normal text-slate-400">CAD</span>
                  </p>
                </div>
                <p className="text-sm text-slate-400">Connectez un compte bancaire pour recevoir vos gains.</p>
                <button
                  onClick={handleCreateStripeAccount}
                  className="primary-glow h-12 w-full rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] font-bold text-white"
                >
                  Configurer Stripe
                </button>
              </>
            ) : (
              <>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Solde en attente</p>
                    <p className="mt-1 text-3xl font-bold text-white">
                      {((stripeData.pendingBalance ?? 0) / 100).toFixed(2)}{' '}
                      <span className="text-base font-normal text-slate-400">{stripeData.currency?.toUpperCase() ?? 'CAD'}</span>
                    </p>
                  </div>
                  {stripeData.status === 'active' && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-400">
                      <MaterialIcon name="verified" className="text-[11px]" />
                      VÉRIFIÉ
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="min-w-0 pr-3">
                    <p className="text-sm font-medium text-white">Versement automatique</p>
                    <p className="text-xs text-slate-500">
                      {stripeData.weeklyPayoutEnabled ? 'Chaque lundi (70%)' : 'Manuel — vous décidez'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleWeeklyPayout(!stripeData.weeklyPayoutEnabled)}
                    disabled={payoutToggleLoading}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
                      stripeData.weeklyPayoutEnabled ? 'bg-primary' : 'bg-white/10'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        stripeData.weeklyPayoutEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={handleManualPayout}
                    disabled={manualPayoutLoading || (stripeData.pendingBalance ?? 0) <= 0}
                    className="primary-glow h-12 w-full rounded-2xl bg-gradient-to-r from-primary to-[#ffae33] font-bold text-white disabled:opacity-40"
                  >
                    {manualPayoutLoading ? 'Virement en cours...' : 'Virer maintenant'}
                  </button>
                  <button
                    onClick={handleCreateStripeAccount}
                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 font-medium text-white hover:bg-white/10"
                  >
                    Configurer Stripe
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div>
          <SectionTitle icon="shield">Compte & sécurité</SectionTitle>
          <div className="glass-card divide-y divide-white/[0.04] rounded-2xl">
            {canActivateClientRole && (
              <div className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                    <MaterialIcon name="person_add" className="text-[20px] text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white">Espace client</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Activez-le uniquement si vous voulez commander des courses, repas ou colis avec ce même compte.
                    </p>
                    {clientActivationMessage && (
                      <p className="mt-2 text-xs font-medium text-green-400">{clientActivationMessage}</p>
                    )}
                    {clientActivationError && (
                      <p className="mt-2 text-xs font-medium text-red-400">{clientActivationError}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleActivateClientRole}
                  disabled={clientActivationLoading || Boolean(clientActivationMessage)}
                  className="mt-3 h-11 w-full rounded-2xl border border-primary/30 bg-primary/10 text-sm font-bold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {clientActivationLoading ? 'Activation...' : clientActivationMessage ? 'Espace client activé' : 'Activer mon espace client'}
                </button>
              </div>
            )}
            <button
              onClick={() => router.push('/driver/reset-password')}
              className={`flex w-full items-center justify-between px-5 py-4 transition hover:bg-white/[0.02] ${canActivateClientRole ? '' : 'rounded-t-2xl'}`}
            >
              <div className="flex items-center gap-3">
                <MaterialIcon name="lock" className="text-[20px] text-slate-400" />
                <span className="text-sm text-white">Changer mon mot de passe</span>
              </div>
              <MaterialIcon name="chevron_right" className="text-[20px] text-slate-500" />
            </button>
            <button
              onClick={handleSignOut}
              disabled={signOutLoading}
              className="flex w-full items-center justify-between px-5 py-4 transition hover:bg-white/[0.02] disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <MaterialIcon name="logout" className="text-[20px] text-orange-400" />
                <span className="text-sm font-medium text-orange-400">
                  {signOutLoading ? 'Déconnexion...' : 'Se déconnecter'}
                </span>
              </div>
              <MaterialIcon name="chevron_right" className="text-[20px] text-slate-500" />
            </button>
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="flex w-full items-center justify-between rounded-b-2xl px-5 py-4 transition hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-3">
                <MaterialIcon name="delete_forever" className="text-[20px] text-red-400" />
                <span className="text-sm font-medium text-red-400">Supprimer mon compte</span>
              </div>
              <MaterialIcon name="chevron_right" className="text-[20px] text-slate-500" />
            </button>
          </div>
        </div>

        <p className="pt-2 text-center text-[11px] tracking-wider text-slate-600">VERSION 1.0.0 — MEDJIRA</p>
      </div>

      <BottomNav items={driverNavItems} />

      {deleteModalOpen && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="glass-card animate-slide-up w-full max-w-md rounded-3xl p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-500/15">
                <MaterialIcon name="warning" className="text-[24px] text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Supprimer votre compte ?</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Cette action est <span className="font-medium text-red-400">irréversible</span>. Toutes vos données chauffeur seront supprimées.
                </p>
              </div>
            </div>

            <label className="mb-2 block text-xs text-slate-400">
              Pour confirmer, tapez <span className="font-mono font-bold text-red-400">SUPPRIMER</span>
            </label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="SUPPRIMER"
              autoFocus
              className="glass-input mb-3 h-12 w-full rounded-xl px-4 font-mono uppercase tracking-wider text-white placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-red-400"
            />

            {deleteError && <p className="mb-3 text-xs text-red-400">{deleteError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteConfirm('');
                  setDeleteError(null);
                }}
                disabled={deleteLoading}
                className="h-12 flex-1 rounded-2xl bg-white/5 font-medium text-slate-300 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== 'SUPPRIMER' || deleteLoading}
                className="h-12 flex-1 rounded-2xl bg-red-500 font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-red-500/30"
              >
                {deleteLoading ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
