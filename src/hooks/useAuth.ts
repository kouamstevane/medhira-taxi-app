/**
 * Hook useAuth
 * 
 * Hook personnalisé pour gérer l'authentification Firebase.
 * Fournit l'utilisateur courant et son état de chargement.
 * 
 * @hook
 */

import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContext';
import { AuthContextType } from '@/types';

/**
 * Hook pour accéder à l'utilisateur authentifié et ses données Firestore
 * Utilise le contexte global AuthContext pour assurer la cohérence.
 * 
 * @returns {AuthContextType} État d'authentification
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
