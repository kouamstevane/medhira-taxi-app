'use client';

import React, { useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';

interface ProfileFaqModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function ProfileFaqModal({ isOpen, onClose }: ProfileFaqModalProps) {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqItems = [
    {
      question: t('profile.faqItems.q1'),
      answer: t('profile.faqItems.a1'),
    },
    {
      question: t('profile.faqItems.q2'),
      answer: t('profile.faqItems.a2'),
    },
    {
      question: t('profile.faqItems.q3'),
      answer: t('profile.faqItems.a3'),
    },
    {
      question: t('profile.faqItems.q4'),
      answer: t('profile.faqItems.a4'),
    },
    {
      question: t('profile.faqItems.q5'),
      answer: t('profile.faqItems.a5'),
    },
    {
      question: t('profile.faqItems.q6'),
      answer: t('profile.faqItems.a6'),
    },
  ];

  return (
    <BottomSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onCloseRequest={onClose}
      title={t('profile.faqTitle')}
      showCloseButton
      closeLabel={t('common.close')}
      className="bg-[#18181b] border-white/10 text-white max-h-[85vh] sm:max-w-lg"
    >
      <div className="space-y-4 pb-4">
        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-300 shrink-0">
            <MaterialIcon name="help_outline" className="text-[20px]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{t('profile.faqSubtitle')}</p>
          </div>
        </div>

        <div className="space-y-2.5">
          {faqItems.map((item, idx) => {
            const isExpanded = openIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isExpanded ? null : idx)}
                  className="w-full text-left p-4 flex items-center justify-between gap-3 text-sm font-medium text-white hover:bg-white/[0.03] transition"
                  aria-expanded={isExpanded}
                >
                  <span className="font-semibold leading-snug">{item.question}</span>
                  <MaterialIcon
                    name={isExpanded ? 'expand_less' : 'expand_more'}
                    className="text-slate-400 shrink-0 text-[20px]"
                  />
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 text-xs text-slate-300 leading-relaxed border-t border-white/5">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-12 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition active:scale-[0.98]"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
