/**
 * Hook useAuth
 * 
 * Hook personnalisé pour gérer l'authentification Firebase.
 * Fournit l'utilisateur courant et son état de chargement.
 * 
 * @hook
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { User, onAuthStateChanged, reload } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { UserData } from '@/types';

interface UseAuthReturn {
  currentUser: User | null;
  userData: UserData | null;
  loading: boolean;
  error: string | null;
  isEmailVerified: boolean;
  reloadUser: () => Promise<void>;
}

/**
 * Hook pour accéder à l'utilisateur authentifié et ses données Firestore
 * 
 * @returns {UseAuthReturn} État d'authentification
 * 
 * @example
 * const { currentUser, userData, loading } = useAuth();
 */
export const useAuth = (): UseAuthReturn => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  useEffect(() => {
    // Écouter les changements d'état d'authentification
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setError(null);

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

          // Mettre à jour le statut de vérification email
          setIsEmailVerified(user.emailVerified || false);
        } catch (err) {
          console.error('Erreur lors de la récupération des données utilisateur:', err);
          setError('Erreur lors du chargement des données utilisateur');
          setUserData(null);
        }
      } else {
        setUserData(null);
        setIsEmailVerified(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fonction pour recharger les données utilisateur
  const reloadUser = useCallback(async () => {
    if (currentUser) {
      try {
        await reload(currentUser);
        setIsEmailVerified(currentUser.emailVerified || false);
      } catch (err) {
        console.error('Erreur lors du rechargement de l\'utilisateur:', err);
      }
    }
  }, [currentUser]);

  return { currentUser, userData, loading, error, isEmailVerified, reloadUser };
};
