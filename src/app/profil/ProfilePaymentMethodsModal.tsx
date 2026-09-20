'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';
import { formatCurrencyWithCode } from '@/utils/format';

export interface CardDetails {
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
}

interface ProfilePaymentMethodsModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly hasPaymentMethod: boolean;
  readonly cardDetails?: CardDetails;
  readonly cardholderName?: string;
  readonly walletBalance?: number;
  readonly onRemoveCard?: () => Promise<void>;
}

export function ProfilePaymentMethodsModal({
  isOpen,
  onClose,
  hasPaymentMethod,
  cardDetails,
  cardholderName,
  walletBalance = 0,
  onRemoveCard,
}: ProfilePaymentMethodsModalProps) {
  const { t } = useTranslation();
  const [removing, setRemoving] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const handleConfirmRemove = async () => {
    if (!onRemoveCard) return;
    setRemoving(true);
    try {
      await onRemoveCard();
      setShowConfirmDelete(false);
    } finally {
      setRemoving(false);
    }
  };

  const formattedExpiry =
    cardDetails?.expMonth && cardDetails?.expYear
      ? `${String(cardDetails.expMonth).padStart(2, '0')}/${String(cardDetails.expYear).slice(-2)}`
      : '••/••';

  const brandName = cardDetails?.brand ? cardDetails.brand.toUpperCase() : 'VISA / MASTERCARD';

  return (
    <BottomSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setShowConfirmDelete(false);
          onClose();
        }
      }}
      onCloseRequest={() => {
        setShowConfirmDelete(false);
        onClose();
      }}
      title={t('profile.paymentMethodsTitle')}
      showCloseButton
      closeLabel={t('common.close')}
      className="bg-[#18181b] border-white/10 text-white max-h-[90vh] sm:max-w-md"
    >
      <div className="space-y-5 pb-2">
        {/* Intro */}
        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
          <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-400 shrink-0">
            <MaterialIcon name="credit_card" className="text-[20px]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{t('profile.paymentMethodsSubtitle')}</p>
          </div>
        </div>

        {/* SECTION 1: CARTE BANCAIRE */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('profile.savedCreditCard')}
            </h3>
            {hasPaymentMethod && (
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {t('profile.defaultCard')}
              </span>
            )}
          </div>

          {hasPaymentMethod ? (
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-[#181d38] to-slate-950 border border-indigo-500/30 p-5 space-y-4 shadow-2xl">
              {/* Subtle background glow */}
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none" />

              {/* Card Top Row */}
              <div className="flex items-center justify-between relative">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-7 rounded-md bg-amber-400/20 border border-amber-400/30 flex items-center justify-center">
                    <div className="w-6 h-4 border border-amber-300/40 rounded-sm" />
                  </div>
                  <MaterialIcon name="wifi" className="text-slate-400 text-[18px] rotate-90" />
                </div>
                <span className="text-xs font-bold tracking-wider text-indigo-300">
                  {brandName}
                </span>
              </div>

              {/* Card Number */}
              <div className="relative pt-1">
                <p className="font-mono text-lg font-bold tracking-widest text-white select-all">
                  •••• •••• •••• {cardDetails?.last4 || '••••'}
                </p>
              </div>

              {/* Card Bottom Row */}
              <div className="flex items-center justify-between text-xs text-slate-300 pt-1 relative">
                <div className="truncate max-w-[180px]">
                  <p className="text-[9px] uppercase tracking-wider text-slate-400">{t('profile.fullName')}</p>
                  <p className="font-medium truncate text-white">{cardholderName || t('profile.user')}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-wider text-slate-400">EXPIRE</p>
                  <p className="font-mono font-medium text-white">{formattedExpiry}</p>
                </div>
              </div>

              {/* Card Actions */}
              <div className="pt-2 border-t border-white/10 flex gap-2">
                <Link
                  href="/auth/setup-payment"
                  onClick={onClose}
                  className="flex-1 h-10 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
                >
                  <MaterialIcon name="edit" size="sm" />
                  <span>{t('profile.replaceCard')}</span>
                </Link>
                {onRemoveCard && (
                  <button
                    type="button"
                    onClick={() => setShowConfirmDelete(true)}
                    className="h-10 px-3 rounded-xl bg-destructive/15 hover:bg-destructive/25 text-destructive text-xs font-medium flex items-center justify-center gap-1 transition active:scale-[0.98]"
                    title={t('profile.deleteCard')}
                    aria-label={t('profile.deleteCard')}
                  >
                    <MaterialIcon name="delete" size="sm" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto text-slate-400">
                <MaterialIcon name="credit_card" size="lg" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{t('profile.noCardSaved')}</p>
                <p className="text-xs text-slate-400 mt-0.5">{t('profile.noCardSavedDesc')}</p>
              </div>
              <Link
                href="/auth/setup-payment"
                onClick={onClose}
                className="inline-flex h-11 px-5 rounded-xl bg-gradient-to-r from-primary to-[#ffae33] text-white font-semibold text-xs items-center justify-center gap-2 primary-glow transition active:scale-[0.98]"
              >
                <MaterialIcon name="add" size="sm" />
                <span>{t('profile.addCardButton')}</span>
              </Link>
            </div>
          )}

          {/* Delete Confirmation Alert */}
          {showConfirmDelete && (
            <div className="p-4 rounded-2xl bg-destructive/15 border border-destructive/30 space-y-3 animate-in fade-in duration-150">
              <p className="text-xs font-medium text-destructive leading-relaxed">
                {t('profile.deleteCardConfirm')}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmDelete(false)}
                  disabled={removing}
                  className="flex-1 h-9 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRemove}
                  disabled={removing}
                  className="flex-1 h-9 rounded-xl bg-destructive text-white text-xs font-bold transition hover:bg-destructive/90 flex items-center justify-center gap-1.5"
                >
                  {removing ? (
                    <MaterialIcon name="refresh" className="animate-spin" size="sm" />
                  ) : (
                    t('common.delete')
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: PORTEFEUILLE MEDJIRA */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
            {t('profile.walletBalanceLabel')}
          </h3>
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400">
                <MaterialIcon name="account_balance_wallet" className="text-[20px]" />
              </div>
              <div>
                <p className="text-xs text-slate-400">{t('wallet.currentBalance')}</p>
                <p className="text-lg font-bold text-white tracking-tight">
                  {formatCurrencyWithCode(walletBalance)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/wallet/recharger"
                onClick={onClose}
                className="h-9 px-3.5 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 text-xs font-semibold flex items-center gap-1 transition active:scale-[0.98]"
              >
                <MaterialIcon name="add" size="sm" />
                <span>{t('wallet.topUp')}</span>
              </Link>
              <Link
                href="/wallet"
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition"
                title={t('profile.viewWallet')}
                aria-label={t('profile.viewWallet')}
              >
                <MaterialIcon name="chevron_right" size="sm" />
              </Link>
            </div>
          </div>
        </div>

        {/* Close Button */}
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
