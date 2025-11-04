/**
 * Page 404 - Not Found
 * 
 * Affichée automatiquement par Next.js lorsqu'une route n'existe pas.
 * 
 * @page
 */

import Link from 'next/link';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#101010] via-[#1a1a1a] to-[#2a2a2a] flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center">
        {/* Illustration 404 */}
        <div className="relative mb-8">
          <h1 className="text-[150px] sm:text-[200px] font-bold text-[#f29200] opacity-20">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="w-32 h-32 text-[#f29200]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>

        {/* Titre */}
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          Page introuvable
        </h2>

        {/* Description */}
        <p className="text-gray-300 text-lg mb-8">
          Oups ! La page que vous recherchez semble avoir pris un taxi vers une destination inconnue.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/">
            <Button variant="primary" className="w-full sm:w-auto">
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              Retour à l'accueil
            </Button>
          </Link>

          <Link href="/dashboard">
            <Button variant="outline" className="w-full sm:w-auto border-white text-white hover:bg-white hover:text-[#101010]">
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
              Dashboard
            </Button>
          </Link>
        </div>

        {/* Liens utiles */}
        <div className="mt-12 pt-8 border-t border-gray-700">
          <p className="text-gray-400 text-sm mb-3">Liens utiles :</p>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <Link href="/taxi" className="text-[#f29200] hover:underline">
              Commander un taxi
            </Link>
            <Link href="/wallet" className="text-[#f29200] hover:underline">
              Mon portefeuille
            </Link>
            <Link href="/login" className="text-[#f29200] hover:underline">
              Connexion
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
