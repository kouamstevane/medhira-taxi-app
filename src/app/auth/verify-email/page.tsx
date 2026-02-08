"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/config/firebase';
import { signOut } from 'firebase/auth';
import { sendVerificationEmail } from '@/services/auth.service';
import { FiMail, FiArrowLeft, FiRefreshCw, FiLogOut, FiCheckCircle } from 'react-icons/fi';

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
    <div className="min-h-screen bg-gradient-to-br from-[#f5f5f5] via-[#e6e6e6] to-[#f5f5f5] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-[#f29200] rounded-full opacity-10 blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-[#f29200] rounded-full opacity-10 blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-gray-600 hover:text-[#f29200] transition-colors mb-6"
          >
            <FiArrowLeft className="mr-2" />
            Retour
          </Link>

          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-gradient-to-br from-[#f29200] to-[#e68600] rounded-full flex items-center justify-center shadow-lg">
              <FiMail className="w-10 h-10 text-white" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-[#101010] mb-2">Vérifiez votre email</h1>
          <p className="text-gray-600">Un email de vérification a été envoyé à votre adresse</p>
        </div>

        {/* Formulaire */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded">
              <p className="text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 text-green-700 rounded flex items-center">
              <FiCheckCircle className="mr-2 flex-shrink-0" />
              <p className="text-sm">{success}</p>
            </div>
          )}

          {/* Email affiché */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Adresse email :</p>
            <p className="text-lg font-semibold text-[#101010]">{email}</p>
          </div>

          {/* Instructions */}
          <div className="mb-6 space-y-3">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-[#f29200] rounded-full flex items-center justify-center mr-3 mt-0.5">
                <span className="text-white text-sm font-bold">1</span>
              </div>
              <p className="text-sm text-gray-700">Ouvrez votre boîte de réception email</p>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-[#f29200] rounded-full flex items-center justify-center mr-3 mt-0.5">
                <span className="text-white text-sm font-bold">2</span>
              </div>
              <p className="text-sm text-gray-700">Trouvez l&apos;email de Medjira Taxi</p>
            </div>
            <div className="flex items-start">
              <div className="flex-shrink-0 w-6 h-6 bg-[#f29200] rounded-full flex items-center justify-center mr-3 mt-0.5">
                <span className="text-white text-sm font-bold">3</span>
              </div>
              <p className="text-sm text-gray-700">Cliquez sur le lien de vérification</p>
            </div>
          </div>

          {/* Boutons */}
          <div className="space-y-3">
            <button
              onClick={handleCheckVerification}
              disabled={loading || isVerified}
              className="w-full py-3 bg-gradient-to-r from-[#f29200] to-[#e68600] text-white rounded-lg font-bold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Vérification en cours...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <FiRefreshCw className="mr-2" />
                  J&apos;ai vérifié mon email
                </span>
              )}
            </button>

            <button
              onClick={handleResendEmail}
              disabled={loading}
              className="w-full py-3 px-4 border border-[#f29200] text-[#f29200] rounded-lg font-bold hover:bg-[#f29200] hover:text-white transition-all duration-300 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-[#f29200]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Envoi en cours...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <FiMail className="mr-2" />
                  Renvoyer l&apos;email de vérification
                </span>
              )}
            </button>

            <button
              onClick={handleLogout}
              className="w-full py-3 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-all duration-300 flex items-center justify-center"
            >
              <FiLogOut className="mr-2" />
              Se déconnecter
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Vous n&apos;avez pas reçu l&apos;email ?</p>
          <p className="mt-1">
            <button
              onClick={handleResendEmail}
              disabled={loading}
              className="text-[#f29200] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Renvoyer l&apos;email
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
