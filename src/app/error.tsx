/**
 * Page d'Erreur Globale
 * 
 * Gère les erreurs non capturées dans l'application.
 * Cette page est affichée automatiquement par Next.js en cas d'erreur.
 * 
 * @page
 */

'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log l'erreur vers un service de monitoring (ex: Sentry)
    console.error('Application Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-[#1A1A1A] border border-white/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.4)] rounded-2xl p-8 text-center">
        {/* Icône d'erreur */}
        <div className="w-20 h-20 bg-[#EF4444]/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-10 h-10 text-[#EF4444]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Titre */}
        <h1 className="text-2xl font-bold text-white mb-3">
          Une erreur est survenue
        </h1>

        {/* Message */}
        <p className="text-[#9CA3AF] mb-6">
          Nous sommes désolés, quelque chose s'est mal passé. Veuillez réessayer.
        </p>

        {/* Détails de l'erreur (en développement) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-white/5 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm font-mono text-[#EF4444] break-words">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs text-[#4B5563] mt-2">
                Digest: {error.digest}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={reset}
            variant="default"
            className="w-full sm:w-auto"
          >
            Réessayer
          </Button>
          
          <Button
            onClick={() => window.location.href = '/'}
            variant="outline"
            className="w-full sm:w-auto"
          >
            Retour à l'accueil
          </Button>
        </div>
      </div>
    </div>
  );
}
