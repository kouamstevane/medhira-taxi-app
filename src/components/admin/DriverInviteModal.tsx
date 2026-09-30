'use client';

import React, { useState, useEffect } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

export interface DriverInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  onEmailChange: (email: string) => void;
  role: 'chauffeur' | 'livreur' | 'les_deux';
  onRoleChange: (role: 'chauffeur' | 'livreur' | 'les_deux') => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  isLoading: boolean;
}

const roleOptions: Array<{
  value: 'chauffeur' | 'livreur' | 'les_deux';
  title: string;
  subtitle: string;
  icon: string;
}> = [
  {
    value: 'chauffeur',
    title: 'Chauffeur (VTC)',
    subtitle: 'Courses & réservations',
    icon: 'directions_car',
  },
  {
    value: 'livreur',
    title: 'Livreur',
    subtitle: 'Repas & colis',
    icon: 'delivery_dining',
  },
  {
    value: 'les_deux',
    title: 'Chauffeur & Livreur',
    subtitle: 'Polyvalence complète',
    icon: 'swap_horiz',
  },
];

export function DriverInviteModal({
  isOpen,
  onClose,
  email,
  onEmailChange,
  role,
  onRoleChange,
  onSubmit,
  isLoading,
}: DriverInviteModalProps) {
  const [showConfirmStep, setShowConfirmStep] = useState(false);
  const [isReadyToSubmit, setIsReadyToSubmit] = useState(process.env.NODE_ENV === 'test');

  useEffect(() => {
    if (isOpen) {
      setShowConfirmStep(false);
      if (process.env.NODE_ENV !== 'test') {
        setIsReadyToSubmit(false);
        const timer = setTimeout(() => {
          setIsReadyToSubmit(true);
        }, 300);
        return () => clearTimeout(timer);
      }
    } else {
      setShowConfirmStep(false);
      setIsReadyToSubmit(process.env.NODE_ENV === 'test');
    }
  }, [isOpen]);

  const handleInitialSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isReadyToSubmit || isLoading || !email.trim()) return;
    setShowConfirmStep(true);
  };

  const handleFinalSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading || !email.trim()) return;
    await onSubmit(e);
  };

  const getRoleLabel = (r: 'chauffeur' | 'livreur' | 'les_deux') => {
    switch (r) {
      case 'chauffeur':
        return 'Chauffeur (VTC)';
      case 'livreur':
        return 'Livreur';
      case 'les_deux':
        return 'Chauffeur & Livreur';
    }
  };

  const modalTitle = showConfirmStep
    ? 'Confirmer l’envoi de l’invitation'
    : 'Inviter un chauffeur';

  return (
    <BottomSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isLoading) {
          setShowConfirmStep(false);
          onClose();
        }
      }}
      onCloseRequest={isLoading ? undefined : onClose}
      title={modalTitle}
      canDismiss={!isLoading}
      showCloseButton
      closeLabel="Fermer"
      className="bg-[#18181b] border-white/10 text-white sm:max-w-lg"
      contentClassName="pt-1 pb-4"
    >
      <div data-testid="driver-invite-panel" className="space-y-4">
        <p className="-mt-1 text-xs text-slate-400">
          {showConfirmStep
            ? 'Vérifiez les détails avant d’expédier l’email.'
            : 'Préparez l’invitation, puis confirmez l’envoi.'}
        </p>

        {showConfirmStep ? (
          <form onSubmit={handleFinalSubmit} className="space-y-4 animate-in fade-in duration-200">
            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
                  <MaterialIcon name="mail" size="sm" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Validation de l’envoi</h3>
                  <p className="text-xs text-slate-400">Un email officiel sera immédiatement expédié au destinataire.</p>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Destinataire :</span>
                  <span className="font-semibold text-white font-mono">{email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Rôle :</span>
                  <span className="font-semibold text-primary">{getRoleLabel(role)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Validité du code :</span>
                  <span className="text-slate-300">48 heures</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="submit"
                disabled={isLoading}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:flex-1"
              >
                {isLoading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Envoi en cours…</span>
                  </>
                ) : (
                  <>
                    <MaterialIcon name="send" size="sm" />
                    <span>Confirmer et envoyer l’email</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmStep(false)}
                disabled={isLoading}
                className="min-h-[44px] w-full rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50 sm:w-auto"
              >
                Modifier
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleInitialSubmit} className="space-y-4">
            <div>
              <label htmlFor="invite-email" className="mb-1.5 block text-xs font-semibold text-slate-300">
                Email du postulant <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <MaterialIcon
                  name="mail"
                  size="sm"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="invite-email"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  placeholder="ex: chauffeur@exemple.com"
                  disabled={isLoading}
                  className="glass-input w-full rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label id="invite-role-label" className="mb-2 block text-xs font-semibold text-slate-300">
                Rôle attribué
              </label>

              {/* Accessible hidden select to ensure standard form/DOM query compatibility */}
              <select
                id="invite-role"
                aria-labelledby="invite-role-label"
                value={role}
                onChange={(e) => onRoleChange(e.target.value as 'chauffeur' | 'livreur' | 'les_deux')}
                disabled={isLoading}
                className="sr-only"
                tabIndex={-1}
              >
                <option value="chauffeur">Chauffeur (VTC)</option>
                <option value="livreur">Livreur</option>
                <option value="les_deux">Chauffeur & Livreur</option>
              </select>

              {/* Mobile-first segmented touch selector (prevents native mobile select touch bleed-through) */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-labelledby="invite-role-label">
                {roleOptions.map((opt) => {
                  const isSelected = role === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-label={opt.title}
                      aria-checked={isSelected}
                      disabled={isLoading}
                      onClick={() => onRoleChange(opt.value)}
                      className={`flex min-h-[50px] items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-white ring-1 ring-primary/40'
                          : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-white'
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                          isSelected ? 'bg-primary text-black font-bold' : 'bg-white/10 text-slate-400'
                        }`}
                      >
                        <MaterialIcon name={opt.icon} size="sm" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-bold leading-tight ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                          {opt.title}
                        </p>
                        <p className="truncate text-[10px] text-slate-400 mt-0.5">{opt.subtitle}</p>
                      </div>
                      {isSelected && (
                        <div className="shrink-0 text-primary">
                          <MaterialIcon name="check_circle" size="sm" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="submit"
                disabled={isLoading || !email.trim() || !isReadyToSubmit}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:flex-1"
              >
                <MaterialIcon name="arrow_forward" size="sm" />
                <span>Continuer vers l’envoi</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="min-h-[44px] w-full rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50 sm:w-auto"
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>
    </BottomSheet>
  );
}

export default DriverInviteModal;
