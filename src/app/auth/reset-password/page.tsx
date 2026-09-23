/**
 * Page de Réinitialisation du Mot de Passe
 *
 * Permet aux utilisateurs de réinitialiser leur mot de passe via email.
 * Utilise Firebase Auth sendPasswordResetEmail.
 *
 * @page
 */

'use client';

import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ERROR_MESSAGES } from '@/utils/constants';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  /**
   * Gérer l'envoi de l'email de réinitialisation
   */
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setError(t('auth.validEmailPrompt'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: false,
      });

      setSuccess(true);
    } catch (error: unknown) {
      console.error('Erreur de réinitialisation:', error);
      const code = error instanceof Error && 'code' in error ? (error as { code?: string }).code : undefined;

      switch (code) {
        case 'auth/user-not-found':
          setError(t('auth.noAccountFound'));
          break;
        case 'auth/invalid-email':
          setError(ERROR_MESSAGES.INVALID_EMAIL);
          break;
        case 'auth/too-many-requests':
          setError(t('auth.tooManyAttempts'));
          break;
        default:
          setError(t('common.errorOccurred'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-background font-sans text-slate-100 antialiased">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col justify-center overflow-hidden px-5 py-10">
        <div className="mb-7 self-start">
          <Link
            href="/profil"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-300 shadow-sm transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.98]"
          >
            <MaterialIcon name="arrow_back" size="sm" />
            {t('auth.profileSettings')}
          </Link>
        </div>

        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <MaterialIcon name="key" className="text-[28px]" />
          </div>
          <h1 className="mt-7 text-[30px] font-bold leading-[1.1] tracking-[-0.02em] text-white">
            {success ? t('auth.emailSentSuccess') : t('auth.forgotPassword')}
          </h1>
          <p className="mt-3 max-w-[320px] text-[15px] leading-6 text-slate-400">
            {success
              ? t('auth.checkYourInbox')
              : t('auth.helpWithPassword')}
          </p>
        </div>

        <div className="mt-8">
          {success ? (
            <div className="glass-card rounded-2xl p-5 shadow-2xl shadow-black/20 sm:p-6">
              <div className="mb-6 flex justify-center">
                <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center">
                  <MaterialIcon name="check_circle" className="text-green-400 text-[40px]" />
                </div>
              </div>

              <p className="text-slate-400 text-center mb-6">
                {t('auth.resetLinkSentTo', { email })}
              </p>

              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6">
                <p className="text-sm text-slate-300">
                  {t('auth.checkSpamNotice')}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => router.push('/login')}
                  className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform flex items-center justify-center"
                >
                  {t('auth.backToLogin')}
                </button>

                <button
                  onClick={() => setSuccess(false)}
                  className="glass-card w-full h-14 flex items-center justify-center rounded-2xl border border-white/10 text-slate-300 font-medium active:scale-[0.98] transition-transform"
                >
                  {t('auth.resendEmail')}
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-5 shadow-2xl shadow-black/20 sm:p-6">
              <div className="mb-6 text-center">
                <p className="text-sm leading-6 text-slate-400">
                  {t('auth.enterEmailInstruction')}
                </p>
              </div>

              {error && (
                <div className="mb-6 p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
                  <MaterialIcon name="error" size="md" className="text-destructive mt-0.5" />
                  <span className="text-destructive text-sm">{error}</span>
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-6">
                <div className="relative group">
                  <label htmlFor="reset-email" className="mb-2 block text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {t('auth.email')}
                  </label>
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <MaterialIcon name="mail" size="md" className="text-slate-500" />
                  </div>
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    className="glass-input w-full h-14 pl-12 pr-4 rounded-xl text-white placeholder:text-slate-500 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                    placeholder={t('auth.emailPlaceholder')}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-[#e68600] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t('common.loading')}
                    </>
                  ) : (
                    t('auth.resetPasswordAction')
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}

