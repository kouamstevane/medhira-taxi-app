'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface NetworkErrorViewProps {
  /** Titre d'erreur, défaut: "Oops !" */
  title?: string;
  /** Message d'explication, défaut: "Échec du chargement des données. Veuillez vérifier votre connexion internet et réessayer." */
  message?: string;
  /** Callback exécuté lors du clic sur Réessayer ou de la reconnexion automatique */
  onRetry?: () => void | Promise<void>;
  /** Libellé du bouton principal, défaut: "Réessayer" */
  retryLabel?: string;
  /** Affichage en plein écran centré (idéal pour page d'erreur complète) ou en section */
  fullScreen?: boolean;
  /** Déclencher automatiquement onRetry dès que le réseau est rétabli (défaut: true) */
  autoRetryOnReconnect?: boolean;
  /** Afficher un bouton de retour à l'accueil (défaut: false) */
  showHomeButton?: boolean;
  /** Classes CSS supplémentaires pour le conteneur */
  className?: string;
}

/**
 * Illustration SVG sur-mesure inspirée de la capture (câble orange débranché avec Oops!)
 */
export function DisconnectedCableIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-56 h-40 max-w-full mx-auto select-none", className)}
      aria-hidden="true"
    >
      {/* Câble orange en boucle arrondie avec interruption en bas */}
      <path
        d="M 105 130 L 50 130 A 24 24 0 0 1 26 106 L 26 50 A 24 24 0 0 1 50 26 L 210 26 A 24 24 0 0 1 234 50 L 234 106 A 24 24 0 0 1 210 130 L 155 130"
        stroke="#F29200"
        strokeWidth="9"
        strokeLinecap="round"
      />

      {/* Texte "Oops!" au centre de la boucle */}
      <text
        x="130"
        y="88"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#F29200"
        fontSize="34"
        fontWeight="800"
        letterSpacing="0.5"
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        Oops!
      </text>

      {/* Connecteur gauche (Prise mâle) */}
      <g transform="translate(100, 130)">
        {/* Corps de la prise */}
        <rect x="-18" y="-12" width="18" height="24" rx="4" fill="#4B5563" />
        <rect x="-12" y="-9" width="4" height="18" rx="1" fill="#6B7280" />
        {/* Broches mâles */}
        <rect x="0" y="-8" width="10" height="4" rx="1.5" fill="#D1D5DB" />
        <rect x="0" y="4" width="10" height="4" rx="1.5" fill="#D1D5DB" />
      </g>

      {/* Connecteur droit (Prise femelle) */}
      <g transform="translate(160, 130)">
        {/* Corps de la prise */}
        <rect x="0" y="-12" width="18" height="24" rx="4" fill="#4B5563" />
        <rect x="8" y="-9" width="4" height="18" rx="1" fill="#6B7280" />
        {/* Fentes femelles */}
        <rect x="-4" y="-8" width="4" height="4" rx="1" fill="#1F2937" />
        <rect x="-4" y="4" width="4" height="4" rx="1" fill="#1F2937" />
      </g>

      {/* Étincelles / Déconnexion sous l'espace entre les prises */}
      <line x1="125" y1="150" x2="120" y2="162" stroke="#F29200" strokeWidth="3" strokeLinecap="round" />
      <line x1="130" y1="148" x2="130" y2="164" stroke="#F29200" strokeWidth="3" strokeLinecap="round" />
      <line x1="135" y1="150" x2="140" y2="162" stroke="#F29200" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Composant réutilisable pour afficher un état d'erreur réseau convivial et interactif.
 */
export function NetworkErrorView({
  title = 'Oops !',
  message = 'Échec du chargement des données. Veuillez vérifier votre connexion internet et réessayer.',
  onRetry,
  retryLabel = 'Réessayer',
  fullScreen = false,
  autoRetryOnReconnect = true,
  showHomeButton = false,
  className,
}: NetworkErrorViewProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  // Déclenche une vibration haptique sur mobile
  const triggerHaptic = useCallback(async () => {
    if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {
      // Haptic non supporté sur la plateforme
    }
  }, []);

  const handleRetry = useCallback(async () => {
    if (isRetrying) return;
    void triggerHaptic();
    setIsRetrying(true);
    try {
      if (onRetry) {
        await Promise.resolve(onRetry());
      }
    } finally {
      // Petite latence minimale pour que l'utilisateur voit la tentative de rechargement
      setTimeout(() => {
        setIsRetrying(false);
      }, 500);
    }
  }, [isRetrying, onRetry, triggerHaptic]);

  // Écoute active de la reconnexion internet (Capacitor Network + standard Web)
  useEffect(() => {
    if (!autoRetryOnReconnect || !onRetry) return;

    let isMounted = true;
    let networkListener: { remove: () => void } | null = null;

    const onOnline = () => {
      if (isMounted) {
        void handleRetry();
      }
    };

    window.addEventListener('online', onOnline);

    if (Capacitor.isPluginAvailable('Network')) {
      void Network.addListener('networkStatusChange', (status) => {
        if (status.connected && isMounted) {
          onOnline();
        }
      }).then((listener) => {
        if (isMounted) {
          networkListener = listener;
        } else {
          void listener.remove();
        }
      }).catch(() => {
        // Plugin Network indisponible, repli sur window.online
      });
    }

    return () => {
      isMounted = false;
      window.removeEventListener('online', onOnline);
      if (networkListener) {
        void networkListener.remove();
      }
    };
  }, [autoRetryOnReconnect, onRetry, handleRetry]);

  const content = (
    <div className={cn("flex flex-col items-center justify-center text-center max-w-sm mx-auto px-4", className)}>
      {/* Illustration centrale */}
      <div className="mb-4">
        <DisconnectedCableIllustration />
      </div>

      {/* Titre optionnel si différent ou personnalisé */}
      {title && title !== 'Oops !' && (
        <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
      )}

      {/* Message explicatif */}
      <p className="text-slate-300 text-sm sm:text-base font-normal mb-6 leading-relaxed">
        {message}
      </p>

      {/* Bouton Réessayer (Touch Target >= 44x44px) */}
      <div className="w-full flex flex-col items-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={() => void handleRetry()}
            disabled={isRetrying}
            className={cn(
              "w-full min-h-[48px] px-6 py-3 rounded-xl font-semibold text-base transition-all duration-200",
              "bg-[#F29200] hover:bg-[#d98300] active:scale-[0.98] text-white shadow-lg shadow-[#F29200]/20",
              "flex items-center justify-center gap-2",
              "disabled:opacity-70 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-[#F29200] focus:ring-offset-2 focus:ring-offset-background"
            )}
            aria-label={retryLabel}
          >
            <RefreshCw
              className={cn("size-5 shrink-0", isRetrying && "animate-spin")}
              aria-hidden="true"
            />
            <span>{isRetrying ? 'Reconnexion en cours...' : retryLabel}</span>
          </button>
        )}

        {/* Bouton secondaire optionnel Retour Accueil */}
        {showHomeButton && (
          <Link
            href="/"
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 border border-white/10 transition-colors flex items-center justify-center gap-2"
          >
            <Home className="size-4" aria-hidden="true" />
            <span>Retour à l&apos;accueil</span>
          </Link>
        )}
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6" data-testid="network-error-fullscreen">
        {content}
      </div>
    );
  }

  return (
    <div className="py-8 w-full flex items-center justify-center" data-testid="network-error-embedded">
      {content}
    </div>
  );
}
