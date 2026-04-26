/**
 * Hook useAuth
 *
 * Hook unique pour accéder au contexte d'authentification Firebase.
 * Lance une erreur si utilisé en dehors du AuthProvider.
 *
 * @hook
 */

import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContext';
import { AuthContextType } from '@/types';

/**
 * Hook pour accéder à l'utilisateur authentifié et ses données Firestore.
 * Utilise le contexte global AuthContext pour assurer la cohérence.
 *
 * @returns {AuthContextType} État d'authentification
 * @throws {Error} Si utilisé hors d'un AuthProvider
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
