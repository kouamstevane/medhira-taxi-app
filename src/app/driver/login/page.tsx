"use client";

/* eslint-disable */
import { useState } from 'react';
import { auth, db } from '../../../config/firebase';
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { AuthService } from '@/services';

export default function DriverLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Vérifier si l'email est vérifié
      if (!userCredential.user.emailVerified) {
        setError('Veuillez vérifier votre adresse email avant de vous connecter. Vérifiez votre boîte de réception ou renvoyez l\'email de vérification.');
        await auth.signOut();
        return;
      }
      
      await verifyDriverAccount(userCredential.user.uid);
    } catch (error: any) {
      if (error.message.includes('Veuillez vérifier votre adresse email')) {
        // Ne pas surcharger l'erreur déjà définie
      } else {
        setError(error.message || "Erreur de connexion");
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyDriverAccount = async (uid: string) => {
    const driverDoc = await getDoc(doc(db, 'drivers', uid));
    
    // Si aucun profil chauffeur n'existe encore, rediriger vers l'inscription chauffeur
    if (!driverDoc.exists()) {
      router.push('/driver/register');
      return;
    }

    const driverData = driverDoc.data();
    if (driverData.status !== 'approved') {
      throw new Error("Votre compte n'est pas encore approuvé");
    }

    router.push('/driver/dashboard');
  };

  const handleGoogleLogin = async () => {
    try {
      const user = await AuthService.signInWithGoogle();
      await verifyDriverAccount(user.uid);
    } catch (error: any) {
      setError(error.message || "Erreur de connexion Google");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#101010] to-[#2d2d2d] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#f29200] to-[#ffaa33] p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-[#f29200]" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1a1 1 0 011-1h2a1 1 0 011 1v1a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1V5a1 1 0 00-1-1H3zM3 5h2v2H3V5zm0 4h2v2H3V9zm0 4h2v2H3v-2zm12-8h2v2h-2V5zm0 4h2v2h-2V9zm0 4h2v2h-2v-2z" />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white">Espace Chauffeur</h1>
          <p className="text-white/90 mt-2">Connectez-vous à votre compte professionnel</p>
        </div>

        {/* Content */}
        <div className="p-8">
          {/* Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-600 mr-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="text-red-700">{error}</span>
            </div>
          )}

          {/* Email Login */}
          <form onSubmit={handleEmailLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Adresse email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-[#101010] placeholder-gray-400 bg-white focus:ring-2 focus:ring-[#f29200] focus:border-transparent"
                  placeholder="votre@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-[#101010] placeholder-gray-400 bg-white focus:ring-2 focus:ring-[#f29200] focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#f29200] to-[#ffaa33] hover:from-[#e68600] hover:to-[#ff9900] text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 flex items-center justify-center shadow-lg"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Connexion...
                  </>
                ) : (
                  '🚗 Se connecter'
                )}
              </button>

              <div className="text-center space-y-2">
                <Link href="/driver/reset-password" className="text-sm text-[#f29200] hover:underline transition">
                  🔓 Mot de passe oublié ?
                </Link>
                <br />
                <Link href="/driver/verify-email" className="text-sm text-[#f29200] hover:underline transition">
                  ✉️ Vérifier mon email
                </Link>
              </div>
            </form>

          {/* Social Login */}
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white text-gray-500">Ou continuer avec</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center py-3 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition transform hover:scale-105"
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
            </div>
          </div>

          {/* Signup Link */}
          <div className="mt-8 text-center text-sm">
            <p className="text-gray-600">
              Vous n'avez pas de compte chauffeur ?{' '}
              <Link href="/driver/register" className="text-[#f29200] font-medium hover:underline transition">
                📋 Devenir chauffeur
              </Link>
            </p>
            <p className="text-gray-500 mt-3 text-xs sm:text-sm">
              Vous êtes un client ?{' '}
              <Link href="/login" className="text-[#f29200] font-medium hover:underline transition touch-manipulation" style={{ minHeight: '44px', display: 'inline-flex', alignItems: 'center' }}>
                Accéder à l'espace client
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}