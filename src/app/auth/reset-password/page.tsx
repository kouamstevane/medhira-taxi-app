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
    } catch (error: any) {
      console.error('Erreur de réinitialisation:', error);
      
      switch (error.code) {
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
    <div className="min-h-screen bg-gradient-to-br from-[#f5f5f5] via-[#e6e6e6] to-[#f5f5f5] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-md">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#101010] to-[#2a2a2a] p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-[#f29200] rounded-full flex items-center justify-center shadow-lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">
            {success ? 'Email envoyé !' : 'Mot de passe oublié ?'}
          </h1>
          <p className="text-gray-300 text-sm mt-2">
            {success
              ? 'Vérifiez votre boîte email'
              : 'Pas de problème, nous allons vous aider'}
          </p>
        </div>

        {/* Content */}
        <div className="p-8">
          {success ? (
            <div className="text-center">
              {/* Icône de succès */}
              <div className="mb-6">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-10 w-10 text-green-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>

              <p className="text-gray-700 mb-6">
                Un email de réinitialisation a été envoyé à{' '}
                <strong className="text-[#f29200]">{email}</strong>
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">
                  📧 Vérifiez également votre dossier spam si vous ne recevez pas l'email dans quelques minutes.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => router.push('/login')}
                  className="w-full py-3 bg-[#f29200] hover:bg-[#e68600] text-white font-bold rounded-lg transition"
                >
                  Retour à la connexion
                </button>

                <button
                  onClick={() => setSuccess(false)}
                  className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition"
                >
                  Renvoyer l'email
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div className="text-center mb-6">
                <p className="text-gray-600 text-sm">
                  Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
                </p>
              </div>

              {/* Message d'erreur */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {/* Champ Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Adresse email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f29200] focus:border-transparent transition"
                    placeholder="votre@email.com"
                    required
                  />
                </div>
              </div>

              {/* Bouton d'envoi */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#f29200] hover:bg-[#e68600] text-white font-bold rounded-lg transition transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Envoi en cours...
                  </>
                ) : (
                  'Réinitialiser le mot de passe'
                )}
              </button>

              {/* Lien retour */}
              <div className="text-center">
                <Link
                  href="/login"
                  className="text-sm text-gray-600 hover:text-[#f29200] transition flex items-center justify-center"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                  </svg>
                  Retour à la connexion
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}









