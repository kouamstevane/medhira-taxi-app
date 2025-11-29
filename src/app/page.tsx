/**
 * Page d'Accueil de l'Application
 * 
 * Affiche une carte Google Maps en plein écran avec:
 * - Vue interactive de la ville
 * - Bouton flottant pour demander une course
 * - Aperçu rapide du solde wallet (glassmorphism)
 * - Redirection automatique selon l'état d'authentification
 * 
 * Comportement:
 * - Si non connecté → affiche splash screen avec options de connexion
 * - Si connecté → affiche carte avec fonctionnalités complètes
 * 
 * @page
 */

'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

/**
 * HomePage Component
 * 
 * Page d'accueil principale avec carte interactive et gestion de l'authentification
 */
export default function HomePage() {
  const router = useRouter();
  const { currentUser, loading } = useAuth();

  /**
   * Rediriger les utilisateurs authentifiés vers le dashboard
   * - Si connecté → redirection automatique vers /dashboard
   * - Si non connecté → afficher le splash screen
   */
  useEffect(() => {
    if (!loading && currentUser) {
      // Rediriger immédiatement vers le dashboard si l'utilisateur est connecté
      router.push('/dashboard');
    }
  }, [currentUser, loading, router]);


  // Écran de chargement ou redirection en cours
  if (loading || currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f5f5f5] to-[#e6e6e6] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 bg-[#f29200] rounded-full opacity-20 animate-ping" />
            <div className="relative w-24 h-24 bg-[#f29200] rounded-full flex items-center justify-center shadow-2xl animate-pulse">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 text-white"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1a1 1 0 011-1h2a1 1 0 011 1v1a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1V5a1 1 0 00-1-1H3z" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-[#101010] mb-2">Medjira</h2>
          <p className="text-gray-600 animate-pulse">
            {loading ? 'Chargement...' : 'Redirection...'}
          </p>
        </div>
      </div>
    );
  }

  // Splash Screen pour utilisateurs non connectés uniquement
  if (!currentUser) {
    return (
      <div className="font-sans min-h-screen bg-gradient-to-br from-[#f5f5f5] via-[#e6e6e6] to-[#f5f5f5] p-6 flex flex-col justify-center items-center relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-64 h-64 bg-[#f29200] rounded-full opacity-10 blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-10 w-80 h-80 bg-[#f29200] rounded-full opacity-10 blur-3xl animate-pulse delay-1000" />
        </div>

        {/* Header */}
        <header className="flex justify-center items-center mb-12 w-full max-w-md relative z-10">
          <div className="flex items-center">
            <div className="w-16 h-16 bg-gradient-to-br from-[#f29200] to-[#e68600] rounded-2xl flex items-center justify-center mr-3 shadow-lg transform hover:scale-105 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1a1 1 0 011-1h2a1 1 0 011 1v1a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1V5a1 1 0 00-1-1H3z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-[#101010]">Medjira</h1>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex flex-col items-center w-full max-w-md relative z-10">
          <div className="mb-12 text-center px-4">
            <h1 className="text-4xl font-bold text-[#101010] mb-4 leading-tight">
              <span className="text-[#f29200] bg-clip-text">Mobilité</span> et{' '}
              <span className="text-[#f29200] bg-clip-text">Livraison</span>{' '}
              <span className="block mt-2">Simplifiées</span>
            </h1>
            <p className="text-gray-600 text-lg">
              Commandez un taxi ou faites livrer vos repas en quelques clics
            </p>
          </div>

          <div className="relative w-full h-72 mb-12 px-6">
            <Image
              src="/images/taxi-booking.webp"
              alt="Medjira Service"
              fill
              className="object-contain drop-shadow-2xl"
              priority
            />
          </div>

          <div className="w-full space-y-4">
            <Link href="/login" className="block w-full">
              <button className="w-full py-4 bg-gradient-to-r from-[#f29200] to-[#e68600] text-white rounded-2xl font-bold shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center group">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 group-hover:animate-bounce" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                Se Connecter
              </button>
            </Link>

            <Link href="/auth/register" className="block w-full">
              <button className="w-full py-4 bg-white text-[#101010] border-2 border-[#101010] rounded-2xl font-bold shadow-lg hover:shadow-xl hover:bg-gray-50 transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center group">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 group-hover:rotate-12 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6z" />
                </svg>
                Créer un Compte
              </button>
            </Link>

            {/* Bouton Chauffeur */}
            <Link href="/driver/login" className="block w-full">
              <button className="w-full py-3 bg-transparent text-gray-600 border border-gray-300 rounded-2xl font-medium hover:border-[#f29200] hover:text-[#f29200] transition-all duration-300 flex items-center justify-center group">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Espace Chauffeur
              </button>
            </Link>
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-gray-500 relative z-10">
          <p>🇨🇲 Service disponible au Cameroun</p>
          {/* <p className="mt-2">Douala • Yaoundé • Bafoussam</p> */}
          <p className="mt-2">Quelqu&apos;en soit votre region</p>
        </footer>
      </div>
    );
  }

  // Cette partie ne devrait jamais être atteinte si l'utilisateur est connecté
  // (redirection automatique vers /dashboard)
  // Mais on la garde pour éviter les erreurs TypeScript
  return null;
}
