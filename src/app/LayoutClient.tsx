/**
 * LayoutClient - Composant Client pour le Layout
 * 
 * Gère les éléments client-side du layout comme le header conditionnel.
 * Affiche le header seulement pour les utilisateurs connectés et sur les pages appropriées.
 * 
 * @component
 */

'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/hooks/useAuth';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useNotifications } from '@/hooks/useNotifications';
import { Header } from '@/components/layout/Header';
import { VoipCallProvider } from '@/context/VoipCallProvider';
import { Toaster } from 'react-hot-toast';
import { NotificationHandler } from '@/components/notifications/NotificationHandler';
import { getDriverInvitationPathFromUrl } from '@/app/auth/driver-invitation/driver-invitation-links';
import { getStripeReturnPathFromUrl } from '@/app/stripe-return/stripe-return-links';

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
  
  // Initialize keyboard handling to fix white space issues
  useKeyboard();

  // Intercepte les demandes de navigation émises par les services (push, deep
  // links Capacitor) pour faire un client-side push au lieu d'un full reload.
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ path: string }>;
      const path = ev.detail?.path;
      if (!path) return;
      e.preventDefault();
      router.push(path);
    };
    window.addEventListener('app:navigate', handler);
    return () => window.removeEventListener('app:navigate', handler);
  }, [router]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const navigateFromAppUrl = (url: string) => {
      const stripeReturnPath = getStripeReturnPathFromUrl(url);
      if (stripeReturnPath) {
        router.replace(stripeReturnPath);
        return;
      }

      const path = getDriverInvitationPathFromUrl(url);
      if (path) router.replace(path);
    };

    let listener: Awaited<ReturnType<typeof App.addListener>> | undefined;
    let disposed = false;

    void App.addListener('appUrlOpen', ({ url }) => navigateFromAppUrl(url)).then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        listener = handle;
      }
    });
    void App.getLaunchUrl().then((launch) => {
      if (launch?.url) navigateFromAppUrl(launch.url);
    });

    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, [router]);

  const shouldHideHeader = NO_HEADER_ROUTES.some((route) => {
    if (route === pathname) return true;
    if (route.endsWith('/') && pathname.startsWith(route)) return true;
    return false;
  });
  const showHeader = !loading && Boolean(currentUser) && !shouldHideHeader;

  const body = (
    <>
      {/* Push notifications handler (invisible) */}
      <NotificationHandler />

      {/* Toast notifications */}
      <Toaster
        position="top-center"
        reverseOrder={false}
        gutter={10}
        toastOptions={{
          duration: 5000,
          style: {
            background: 'transparent',
            boxShadow: 'none',
            padding: 0,
          },
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









