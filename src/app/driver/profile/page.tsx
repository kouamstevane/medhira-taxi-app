"use client";
import { useRouter } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { BottomNav, driverNavItems } from '@/components/ui/BottomNav';
import { useDriverProfile } from '@/hooks/useDriverProfile';
import { CardSkeleton } from '@/components/ui/Skeleton';

/**
 * Normalise les documents du format nested { url, status } vers un format
 * plat compatible avec l'affichage du profil. Gere les anciennes donnees
 * (string) et les nouvelles donnees (objet avec url/status).
 */
function normalizeDocUrl(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "url" in value) {
    return ((value as Record<string, unknown>).url) as string || "";
  }
  return "";
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
  } = useDriverProfile();

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

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      {/* Header */}
      <div className="bg-background border-b border-white/5">
        <div className="max-w-[430px] mx-auto flex items-center p-4">
          <button
            onClick={() => router.push('/driver/dashboard')}
            className="mr-3 p-2 rounded-xl hover:bg-white/5 transition"
          >
            <MaterialIcon name="arrow_back" size="lg" className="text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">Profil Chauffeur</h1>
        </div>
      </div>

      <div className="max-w-[430px] mx-auto p-4 pb-28 space-y-4">
        {/* Error */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
            <MaterialIcon name="error" size="md" className="text-destructive mt-0.5" />
            <span className="text-destructive text-sm">{error}</span>
          </div>
        )}

        {/* Profile Card */}
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                <MaterialIcon name="person" className="text-slate-500 text-[32px]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{driver.firstName} {driver.lastName}</h2>
                <p className="text-slate-400 text-sm">{driver.email}</p>
              </div>
            </div>

            <button
              onClick={() => {
                if (!isEmailVerified) {
                  setEditMode(false);
                  return;
                }
                setEditMode(!editMode);
              }}
              disabled={!isEmailVerified}
              className={`px-4 py-2 rounded-xl font-medium text-sm transition ${
                !isEmailVerified
                  ? 'bg-white/5 text-slate-500 cursor-not-allowed'
                  : editMode
                    ? 'glass-card border border-white/10 text-slate-300'
                    : 'bg-gradient-to-r from-primary to-[#ffae33] text-white'
              }`}
              title={!isEmailVerified ? "Vérifiez votre email pour modifier votre profil" : undefined}
            >
              <span className="flex items-center gap-1">
                <MaterialIcon name={editMode ? 'close' : 'edit'} size="sm" />
                {editMode ? 'Annuler' : 'Modifier'}
              </span>
            </button>
          </div>

          {/* Informations personnelles */}
          <div className="mb-6">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <MaterialIcon name="person" size="md" className="text-primary" />
              Informations personnelles
            </h3>

            {editMode ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Prénom</label>
                  <input
                    type="text"
                    value={formData.firstName || ''}
                    onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                    className="glass-input w-full h-12 px-4 rounded-xl text-white placeholder:text-slate-500 focus:ring-1 focus:ring-primary outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Nom</label>
                  <input
                    type="text"
                    value={formData.lastName || ''}
                    onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                    className="glass-input w-full h-12 px-4 rounded-xl text-white placeholder:text-slate-500 focus:ring-1 focus:ring-primary outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="glass-input w-full h-12 px-4 rounded-xl text-white placeholder:text-slate-500 focus:ring-1 focus:ring-primary outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Photo de profil</label>
                  <input
                    type="file"
                    onChange={(e) => setProfileImage(e.target.files?.[0] || null)}
                    className="glass-input w-full h-12 px-4 rounded-xl text-white file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary/20 file:text-primary hover:file:bg-primary/30 transition-all"
                    accept="image/*"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                  <span className="text-slate-400 text-sm">Prénom</span>
                  <span className="text-white text-sm">{driver.firstName}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                  <span className="text-slate-400 text-sm">Nom</span>
                  <span className="text-white text-sm">{driver.lastName}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                  <span className="text-slate-400 text-sm">Téléphone</span>
                  <span className="text-white text-sm">{driver.phone}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/5">
                  <span className="text-slate-400 text-sm">Email</span>
                  <span className="text-white text-sm">{driver.email}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-400 text-sm">Numéro de permis</span>
                  <span className="text-white text-sm">{driver.licenseNumber ?? 'Non spécifié'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Informations véhicule */}
          <div className="mb-6">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <MaterialIcon name="directions_car" size="md" className="text-primary" />
              Informations véhicule
            </h3>

            {editMode ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Modèle</label>
                  <input
                    type="text"
                    value={formData.car?.model || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      car: {
                        model: e.target.value || undefined,
                        plate: formData.car?.plate || undefined,
                        color: formData.car?.color || undefined
                      }
                    })}
                    className="glass-input w-full h-12 px-4 rounded-xl text-white placeholder:text-slate-500 focus:ring-1 focus:ring-primary outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Plaque</label>
                  <input
                    type="text"
                    value={formData.car?.plate || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      car: {
                        model: formData.car?.model || undefined,
                        plate: e.target.value || undefined,
                        color: formData.car?.color || undefined
                      }
                    })}
                    className="glass-input w-full h-12 px-4 rounded-xl text-white placeholder:text-slate-500 focus:ring-1 focus:ring-primary outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Couleur</label>
                  <input
                    type="text"
                    value={formData.car?.color || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      car: {
                        model: formData.car?.model || undefined,
                        plate: formData.car?.plate || undefined,
                        color: e.target.value || undefined
                      }
                    })}
                    className="glass-input w-full h-12 px-4 rounded-xl text-white placeholder:text-slate-500 focus:ring-1 focus:ring-primary outline-none transition-all"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                 <div className="flex items-center justify-between py-2 border-b border-white/5">
                   <span className="text-slate-400 text-sm">Modèle</span>
                   <span className="text-white text-sm">{driver.car?.model ?? 'Non spécifié'}</span>
                 </div>
                 <div className="flex items-center justify-between py-2 border-b border-white/5">
                   <span className="text-slate-400 text-sm">Plaque</span>
                   <span className="text-white text-sm">{driver.car?.plate ?? 'Non spécifié'}</span>
                 </div>
                 <div className="flex items-center justify-between py-2">
                   <span className="text-slate-400 text-sm">Couleur</span>
                   <span className="text-white text-sm">{driver.car?.color ?? 'Non spécifié'}</span>
                 </div>
               </div>
            )}

            {/* Disponibilité toggle */}
            <div className="mt-6 flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="flex items-center gap-2">
                <MaterialIcon
                  name={driver.isAvailable ? 'toggle_on' : 'toggle_off'}
                  size="md"
                  className={driver.isAvailable ? 'text-green-400' : 'text-slate-500'}
                />
                <span className="text-slate-300 text-sm">Disponible pour des courses</span>
              </div>
              <button
                onClick={toggleAvailability}
                className={`relative inline-flex items-center h-7 rounded-full w-12 transition-colors ${
                  driver.isAvailable ? 'bg-primary' : 'bg-white/10'
                }`}
              >
                <span
                  className={`inline-block w-5 h-5 transform transition-transform bg-white rounded-full ${
                    driver.isAvailable ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Edit mode actions */}
          {editMode && (
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setEditMode(false)}
                className="flex-1 h-12 glass-card border border-white/10 text-slate-300 rounded-2xl font-medium active:scale-[0.98] transition-transform"
              >
                Annuler
              </button>
              <button
                onClick={handleUpdateProfile}
                disabled={loading}
                className="flex-1 h-12 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Enregistrement...
                  </span>
                ) : 'Enregistrer'}
              </button>
            </div>
          )}

          {/* ================================================================
              Section Paiements & Virements (Stripe Connect)
              ================================================================ */}
          <div className="mb-6">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <MaterialIcon name="account_balance" size="md" className="text-primary" />
              Paiements & Virements
            </h3>

            {stripeError && (
              <div className="mb-3 p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
                <MaterialIcon name="error" size="sm" className="text-destructive mt-0.5" />
                <span className="text-destructive text-sm">{stripeError}</span>
              </div>
            )}

            {payoutSuccess && (
              <div className="mb-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-2">
                <MaterialIcon name="check_circle" size="sm" className="text-green-400" />
                <span className="text-green-400 text-sm">{payoutSuccess}</span>
              </div>
            )}

            {stripeLoading ? (
              <div className="flex items-center justify-center py-6">
                <svg className="animate-spin h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : !stripeData || stripeData.status === 'not_created' ? (
              /* Pas encore de compte Connect */
              <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3">
                <p className="text-slate-300 text-sm">
                  Connectez un compte bancaire pour recevoir vos gains directement sur votre compte.
                </p>
                <button
                  onClick={handleCreateStripeAccount}
                  disabled={stripeLoading}
                  className="w-full h-12 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-xl primary-glow active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <MaterialIcon name="account_balance_wallet" size="md" />
                  Configurer mon compte de paiement
                </button>
              </div>
            ) : stripeData.status === 'pending' ? (
              /* Compte créé, onboarding KYC en attente */
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <MaterialIcon name="pending" size="md" className="text-yellow-400" />
                  <p className="text-yellow-400 font-medium text-sm">Vérification en cours</p>
                </div>
                <p className="text-slate-400 text-sm">
                  Votre dossier est en cours de vérification. Complétez votre profil Stripe pour activer les virements.
                </p>
                <button
                  onClick={handleCreateStripeAccount}
                  className="w-full h-10 glass-card border border-yellow-500/30 text-yellow-400 font-medium rounded-xl text-sm active:scale-[0.98] transition-transform"
                >
                  Compléter la vérification
                </button>
              </div>
            ) : stripeData.status === 'restricted' ? (
              /* Compte restreint */
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <MaterialIcon name="warning" size="md" className="text-destructive" />
                  <p className="text-destructive font-medium text-sm">Compte restreint</p>
                </div>
                <p className="text-slate-400 text-sm">
                  Des informations supplémentaires sont requises. Contactez le support ou complétez votre profil Stripe.
                </p>
              </div>
            ) : (
              /* Compte actif */
              <div className="space-y-4">
                {/* Statut compte */}
                <div className="flex items-center justify-between p-3 bg-green-500/5 rounded-xl border border-green-500/20">
                  <div className="flex items-center gap-2">
                    <MaterialIcon name="verified" size="md" className="text-green-400" />
                    <span className="text-green-400 text-sm font-medium">Compte vérifié</span>
                  </div>
                  <span className="text-slate-500 text-xs">Stripe Connect</span>
                </div>

                {/* Solde en attente */}
                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <p className="text-slate-400 text-xs uppercase font-bold mb-1">Solde en attente</p>
                  <p className="text-white text-2xl font-bold">
                    {((stripeData.pendingBalance ?? 0) / 100).toFixed(2)}{' '}
                    <span className="text-sm font-normal text-slate-400">
                      {stripeData.currency?.toUpperCase() ?? 'CAD'}
                    </span>
                  </p>
                  {stripeData.lastPayoutAt && (
                    <p className="text-slate-500 text-xs mt-1">
                      Dernier virement : {new Date(stripeData.lastPayoutAt).toLocaleDateString('fr-CA')}
                    </p>
                  )}
                </div>

                {/* Toggle virements hebdomadaires */}
                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-white text-sm font-medium">Virements automatiques</p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {stripeData.weeklyPayoutEnabled
                          ? 'Reçois ta part chaque lundi (70% des courses)'
                          : 'Accumule tes gains et vire quand tu veux'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleWeeklyPayout(!stripeData.weeklyPayoutEnabled)}
                      disabled={payoutToggleLoading}
                      className={`relative inline-flex items-center h-7 rounded-full w-12 transition-colors disabled:opacity-50 ${
                        stripeData.weeklyPayoutEnabled ? 'bg-primary' : 'bg-white/10'
                      }`}
                    >
                      <span className={`inline-block w-5 h-5 transform transition-transform bg-white rounded-full ${
                        stripeData.weeklyPayoutEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                  <p className="text-slate-600 text-xs">
                    {stripeData.weeklyPayoutEnabled
                      ? 'Fonctionne comme Uber — virement automatique le lundi'
                      : 'Mode manuel — utilisez le bouton ci-dessous pour virer'}
                  </p>
                </div>

                {/* Virement manuel */}
                <button
                  onClick={handleManualPayout}
                  disabled={manualPayoutLoading || (stripeData.pendingBalance ?? 0) <= 0}
                  className="w-full h-12 glass-card border border-primary/30 text-primary font-medium rounded-xl active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                >
                  {manualPayoutLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Virement en cours…
                    </>
                  ) : (
                    <>
                      <MaterialIcon name="send" size="sm" />
                      Virer maintenant ({((stripeData.pendingBalance ?? 0) / 100).toFixed(2)} {stripeData.currency?.toUpperCase()})
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Documents */}
          <div>
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <MaterialIcon name="description" size="md" className="text-primary" />
              Documents
            </h3>
             <div className="space-y-3">
               <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                 <div className="flex items-center gap-2">
                   <MaterialIcon name="badge" size="md" className="text-slate-400" />
                   <span className="text-slate-300 text-sm">Permis de conduire</span>
                 </div>
                 <a
                   href={normalizeDocUrl(privateData?.documents?.licensePhoto)}
                   target="_blank"
                   rel="noopener noreferrer"
                   className={`text-sm font-medium ${normalizeDocUrl(privateData?.documents?.licensePhoto) ? 'text-primary hover:underline' : 'text-slate-500 pointer-events-none'}`}
                 >
                   {normalizeDocUrl(privateData?.documents?.licensePhoto) ? 'Voir' : 'Non disponible'}
                 </a>
               </div>
               <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                 <div className="flex items-center gap-2">
                   <MaterialIcon name="receipt_long" size="md" className="text-slate-400" />
                   <span className="text-slate-300 text-sm">Carte grise</span>
                 </div>
                 <a
                   href={normalizeDocUrl(privateData?.documents?.carRegistration)}
                   target="_blank"
                   rel="noopener noreferrer"
                   className={`text-sm font-medium ${normalizeDocUrl(privateData?.documents?.carRegistration) ? 'text-primary hover:underline' : 'text-slate-500 pointer-events-none'}`}
                 >
                   {normalizeDocUrl(privateData?.documents?.carRegistration) ? 'Voir' : 'Non disponible'}
                 </a>
               </div>
             </div>
          </div>
        </div>
      </div>
      <BottomNav items={driverNavItems} />
    </div>
  );
}
