'use client';

import React, { useState } from 'react';
import { sendPasswordResetEmail, sendEmailVerification } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/hooks/useAuth';

interface ProfileSecurityModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function ProfileSecurityModal({ isOpen, onClose }: ProfileSecurityModalProps) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useToast();

  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifySent, setVerifySent] = useState(false);

  const email = currentUser?.email || '';
  const isEmailVerified = currentUser?.emailVerified || false;
  const isGoogleUser = currentUser?.providerData.some((p) => p.providerId === 'google.com');

  const handleSendResetEmail = async () => {
    if (!email) {
      showError(t('auth.validEmailPrompt'));
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: false,
      });
      setResetSent(true);
      showSuccess(t('profile.resetLinkSent', { email }));
    } catch (err: unknown) {
      const code = err instanceof Error && 'code' in err ? (err as { code?: string }).code : undefined;
      if (code === 'auth/too-many-requests') {
        showError(t('auth.tooManyAttempts'));
      } else {
        showError(t('common.errorOccurred'));
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleSendVerificationEmail = async () => {
    if (!auth.currentUser) return;

    setVerifyLoading(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setVerifySent(true);
      showSuccess(t('profile.verificationSent'));
    } catch (err: unknown) {
      const code = err instanceof Error && 'code' in err ? (err as { code?: string }).code : undefined;
      if (code === 'auth/too-many-requests') {
        showError(t('auth.tooManyAttempts'));
      } else {
        showError(t('common.errorOccurred'));
      }
    } finally {
      setVerifyLoading(false);
    }
  };

  return (
    <BottomSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setResetSent(false);
          setVerifySent(false);
          onClose();
        }
      }}
      onCloseRequest={() => {
        setResetSent(false);
        setVerifySent(false);
        onClose();
      }}
      title={t('profile.securityModalTitle')}
      showCloseButton
      closeLabel={t('common.close')}
      className="bg-[#18181b] border-white/10 text-white max-h-[85vh] sm:max-w-lg"
    >
      <div className="space-y-4 pb-4">
        {/* Intro */}
        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
          <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shrink-0">
            <MaterialIcon name="shield" className="text-[20px]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{t('profile.securityModalSubtitle')}</p>
          </div>
        </div>

        {/* SECTION 1: Identifiant & Méthode de connexion */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t('profile.loginMethodLabel')}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-white/10 text-slate-200">
              <MaterialIcon name={isGoogleUser ? 'account_circle' : 'mail'} size="sm" />
              {isGoogleUser ? 'Google' : 'Email'}
            </span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-white/5">
            <div className="min-w-0 flex-1 pr-3">
              <p className="text-xs text-slate-400">{t('profile.connectedEmail')}</p>
              <p className="text-sm font-mono font-medium text-white truncate">{email || '—'}</p>
            </div>
            {isEmailVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 shrink-0">
                <MaterialIcon name="verified" size="sm" />
                {t('profile.emailVerifiedBadge')}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleSendVerificationEmail}
                disabled={verifyLoading || verifySent}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-amber-500/15 border border-amber-500/25 px-2.5 py-1 text-xs font-semibold text-amber-400 hover:bg-amber-500/25 transition disabled:opacity-50 shrink-0"
              >
                <MaterialIcon name={verifyLoading ? 'refresh' : 'send'} size="sm" className={verifyLoading ? 'animate-spin' : ''} />
                <span>{verifySent ? t('common.done') : t('profile.resendVerification')}</span>
              </button>
            )}
          </div>
        </div>

        {/* SECTION 2: Mot de passe */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <MaterialIcon name="lock" size="sm" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{t('profile.passwordManagement')}</h3>
              <p className="text-xs text-slate-400">{t('profile.passwordManagementDesc')}</p>
            </div>
          </div>

          {isGoogleUser ? (
            <div className="rounded-xl bg-white/[0.04] p-3 text-xs text-slate-300 leading-relaxed border border-white/5">
              {t('profile.googleAuthNotice')}
            </div>
          ) : (
            <div className="pt-2">
              {resetSent ? (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 flex items-start gap-2.5 text-xs text-emerald-300">
                  <MaterialIcon name="mark_email_read" size="sm" className="shrink-0 text-emerald-400 mt-0.5" />
                  <p>{t('profile.resetLinkSent', { email })}</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSendResetEmail}
                  disabled={resetLoading}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-[#ffae33] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.99] disabled:opacity-50"
                >
                  {resetLoading ? (
                    <>
                      <MaterialIcon name="refresh" className="animate-spin" size="sm" />
                      <span>{t('common.loading')}</span>
                    </>
                  ) : (
                    <>
                      <MaterialIcon name="mail" size="sm" />
                      <span>{t('profile.sendResetLink')}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* SECTION 3: Protection & Conformité */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
            <MaterialIcon name="verified_user" size="sm" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white">{t('profile.accountProtectionTitle')}</h4>
            <p className="mt-0.5 text-[11px] text-slate-400 leading-normal">
              {t('profile.accountProtectionDesc')}
            </p>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}

export default ProfileSecurityModal;
