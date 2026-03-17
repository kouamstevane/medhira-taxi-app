"use client";
/* eslint-disable */
import { useState, useEffect } from 'react';
import { auth } from '../../config/firebase';
import {
  signInWithEmailAndPassword,
  AuthErrorCodes,
  onAuthStateChanged,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthService } from '@/services';
import { FiArrowLeft, FiMail, FiLock } from 'react-icons/fi';
import { ERROR_MESSAGES } from '@/utils/constants';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Rediriger si déjà connecté
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.emailVerified) {
        router.push('/dashboard');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError(ERROR_MESSAGES.REQUIRED_FIELDS);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // Vérifier si l'email est vérifié
      if (!userCredential.user.emailVerified) {
        await auth.signOut();
        setError('Veuillez vérifier votre adresse email avant de vous connecter.');
        return;
      }

      router.push('/dashboard');
    } catch (error: unknown) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await AuthService.signInWithGoogle();
      router.push('/dashboard');
    } catch (error: unknown) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthError = (error: unknown) => {
    const err = error as { code?: string; message?: string };
    let errorMessage = "Une erreur est survenue";

    switch (err.code) {
      case AuthErrorCodes.TOO_MANY_ATTEMPTS_TRY_LATER:
        errorMessage = "Trop de tentatives. Veuillez réessayer plus tard.";
        break;
      case AuthErrorCodes.INVALID_EMAIL:
        errorMessage = ERROR_MESSAGES.INVALID_EMAIL;
        break;
      case AuthErrorCodes.USER_DELETED:
      case AuthErrorCodes.INVALID_PASSWORD:
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        errorMessage = "Email ou mot de passe incorrect";
        break;
      case AuthErrorCodes.NETWORK_REQUEST_FAILED:
        errorMessage = ERROR_MESSAGES.NETWORK_ERROR;
        break;
      case 'auth/popup-closed-by-user':
        errorMessage = "Connexion Google annulée";
        break;
      default:
        errorMessage = err.message || ERROR_MESSAGES.AUTH_ERROR;
    }

    setError(errorMessage);
    console.error("Erreur d'authentification:", error);
  };

  return (
    <div className="min-h-screen bg-[#e6e6e6] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg overflow-hidden w-full max-w-md">
        {/* Header */}
        <div className="bg-[#101010] p-6 text-center relative">
          <Link
            href="/"
            className="absolute left-4 top-6 inline-flex items-center text-white hover:text-[#f29200] transition-colors"
          >
            <FiArrowLeft className="text-xl" />
          </Link>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-[#f29200] rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1a1 1 0 011-1h2a1 1 0 011 1v1a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1V5a1 1 0 00-1-1H3z" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Connexion à Medjira</h1>
          <p className="text-gray-400 text-sm mt-1">Connectez-vous avec votre email</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-md flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Email Login Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-[#101010] mb-1">
                Adresse email
              </label>
              <div className="relative">
                <FiMail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  className="w-full pl-10 pr-4 py-3 rounded-md border border-gray-300 text-[#101010] placeholder-gray-400 bg-white focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200] transition"
                  placeholder="votre@email.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-[#101010] mb-1">
                Mot de passe
              </label>
              <div className="relative">
                <FiLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  className="w-full pl-10 pr-4 py-3 rounded-md border border-gray-300 text-[#101010] placeholder-gray-400 bg-white focus:ring-2 focus:ring-[#f29200] focus:border-[#f29200] transition"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            {/* Forgot password */}
            <div className="text-right">
              <Link href="/auth/reset-password" className="text-sm text-[#f29200] hover:underline">
                Mot de passe oublié ?
              </Link>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#f29200] hover:bg-[#e68600] text-white font-bold py-3 px-4 rounded-md transition-all duration-300 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connexion en cours...
                </>
              ) : (
                'Se connecter'
              )}
            </button>

            {/* Link to resend verification email */}
            {error && error.includes('vérifier votre adresse email') && (
              <div className="text-center">
                <Link
                  href="/auth/verify-email"
                  className="text-sm text-[#f29200] hover:underline font-medium"
                >
                  Renvoyer l&apos;email de vérification
                </Link>
              </div>
            )}
          </form>

          {/* Divider */}
          <div className="mt-6 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Ou continuer avec</span>
            </div>
          </div>

          {/* Google Login */}
          <div className="mt-4">
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              type="button"
              className="w-full flex items-center justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continuer avec Google
            </button>
          </div>

          {/* Signup & Driver Links */}
          <div className="mt-6 text-center text-sm space-y-2">
            <p className="text-gray-600">
              Vous n&apos;avez pas de compte ?{' '}
              <Link href="/auth/register" className="text-[#f29200] font-medium hover:underline">
                S&apos;inscrire
              </Link>
            </p>
            <p className="text-gray-500 text-xs">
              Vous êtes un chauffeur ?{' '}
              <Link href="/driver/login" className="text-[#f29200] font-medium hover:underline">
                Espace chauffeur
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}