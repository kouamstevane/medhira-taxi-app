/**
 * LayoutClient - Composant Client pour le Layout
 * 
 * Gère les éléments client-side du layout comme le header conditionnel.
 * Affiche le header seulement pour les utilisateurs connectés et sur les pages appropriées.
 * 
 * @component
 */

'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useNotifications } from '@/hooks/useNotifications';
import { Header } from '@/components/layout/Header';
import { VoipCallProvider } from '@/context/VoipCallProvider';
import { Toaster } from 'react-hot-toast';
import { NotificationHandler } from '@/components/notifications/NotificationHandler';

interface LayoutClientProps {
  children: React.ReactNode;
}

/**
 * Routes où le header ne doit PAS être affiché
 */
const NO_HEADER_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/auth/register',
  '/auth/register/phone',
  '/auth/reset-password',
  '/driver/login',
  '/driver/register',
];

/**
 * LayoutClient Component
 * 
 * Wrapper client-side qui gère l'affichage conditionnel du header
 * et d'autres éléments nécessitant l'accès au contexte client.
 */
export default function LayoutClient({ children }: LayoutClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, userData, loading } = useAuth();
  const { unreadCount } = useNotifications();
  const [showHeader, setShowHeader] = useState(false);
  
  // Initialize keyboard handling to fix white space issues
  useKeyboard();

  /**
   * Déterminer si le header doit être affiché
   */
  useEffect(() => {
    // Ne pas afficher pendant le chargement
    if (loading) {
      setShowHeader(false);
      return;
    }

    // Ne pas afficher si utilisateur non connecté
    if (!currentUser) {
      setShowHeader(false);
      return;
    }

    // Ne pas afficher sur les routes publiques
    const shouldHideHeader = NO_HEADER_ROUTES.some((route) => {
      if (route === pathname) return true;
      if (route.endsWith('/') && pathname.startsWith(route)) return true;
      return false;
    });

    setShowHeader(!shouldHideHeader);
  }, [pathname, currentUser, loading]);

  const body = (
    <>
      {/* Push notifications handler (invisible) */}
      <NotificationHandler />

      {/* Toast notifications */}
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1A1A1A',
            color: '#FFFFFF',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#f29200', secondary: '#0F0F0F' } },
        }}
      />

      {/* Header conditionnel */}
      {showHeader && (
        <Header
          userData={userData}
          notifCount={unreadCount}
          onNotificationClick={() => router.push('/notifications')}
        />
      )}

      {/* Contenu principal */}
      <main>{children}</main>
    </>
  );

  return <VoipCallProvider>{body}</VoipCallProvider>;
}









