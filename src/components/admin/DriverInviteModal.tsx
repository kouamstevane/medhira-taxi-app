'use client';

import React from 'react';
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
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-black/80 p-0 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center sm:p-4"
    >
      {/* Backdrop click listener */}
      <div
        className="fixed inset-0 -z-10"
        onClick={isLoading ? undefined : onClose}
        aria-hidden="true"
      />

      <div
        data-testid="driver-invite-panel"
        className="glass-card max-h-[min(90dvh,40rem)] w-full overflow-y-auto rounded-t-3xl rounded-b-none border border-white/10 bg-[#121722] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6"
      >
        <div data-testid="driver-invite-handle" aria-hidden="true" className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/25 sm:hidden" />
        <div className="mb-4 flex items-start justify-between gap-3 sm:mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <MaterialIcon name="person_add" size="md" />
            </div>
            <div>
              <h2 id="invite-modal-title" className="text-base font-bold text-white sm:text-lg">
                Inviter un chauffeur
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Préparez l’invitation, puis envoyez-la quand tout est prêt.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <MaterialIcon name="close" size="md" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
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
            <label htmlFor="invite-role" className="mb-1.5 block text-xs font-semibold text-slate-300">
              Rôle attribué
            </label>
            <div className="relative">
              <select
                id="invite-role"
                value={role}
                onChange={(e) => onRoleChange(e.target.value as 'chauffeur' | 'livreur' | 'les_deux')}
                disabled={isLoading}
                className="glass-input w-full appearance-none rounded-xl py-2.5 pl-3.5 pr-10 text-sm text-white disabled:opacity-50 cursor-pointer"
              >
                <option value="chauffeur" className="bg-[#151a26] text-white">Chauffeur (VTC)</option>
                <option value="livreur" className="bg-[#151a26] text-white">Livreur</option>
                <option value="les_deux" className="bg-[#151a26] text-white">Chauffeur & Livreur</option>
              </select>
              <MaterialIcon
                name="expand_more"
                size="sm"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="submit"
              disabled={isLoading || !email.trim()}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:flex-1"
            >
              {isLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Envoi en cours…</span>
                </>
              ) : (
                <>
                  <MaterialIcon name="send" size="sm" />
                  <span>Envoyer l’invitation</span>
                </>
              )}
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
      </div>
    </div>
  );
}

export default DriverInviteModal;
