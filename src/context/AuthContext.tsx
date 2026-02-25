/**
 * Contexte d'Authentification
 *
 * Fournit l'état d'authentification à toute l'application via Context API.
 * Utilise Firebase Auth pour gérer l'authentification et Firestore pour les données utilisateur.
 *
 * @module context/AuthContext
 */

'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { AuthContextType, UserData } from '@/types';

/**
 * Contexte d'authentification — valeur null par défaut pour détecter l'usage hors AuthProvider
 */
export const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Provider d'authentification
 *
 * Wrapper qui fournit l'état d'authentification à tous les composants enfants.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  /**
   * Charger les données utilisateur depuis Firestore
   * ✅ AJOUT LOGS : Capture détaillée des erreurs pour diagnostic
   */
  const fetchUserData = async (user: User): Promise<void> => {
    try {
      console.log('[AuthContext] Début chargement données utilisateur', {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified
      });

      const userDoc = await getDoc(doc(db, 'users', user.uid));

      console.log('[AuthContext] Document utilisateur récupéré', {
        exists: userDoc.exists(),
        uid: user.uid
      });

      if (userDoc.exists()) {
        const data = userDoc.data();
        console.log('[AuthContext] Données utilisateur chargées avec succès', {
          uid: user.uid,
          userType: data.userType,
          firstName: data.firstName
        });

        setUserData({
          uid: user.uid,
          email: user.email,
          phoneNumber: user.phoneNumber,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          profileImageUrl: data.profileImageUrl || user.photoURL || '',
          userType: data.userType || 'client',
          country: data.country,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      } else {
        console.warn('[AuthContext] Document utilisateur inexistant', {
          uid: user.uid,
          email: user.email
        });
        setUserData(null);
      }
    } catch (err) {
      console.error('[AuthContext] Erreur lors du chargement des données utilisateur:', {
        error: err,
        uid: user.uid,
        errorCode: (err as { code?: string }).code,
        errorMessage: (err as { message?: string }).message,
        errorName: (err as { name?: string }).name
      });
      setUserData(null);
    }
  };

  useEffect(() => {
    // Écouter les changements d'état d'authentification Firebase
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        // ✅ CORRECTION BUG #2 : Lire emailVerified directement depuis l'objet user
        setIsEmailVerified(user.emailVerified || false);
        await fetchUserData(user);
      } else {
        setIsEmailVerified(false);
        setUserData(null);
      }

      setLoading(false);
    });

    // Nettoyage de l'écouteur lors du démontage
    return () => unsubscribe();
  }, []);

  /**
   * Recharger les données utilisateur (Auth + Firestore)
   * ✅ CORRECTION BUG #4 : Recharge également les données Firestore
   */
  const reloadUser = async () => {
    if (auth.currentUser) {
      try {
        await auth.currentUser.reload();
        const refreshedUser = auth.currentUser;
        setCurrentUser(refreshedUser);
        setIsEmailVerified(refreshedUser.emailVerified || false);
        // Recharger aussi les données Firestore
        await fetchUserData(refreshedUser);
      } catch (err) {
        console.error('Erreur lors du rechargement de l\'utilisateur:', err);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, userData, error, isEmailVerified, reloadUser }}>
      {children}
    </AuthContext.Provider>
  );
}