'use client';

import React from 'react';
import Link from 'next/link';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';

interface ProfilePartnerModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly hasDriverRole?: boolean;
  readonly hasRestaurantRole?: boolean;
}

export function ProfilePartnerModal({
  isOpen,
  onClose,
  hasDriverRole = false,
  hasRestaurantRole = false,
}: ProfilePartnerModalProps) {
  const { t } = useTranslation();

  return (
    <BottomSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onCloseRequest={onClose}
      title={t('profile.partnerModalTitle')}
      showCloseButton
      closeLabel={t('common.close')}
      className="bg-[#18181b] border-white/10 text-white max-h-[90vh] sm:max-w-md"
    >
      <div className="space-y-4 pb-2">
        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
          <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-400 shrink-0">
            <MaterialIcon name="handshake" className="text-[20px]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{t('profile.partnerModalSubtitle')}</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Driver & Courier Option */}
          <Link
            href={hasDriverRole ? '/dashboard?role=driver' : '/driver/register?from=become-pro'}
            onClick={onClose}
            className="block p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.07] hover:border-amber-500/30 active:scale-[0.98] transition-all group"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/25 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <MaterialIcon name="local_taxi" className="text-[22px]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">
                    {t('profile.partnerDriverTitle')}
                  </h3>
                  {hasDriverRole ? (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                      {t('profile.partnerAlreadyRegistered')}
                    </span>
                  ) : (
                    <MaterialIcon name="chevron_right" className="text-slate-500 group-hover:text-white transition-colors text-[18px] shrink-0" />
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mt-1">
                  {t('profile.partnerDriverDesc')}
                </p>
                <div className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                  <span>{hasDriverRole ? t('profile.accessDashboard') : t('profile.startRegistration')}</span>
                  <MaterialIcon name="arrow_forward" size="sm" />
                </div>
              </div>
            </div>
          </Link>

          {/* Restaurant Option */}
          <Link
            href={hasRestaurantRole ? '/dashboard?role=restaurant' : '/restaurant/register?from=become-pro'}
            onClick={onClose}
            className="block p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.07] hover:border-emerald-500/30 active:scale-[0.98] transition-all group"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <MaterialIcon name="storefront" className="text-[22px]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                    {t('profile.partnerRestaurantTitle')}
                  </h3>
                  {hasRestaurantRole ? (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                      {t('profile.partnerAlreadyRegistered')}
                    </span>
                  ) : (
                    <MaterialIcon name="chevron_right" className="text-slate-500 group-hover:text-white transition-colors text-[18px] shrink-0" />
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mt-1">
                  {t('profile.partnerRestaurantDesc')}
                </p>
                <div className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <span>{hasRestaurantRole ? t('profile.accessDashboard') : t('profile.startRegistration')}</span>
                  <MaterialIcon name="arrow_forward" size="sm" />
                </div>
              </div>
            </div>
          </Link>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-12 min-h-[44px] rounded-2xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition active:scale-[0.98]"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
