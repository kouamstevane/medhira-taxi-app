'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';
import { auth, functions } from '@/config/firebase';
import { createDriverOnboardingAccount, signInWithGoogleForDriver } from '@/services/auth.service';
import { InputField } from '@/components/forms/InputField';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from '@/hooks/useTranslation';
import { buildDriverInvitationDeepLink } from './driver-invitation-links';

type Role = 'chauffeur' | 'livreur' | 'les_deux';

const getErrorMessage = (error: unknown, t: (key: string) => string): string => {
  const value = error as { code?: string; message?: string };
  if (value.code === 'functions/deadline-exceeded') return t('auth.invitationExpired');
  if (value.code === 'functions/permission-denied') return t('auth.invitationMismatch');
  if (value.code === 'auth/email-already-in-use') return t('auth.emailAlreadyInUse');
  if (value.code === 'auth/popup-closed-by-user') return t('auth.googleWindowClosed');
  return value.message || t('common.errorOccurred');
};

export default function DriverInvitationClient() {
  const router = useRouter();
  const [step, setStep] = useState<'code' | 'account'>('code');
  const [invitationResolved, setInvitationResolved] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [invitationId, setInvitationId] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { showError } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('invitationId');
    if (value) setInvitationId(value);
    setInvitationResolved(true);
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform() || !invitationId) return;
    if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;

    const deepLink = buildDriverInvitationDeepLink(invitationId);
    const timer = window.setTimeout(() => window.location.assign(deepLink), 0);
    return () => window.clearTimeout(timer);
  }, [invitationId]);

  const roleLabel = useMemo(() => {
    if (role === 'les_deux') return t('auth.driverRole');
    if (role === 'chauffeur') return t('common.roles.driver') || 'Chauffeur';
    if (role === 'livreur') return t('common.roles.delivery') || 'Livreur';
    return t('auth.driverRole');
  }, [role, t]);

  const validate = async (event: FormEvent) => {
    event.preventDefault();
    if (!invitationId.trim()) {
      showError(t('auth.needToApplyFirst'));
      return;
    }
    if (!code.trim()) {
      showError(t('auth.enterCompleteCode'));
      return;
    }
    setLoading(true);
    try {
      const callable = httpsCallable<{ invitationId: string; email: string; code: string }, { success: true; role: Role }>(functions, 'validateDriverInvitation');
      const result = await callable({ invitationId: invitationId.trim(), email: email.trim(), code: code.trim().toUpperCase() });
      setRole(result.data.role);
      setStep('account');
    } catch (err) {
      showError(getErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  const complete = async () => {
    const callable = httpsCallable<{ invitationId: string; code: string }, { success: true }>(functions, 'completeDriverInvitation');
    await callable({ invitationId: invitationId.trim(), code: code.trim().toUpperCase() });
    router.replace('/driver/register');
  };

  const createWithPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      showError(t('auth.passwordMinLengthPlaceholder'));
      return;
    }
    setLoading(true);
    try {
      await createDriverOnboardingAccount(email.trim(), password);
      await complete();
    } catch (err) {
      showError(getErrorMessage(err, t));
      await auth.signOut().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  };

  const createWithGoogle = async () => {
    setLoading(true);
    try {
      const user = await signInWithGoogleForDriver();
      if ((user.email || '').toLowerCase() !== email.trim().toLowerCase()) {
        await auth.signOut();
        throw new Error(t('auth.invitationMismatch'));
      }
      await complete();
    } catch (err) {
      showError(getErrorMessage(err, t));
      await auth.signOut().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-10 text-white">
      <section className="mx-auto w-full max-w-md glass-card rounded-3xl border border-white/10 p-7">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
            <MaterialIcon name="verified_user" size="lg" />
          </div>
          <h1 className="text-2xl font-bold">{t('auth.driverInvitationTitle')}</h1>
          <p className="mt-2 text-sm text-slate-400">{t('auth.driverInvitationSubtitle')}</p>
        </div>

        {invitationResolved && !invitationId ? (
          <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-200">
            {t('auth.needToApplyFirst')}
          </div>
        ) : !invitationResolved ? (
          <p className="text-center text-sm text-slate-400">{t('common.loading')}</p>
        ) : null}

        {invitationResolved && invitationId && step === 'code' ? (
          <form data-testid="driver-invitation-code-form" onSubmit={validate} className="space-y-4">
            <InputField
              required
              type="email"
              label={t('auth.authorizedEmail')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              autoComplete="email"
            />
            <InputField
              required
              label={t('auth.codeReceivedByEmail')}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="uppercase tracking-[0.2em]"
              placeholder="AB12CD34"
              autoComplete="off"
            />
            <p className="text-xs leading-5 text-slate-500">{t('auth.invitationCodeValidityNotice')}</p>
            <button disabled={loading} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-white disabled:opacity-50">{loading ? t('common.verifying') || 'Vérification…' : t('auth.verifyMyInvitation')}</button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">{t('auth.invitationValidatedForRole', { role: roleLabel })}</div>
            <button type="button" disabled={loading} onClick={createWithGoogle} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-semibold text-slate-900 disabled:opacity-50"><MaterialIcon name="login" size="sm" /> {t('auth.continueWithGoogle')}</button>
            <div className="flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-white/10" />{t('common.or')}<span className="h-px flex-1 bg-white/10" /></div>
            <form onSubmit={createWithPassword} className="space-y-4">
              <InputField
                required
                minLength={8}
                type="password"
                label={t('auth.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.passwordMinLengthPlaceholder')}
                autoComplete="new-password"
              />
              <button disabled={loading} className="w-full rounded-xl border border-primary/40 bg-primary/15 px-4 py-3 font-semibold text-primary disabled:opacity-50">{loading ? t('common.saving') || 'Création…' : t('auth.createWithEmailAndPassword')}</button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
