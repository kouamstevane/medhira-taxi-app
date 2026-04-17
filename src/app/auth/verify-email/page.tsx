"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/config/firebase';
import { signOut } from 'firebase/auth';
import { sendVerificationEmail } from '@/services/auth.service';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      setEmail(user.email || '');
      setIsVerified(user.emailVerified || false);

      // Si l'email est déjà vérifié, rediriger vers le dashboard
      if (user.emailVerified) {
        router.push('/dashboard');
      }
    } else {
      // Si aucun utilisateur n'est connecté, rediriger vers la page de connexion
      router.push('/login');
    }
  }, [router]);

  const handleResendEmail = async () => {
    const user = auth.currentUser;
    if (!user) {
      setError('Aucun utilisateur connecté');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await sendVerificationEmail(user);
      setSuccess(`Un email de vérification a été envoyé à ${email}`);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      setError(error.message || 'Erreur lors de l\'envoi de l\'email de vérification');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    const user = auth.currentUser;
    if (!user) {
      setError('Aucun utilisateur connecté');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await user.reload();
      if (user.emailVerified) {
        setSuccess('Votre email a été vérifié avec succès ! Redirection en cours...');
        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      } else {
        setError('Votre email n\'est pas encore vérifié. Veuillez vérifier votre boîte de réception.');
      }
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      setError(error.message || 'Erreur lors de la vérification');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (err: unknown) {
      console.error('Erreur lors de la déconnexion:', err);
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
            href="/"
            className="inline-flex items-center text-slate-400 hover:text-primary transition-colors"
          >
            <MaterialIcon name="arrow_back" size="md" className="mr-2" />
            Retour
          </Link>
        </div>

        {/* Icon */}
        <div className="flex flex-col items-center justify-center pt-8 pb-6">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
            <MaterialIcon name="mail" className="text-primary text-[40px]" />
          </div>
        </div>

        {/* Heading */}
        <div className="px-6 text-center">
          <h1 className="text-white text-[28px] font-bold leading-tight mb-2">Vérifiez votre email</h1>
          <p className="text-slate-400 text-base font-normal">Un email de vérification a été envoyé à votre adresse</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-6 p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2">
            <MaterialIcon name="error" size="md" className="text-destructive mt-0.5" />
            <span className="text-destructive text-sm">{error}</span>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="mx-6 mt-6 p-3 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-2">
            <MaterialIcon name="check_circle" size="md" className="text-green-400 mt-0.5" />
            <span className="text-green-400 text-sm">{success}</span>
          </div>
        )}

        {/* Card */}
        <div className="mx-6 mt-8 glass-card rounded-2xl p-6">
          {/* Email Display */}
          <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
            <p className="text-sm text-slate-500 mb-1">Adresse email :</p>
            <p className="text-lg font-semibold text-white">{email}</p>
          </div>

          {/* Instructions */}
          <div className="mb-6 space-y-3">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center mr-3 mt-0.5">
                <span className="text-white text-sm font-bold">1</span>
              </div>
              <p className="text-sm text-slate-400">Ouvrez votre boîte de réception email</p>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center mr-3 mt-0.5">
                <span className="text-white text-sm font-bold">2</span>
              </div>
              <p className="text-sm text-slate-400">Trouvez l&apos;email de Medjira Taxi</p>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-primary rounded-full flex items-center justify-center mr-3 mt-0.5">
                <span className="text-white text-sm font-bold">3</span>
              </div>
              <p className="text-sm text-slate-400">Cliquez sur le lien de vérification</p>
            </div>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleCheckVerification}
              disabled={loading || isVerified}
              className="w-full h-14 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Vérification en cours...
                </>
              ) : (
                <span className="flex items-center justify-center">
                  <MaterialIcon name="refresh" size="md" className="mr-2" />
                  J&apos;ai vérifié mon email
                </span>
              )}
            </button>

            <button
              onClick={handleResendEmail}
              disabled={loading}
              className="glass-card w-full h-14 flex items-center justify-center gap-2 rounded-2xl border border-white/10 text-slate-300 font-bold active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-slate-300" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Envoi en cours...
                </>
              ) : (
                <>
                  <MaterialIcon name="mail" size="md" />
                  Renvoyer l&apos;email de vérification
                </>
              )}
            </button>

            <button
              onClick={handleLogout}
              className="glass-card w-full h-14 flex items-center justify-center gap-2 rounded-2xl border border-white/10 text-slate-300 font-medium active:scale-[0.98] transition-transform"
            >
              <MaterialIcon name="logout" size="md" />
              Se déconnecter
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto pb-10 pt-6 text-center">
          <p className="text-slate-500 text-sm">Vous n&apos;avez pas reçu l&apos;email ?</p>
          <p className="mt-1">
            <button
              onClick={handleResendEmail}
              disabled={loading}
              className="text-primary text-sm font-semibold hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Renvoyer l&apos;email
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
