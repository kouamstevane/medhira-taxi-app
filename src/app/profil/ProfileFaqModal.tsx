'use client';

import React, { useState } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';

interface ProfileFaqModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function ProfileFaqModal({ isOpen, onClose }: ProfileFaqModalProps) {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (!isOpen) return null;

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
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4 transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[85vh] flex flex-col rounded-3xl bg-[#18181b] border border-white/10 p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-250"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-300">
              <MaterialIcon name="help_outline" className="text-[20px]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">{t('profile.faqTitle')}</h3>
              <p className="text-xs text-slate-400">{t('profile.faqSubtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition"
            aria-label={t('common.close')}
          >
            <MaterialIcon name="close" size="sm" />
          </button>
        </div>

        <div className="overflow-y-auto space-y-2.5 pr-1 max-h-[50vh]">
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
                >
                  <span>{item.question}</span>
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

        <div className="pt-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition active:scale-[0.98]"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
