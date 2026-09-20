'use client';

import React, { useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';

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
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

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
    <BottomSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onCloseRequest={onClose}
      title={t('profile.referralProgramTitle')}
      showCloseButton
      closeLabel={t('common.close')}
      className="bg-[#18181b] border-white/10 text-white max-h-[90vh] sm:max-w-md"
    >
      <div className="space-y-4 pb-2">
        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
          <div className="w-10 h-10 rounded-2xl bg-pink-500/15 border border-pink-500/25 flex items-center justify-center text-pink-400 shrink-0">
            <MaterialIcon name="favorite" className="text-[20px]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{t('profile.referralProgramSubtitle')}</p>
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-pink-500/10 via-primary/5 to-transparent border border-pink-500/20 p-5 text-center space-y-3">
          <p className="text-xs text-pink-300 font-semibold uppercase tracking-wider">
            {t('profile.exclusiveCode')}
          </p>
          <div className="flex items-center justify-center">
            <span className="font-mono text-2xl font-bold tracking-widest text-white bg-black/50 px-5 py-2.5 rounded-xl border border-white/10 shadow-inner select-all">
              {referralCode || 'MEDJIRA2026'}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed pt-1 max-w-xs mx-auto">
            {t('profile.referralExplanation')}
          </p>
        </div>

        <div className="pt-2 flex gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 h-12 min-h-[44px] rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20 active:scale-[0.98] transition-all"
          >
            <MaterialIcon name={copied ? 'check' : 'attach_file'} size="sm" />
            <span>{copied ? t('profile.codeCopied') : t('profile.copyMyCode')}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-12 min-h-[44px] px-6 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition active:scale-[0.98]"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
