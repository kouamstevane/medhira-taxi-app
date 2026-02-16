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
 * Contexte d'authentification avec valeurs par défaut
 */
export const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  loading: true,
  userData: null,
  error: null,
  isEmailVerified: false,
  reloadUser: async () => {},
});

/**
 * Provider d'authentification
 * 
 * Wrapper qui fournit l'état d'authentification à tous les composants enfants.
 * S'intègre au layout principal pour être disponible dans toute l'application.
 * 
 * @component
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  useEffect(() => {
    // Écouter les changements d'état d'authentification Firebase
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        try {
          // Récupérer les données utilisateur depuis Firestore
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          
          if (userDoc.exists()) {
            const data = userDoc.data();
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
            setUserData(null);
          }
        } catch (error) {
          console.error('Erreur lors du chargement des données utilisateur:', error);
          setUserData(null);
        }
      } else {
        setUserData(null);
      }

      setLoading(false);
    });

    // Nettoyage de l'écouteur lors du démontage
    return () => unsubscribe();
  }, []);

  // Fonction pour recharger les données utilisateur
  const reloadUser = async () => {
    if (auth.currentUser) {
      try {
        await auth.currentUser.reload();
        setIsEmailVerified(auth.currentUser.emailVerified || false);
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

/**
 * Hook pour utiliser le contexte d'authentification
 * 
 * @returns {AuthContextType} État d'authentification
 * @throws {Error} Si utilisé hors d'un AuthProvider
 * 
 * @example
 * const { currentUser, userData, loading } = useAuth();
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}