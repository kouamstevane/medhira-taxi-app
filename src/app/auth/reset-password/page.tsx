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

export default function ResetPasswordPage() {
  const router = useRouter();
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
      setError('Veuillez entrer une adresse email valide');
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
          setError('Aucun compte associé à cet email');
          break;
        case 'auth/invalid-email':
          setError(ERROR_MESSAGES.INVALID_EMAIL);
          break;
        case 'auth/too-many-requests':
          setError('Trop de tentatives. Veuillez réessayer plus tard');
          break;
        default:
          setError('Une erreur est survenue. Veuillez réessayer');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="relative flex min-h-screen w-full flex-col max-w-[430px] mx-auto overflow-hidden">
        {/* Top Safe Area */}
        <div className="h-12 w-full" />

        {/* Back Link */}
        <div className="px-6">
          <Link
            href="/login"
            className="inline-flex items-center text-slate-400 hover:text-primary transition-colors"
          >
            <MaterialIcon name="arrow_back" size="md" className="mr-2" />
            Retour à la connexion
          </Link>
        </div>

        {/* Icon */}
        <div className="flex flex-col items-center justify-center pt-8 pb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <MaterialIcon name="key" className="text-primary text-[32px]" />
          </div>
        </div>

        {/* Heading */}
        <div className="px-6 text-center">
          <h1 className="text-white text-[28px] font-bold leading-tight mb-2">
            {success ? 'Email envoyé !' : 'Mot de passe oublié ?'}
          </h1>
          <p className="text-slate-400 text-base font-normal">
            {success
              ? 'Vérifiez votre boîte email'
              : 'Pas de problème, nous allons vous aider'}
          </p>
        </div>

        {/* Content */}
        <div className="mx-6 mt-8">
          {success ? (
            <div className="glass-card rounded-2xl p-6">
              {/* Success Icon */}
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center">
                  <MaterialIcon name="check_circle" className="text-green-400 text-[40px]" />
                </div>
              </div>

              <p className="text-slate-400 text-center mb-6">
                Un email de réinitialisation a été envoyé à{' '}
                <strong className="text-primary">{email}</strong>
              </p>

              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6">
                <p className="text-sm text-slate-300">
                  Vérifiez également votre dossier spam si vous ne recevez pas l'email dans quelques minutes.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => router.push('/login')}
                  className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform flex items-center justify-center"
                >
                  Retour à la connexion
                </button>

                <button
                  onClick={() => setSuccess(false)}
                  className="glass-card w-full h-14 flex items-center justify-center rounded-2xl border border-white/10 text-slate-300 font-medium active:scale-[0.98] transition-transform"
                >
                  Renvoyer l'email
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-6">
              <div className="text-center mb-6">
                <p className="text-slate-400 text-sm">
                  Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-6 p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
                  <MaterialIcon name="error" size="md" className="text-destructive mt-0.5" />
                  <span className="text-destructive text-sm">{error}</span>
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-6">
                {/* Email Field */}
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <MaterialIcon name="mail" size="md" className="text-slate-500" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    className="glass-input w-full h-14 pl-12 pr-4 rounded-xl text-white placeholder:text-slate-500 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                    placeholder="votre@email.com"
                    required
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Envoi en cours...
                    </>
                  ) : (
                    'Réinitialiser le mot de passe'
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto pb-10 pt-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center text-slate-400 text-sm hover:text-primary transition-colors"
          >
            <MaterialIcon name="arrow_back" size="sm" className="mr-1" />
            Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  );
}
