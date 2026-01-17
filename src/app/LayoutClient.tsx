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
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/layout/Header';

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
  const { currentUser, userData, loading } = useAuth();
  const [showHeader, setShowHeader] = useState(false);

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

  return (
    <>
      {/* Header conditionnel */}
      {showHeader && <Header userData={userData} />}
      
      {/* Contenu principal */}
      <main className={showHeader ? '' : ''}>
        {children}
      </main>
    </>
  );
}









