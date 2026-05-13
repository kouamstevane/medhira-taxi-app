"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, deleteUser } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav, driverNavItems } from '@/components/ui/BottomNav';
import { useDriverProfile } from '@/hooks/useDriverProfile';
import { useDocumentStatus } from '@/hooks/useDocumentStatus';
import type { DocStatus } from '@/hooks/useDocumentStatus';
import { CardSkeleton } from '@/components/ui/Skeleton';

function initialsOf(firstName?: string, lastName?: string): string {
  return [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
}

function docStatusPill(status: DocStatus): { text: string; classes: string } {
  switch (status) {
    case 'approved': return { text: 'APPROUVÉ', classes: 'bg-green-500/15 text-green-400 border-green-500/30' };
    case 'pending': return { text: 'EN ATTENTE', classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
    case 'rejected': return { text: 'REJETÉ', classes: 'bg-red-500/15 text-red-400 border-red-500/30' };
    default: return { text: 'NON SOUMIS', classes: 'bg-white/5 text-slate-400 border-white/10' };
  }
}

interface SectionTitleProps {
  icon: string;
  children: React.ReactNode;
}
function SectionTitle({ icon, children }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <MaterialIcon name={icon} className="text-primary text-[18px]" />
      <h3 className="text-[11px] font-bold text-slate-400 tracking-[0.15em] uppercase">{children}</h3>
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
      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-white text-[15px] ${isEmpty || italic ? 'italic text-slate-500' : ''}`}>{display}</p>
    </div>
  );
}

export default function DriverProfilePage() {
  const router = useRouter();
  const {
    driver,
    privateData,
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
  const { documents } = useDocumentStatus(auth.currentUser?.uid ?? null);

  const [signOutLoading, setSignOutLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background font-sans text-slate-100 antialiased p-4 max-w-[430px] mx-auto space-y-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!driver && error) {
    return (
      <div className="min-h-screen bg-background font-sans text-slate-100 antialiased flex items-center justify-center p-4">
        <div className="glass-card rounded-2xl p-6 max-w-md w-full text-center">
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-xl">
            <p className="text-destructive text-sm">{error}</p>
          </div>
          <button
            onClick={() => router.push('/driver/login')}
            className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform"
          >
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  if (!driver) return null;

  const profileDocs = documents.filter(d => ['permitConduire', 'plaqueImmatriculation', 'permitCommercial'].includes(d.key));

  return (
    <div className="min-h-screen bg-background text-slate-100 antialiased font-sans pb-28">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md">
        <div className="max-w-[430px] mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => router.push('/driver/dashboard')} className="p-2 -ml-2 rounded-xl hover:bg-white/5 transition">
            <MaterialIcon name="arrow_back" className="text-primary text-[24px]" />
          </button>
          <h1 className="text-lg font-bold text-primary">Profil</h1>
          <button
            onClick={() => { if (isEmailVerified) setEditMode(!editMode); }}
            disabled={!isEmailVerified}
            className="p-2 -mr-2 rounded-xl hover:bg-white/5 transition disabled:opacity-40"
            aria-label={editMode ? 'Annuler' : 'Modifier'}
          >
            <MaterialIcon name={editMode ? 'close' : 'edit'} className="text-primary text-[22px]" />
          </button>
        </div>
      </header>

      <div className="max-w-[430px] mx-auto px-4 space-y-5">
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
            <MaterialIcon name="error" size="md" className="text-destructive mt-0.5" />
            <span className="text-destructive text-sm">{error}</span>
          </div>
        )}

        {/* Profile hero card */}
        <div className="glass-card rounded-2xl p-6 flex flex-col items-center text-center">
          <div className="w-24 h-24 rounded-full border-2 border-primary p-1 mb-3">
            <div className="w-full h-full rounded-full bg-white/5 flex items-center justify-center">
              <span className="text-white font-bold text-2xl">{initialsOf(driver.firstName, driver.lastName)}</span>
            </div>
          </div>
          <h2 className="text-white font-bold text-xl">{driver.firstName} {driver.lastName}</h2>
          <p className="text-slate-400 text-sm">{driver.email}</p>
          <div className="flex items-center gap-2 mt-3">
            {isEmailVerified && (
              <span className="inline-flex items-center gap-1 bg-green-500/15 text-green-400 border border-green-500/30 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                <MaterialIcon name="verified" className="text-[12px]" />
                VÉRIFIÉ
              </span>
            )}
          </div>
          {!editMode && (
            <button
              onClick={() => { if (isEmailVerified) setEditMode(true); }}
              disabled={!isEmailVerified}
              className="mt-4 px-6 h-10 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition disabled:opacity-40"
            >
              Modifier
            </button>
          )}
        </div>

        {/* Availability toggle */}
        <div className="glass-card rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${driver.isAvailable ? 'bg-green-500' : 'bg-slate-500'}`} />
            <span className="text-white text-sm font-medium">Disponible pour des courses</span>
          </div>
          <button
            onClick={toggleAvailability}
            className={`relative inline-flex items-center h-7 rounded-full w-12 transition-colors ${driver.isAvailable ? 'bg-primary' : 'bg-white/10'}`}
            aria-pressed={driver.isAvailable}
          >
            <span className={`inline-block w-5 h-5 transform transition-transform bg-white rounded-full ${driver.isAvailable ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Informations personnelles */}
        <div>
          <SectionTitle icon="person">Informations personnelles</SectionTitle>
          <div className="glass-card rounded-2xl px-5 py-3 divide-y divide-white/[0.04]">
            {editMode ? (
              <div className="space-y-3 py-2">
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Prénom</label>
                  <input
                    type="text"
                    value={formData.firstName || ''}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="glass-input w-full h-11 px-3 rounded-xl text-white focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Nom</label>
                  <input
                    type="text"
                    value={formData.lastName || ''}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="glass-input w-full h-11 px-3 rounded-xl text-white focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="glass-input w-full h-11 px-3 rounded-xl text-white focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Photo de profil</label>
                  <input
                    type="file"
                    onChange={(e) => setProfileImage(e.target.files?.[0] || null)}
                    className="glass-input w-full h-11 px-3 rounded-xl text-white file:mr-3 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary/20 file:text-primary"
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

        {/* Véhicule */}
        <div>
          <SectionTitle icon="directions_car">Véhicule</SectionTitle>
          <div className="glass-card rounded-2xl px-5 py-3 divide-y divide-white/[0.04]">
            {editMode ? (
              <div className="space-y-3 py-2">
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Modèle</label>
                  <input
                    type="text"
                    value={formData.car?.model || ''}
                    onChange={(e) => setFormData({ ...formData, car: { ...formData.car, model: e.target.value || undefined } })}
                    className="glass-input w-full h-11 px-3 rounded-xl text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Plaque</label>
                  <input
                    type="text"
                    value={formData.car?.plate || ''}
                    onChange={(e) => setFormData({ ...formData, car: { ...formData.car, plate: e.target.value || undefined } })}
                    className="glass-input w-full h-11 px-3 rounded-xl text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Couleur</label>
                  <input
                    type="text"
                    value={formData.car?.color || ''}
                    onChange={(e) => setFormData({ ...formData, car: { ...formData.car, color: e.target.value || undefined } })}
                    className="glass-input w-full h-11 px-3 rounded-xl text-white outline-none"
                  />
                </div>
              </div>
            ) : (
              <>
                <InfoRow label="Modèle" value={driver.car?.model} />
                <InfoRow label="Plaque" value={driver.car?.plate} />
                <InfoRow label="Couleur" value={driver.car?.color} />
              </>
            )}
          </div>
        </div>

        {editMode && (
          <div className="flex gap-3">
            <button
              onClick={() => setEditMode(false)}
              className="flex-1 h-12 bg-white/5 text-slate-300 rounded-2xl font-medium active:scale-[0.98] transition-transform"
            >
              Annuler
            </button>
            <button
              onClick={handleUpdateProfile}
              disabled={loading}
              className="flex-1 h-12 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        )}

        {/* Paiements & Stripe */}
        <div>
          <SectionTitle icon="account_balance">Paiements & Stripe</SectionTitle>
          <div className="glass-card rounded-2xl p-5 space-y-4">
            {stripeError && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
                <MaterialIcon name="error" className="text-destructive text-[18px] mt-0.5" />
                <span className="text-destructive text-sm">{stripeError}</span>
              </div>
            )}
            {payoutSuccess && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-2">
                <MaterialIcon name="check_circle" className="text-green-400 text-[18px]" />
                <span className="text-green-400 text-sm">{payoutSuccess}</span>
              </div>
            )}

            {stripeLoading ? (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !stripeData || stripeData.status === 'not_created' ? (
              <>
                <div>
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Solde en attente</p>
                  <p className="text-white text-3xl font-bold mt-1">0.00 <span className="text-base font-normal text-slate-400">CAD</span></p>
                </div>
                <p className="text-slate-400 text-sm">Connectez un compte bancaire pour recevoir vos gains.</p>
                <button
                  onClick={handleCreateStripeAccount}
                  className="w-full h-12 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow"
                >
                  Configurer Stripe
                </button>
              </>
            ) : (
              <>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Solde en attente</p>
                    <p className="text-white text-3xl font-bold mt-1">
                      {((stripeData.pendingBalance ?? 0) / 100).toFixed(2)}{' '}
                      <span className="text-base font-normal text-slate-400">{stripeData.currency?.toUpperCase() ?? 'CAD'}</span>
                    </p>
                  </div>
                  {stripeData.status === 'active' && (
                    <span className="inline-flex items-center gap-1 bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">
                      <MaterialIcon name="verified" className="text-[11px]" />
                      VÉRIFIÉ
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="min-w-0 pr-3">
                    <p className="text-white text-sm font-medium">Versement automatique</p>
                    <p className="text-slate-500 text-xs">
                      {stripeData.weeklyPayoutEnabled ? 'Chaque lundi (70%)' : 'Manuel — vous décidez'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleWeeklyPayout(!stripeData.weeklyPayoutEnabled)}
                    disabled={payoutToggleLoading}
                    className={`relative inline-flex items-center h-7 rounded-full w-12 transition-colors disabled:opacity-50 ${stripeData.weeklyPayoutEnabled ? 'bg-primary' : 'bg-white/10'}`}
                  >
                    <span className={`inline-block w-5 h-5 transform transition-transform bg-white rounded-full ${stripeData.weeklyPayoutEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={handleManualPayout}
                    disabled={manualPayoutLoading || (stripeData.pendingBalance ?? 0) <= 0}
                    className="w-full h-12 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow disabled:opacity-40"
                  >
                    {manualPayoutLoading ? 'Virement en cours…' : 'Virer maintenant'}
                  </button>
                  <button
                    onClick={handleCreateStripeAccount}
                    className="w-full h-12 bg-white/5 hover:bg-white/10 text-white font-medium rounded-2xl border border-white/10"
                  >
                    Configurer Stripe
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Documents preview */}
        <div>
          <SectionTitle icon="description">Documents</SectionTitle>
          <div className="glass-card rounded-2xl px-5 py-3 divide-y divide-white/[0.04]">
            {profileDocs.length === 0 ? (
              <p className="py-3 text-slate-500 text-sm italic">Aucun document — voir l&apos;onglet Documents</p>
            ) : profileDocs.map(doc => {
              const pill = docStatusPill(doc.status);
              const icon = doc.key === 'permitConduire' ? 'badge'
                : doc.key === 'plaqueImmatriculation' ? 'directions_car'
                : 'shield';
              return (
                <button
                  key={doc.key}
                  onClick={() => router.push(`/driver/documents/${doc.key}`)}
                  className="w-full flex items-center justify-between py-3 text-left hover:bg-white/[0.02] transition rounded-lg -mx-1 px-1"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MaterialIcon name={icon} className="text-slate-400 text-[20px] flex-shrink-0" />
                    <span className="text-white text-sm truncate">{doc.label}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${pill.classes} flex-shrink-0`}>
                    {pill.text}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => router.push('/driver/documents')}
              className="w-full py-3 text-primary text-sm font-medium hover:underline"
            >
              Voir tous les documents
            </button>
          </div>
        </div>

        {/* Compte & sécurité */}
        <div>
          <SectionTitle icon="shield">Compte & sécurité</SectionTitle>
          <div className="glass-card rounded-2xl divide-y divide-white/[0.04]">
            <button
              onClick={() => router.push('/driver/reset-password')}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition rounded-t-2xl"
            >
              <div className="flex items-center gap-3">
                <MaterialIcon name="lock" className="text-slate-400 text-[20px]" />
                <span className="text-white text-sm">Changer mon mot de passe</span>
              </div>
              <MaterialIcon name="chevron_right" className="text-slate-500 text-[20px]" />
            </button>
            <button
              onClick={handleSignOut}
              disabled={signOutLoading}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <MaterialIcon name="logout" className="text-orange-400 text-[20px]" />
                <span className="text-orange-400 text-sm font-medium">
                  {signOutLoading ? 'Déconnexion…' : 'Se déconnecter'}
                </span>
              </div>
              <MaterialIcon name="chevron_right" className="text-slate-500 text-[20px]" />
            </button>
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition rounded-b-2xl"
            >
              <div className="flex items-center gap-3">
                <MaterialIcon name="delete_forever" className="text-red-400 text-[20px]" />
                <span className="text-red-400 text-sm font-medium">Supprimer mon compte</span>
              </div>
              <MaterialIcon name="chevron_right" className="text-slate-500 text-[20px]" />
            </button>
          </div>
        </div>

        <p className="text-center text-slate-600 text-[11px] tracking-wider pt-2">VERSION 1.0.0 — MEDJIRA</p>
      </div>

      <BottomNav items={driverNavItems} />

      {/* Delete confirmation modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="glass-card rounded-3xl p-6 max-w-md w-full animate-slide-up">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <MaterialIcon name="warning" className="text-red-400 text-[24px]" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">Supprimer votre compte ?</h3>
                <p className="text-slate-400 text-sm mt-1">
                  Cette action est <span className="text-red-400 font-medium">irréversible</span>. Toutes vos données chauffeur seront supprimées.
                </p>
              </div>
            </div>

            <label className="block text-xs text-slate-400 mb-2">
              Pour confirmer, tapez <span className="text-red-400 font-mono font-bold">SUPPRIMER</span>
            </label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="SUPPRIMER"
              autoFocus
              className="glass-input w-full h-12 px-4 rounded-xl text-white placeholder:text-slate-600 font-mono uppercase tracking-wider mb-3 outline-none focus:ring-1 focus:ring-red-400"
            />

            {deleteError && (
              <p className="text-red-400 text-xs mb-3">{deleteError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteModalOpen(false); setDeleteConfirm(''); setDeleteError(null); }}
                disabled={deleteLoading}
                className="flex-1 h-12 bg-white/5 text-slate-300 rounded-2xl font-medium disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== 'SUPPRIMER' || deleteLoading}
                className="flex-1 h-12 bg-red-500 hover:bg-red-600 disabled:bg-red-500/30 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition"
              >
                {deleteLoading ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
