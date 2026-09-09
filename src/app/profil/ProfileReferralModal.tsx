'use client';

import React, { useState } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

interface ProfileReferralModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly referralCode: string;
}

export function ProfileReferralModal({
  isOpen,
  onClose,
  referralCode,
}: ProfileReferralModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4 transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-[#18181b] border border-white/10 p-6 shadow-2xl space-y-5 animate-in slide-in-from-bottom duration-250"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pink-500/15 border border-pink-500/25 flex items-center justify-center text-pink-400">
              <MaterialIcon name="favorite" className="text-[20px]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Programme de Parrainage</h3>
              <p className="text-xs text-slate-400">Gagnez des réductions sur vos courses</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition"
            aria-label="Fermer"
          >
            <MaterialIcon name="close" size="sm" />
          </button>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-pink-500/10 via-primary/5 to-transparent border border-pink-500/20 p-4 text-center space-y-2">
          <p className="text-xs text-pink-300 font-medium uppercase tracking-wider">Votre code exclusif</p>
          <div className="flex items-center justify-center gap-2">
            <span className="font-mono text-xl font-bold tracking-widest text-white bg-black/40 px-4 py-2 rounded-xl border border-white/10">
              {referralCode || 'MEDJIRA2026'}
            </span>
          </div>
          <p className="text-xs text-slate-400 pt-1">
            Partagez ce code avec vos amis. Ils bénéficient de 10% sur leur 1ère course et vous gagnez un crédit de course !
          </p>
        </div>

        <div className="pt-2 flex gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20 active:scale-[0.98] transition-all"
          >
            <MaterialIcon name={copied ? 'check' : 'attach_file'} size="sm" />
            {copied ? 'Code copié !' : 'Copier mon code'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-12 px-5 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition active:scale-[0.98]"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
