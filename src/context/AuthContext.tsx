/**
 * Contexte d'Authentification
 *
 * Fournit l'état d'authentification à toute l'application via Context API.
 * Utilise Firebase Auth pour gérer l'authentification et Firestore pour les données utilisateur.
 *
 * @module context/AuthContext
 */

'use client';

import { createContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { AuthContextType, UserData } from '@/types';
import type { UserRoles } from '@/types/user';

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
  const [error] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  /**
   * Charger les données utilisateur depuis Firestore.
   *
   * Lecture exclusive de `users/{uid}` (modèle V1, spec §3.1). Le statut effectif
   * d'un rôle pro (driver, restaurant) est lu à la demande via roles.service.
   */
  const fetchUserData = async (user: User): Promise<void> => {
    try {
      console.log('[AuthContext] Début chargement données utilisateur', {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified
      });

      // Forcer le refresh du token avant les lectures Firestore
      // Évite les erreurs permission-denied sur mobile (Capacitor) où le token
      // peut ne pas encore être propagé quand onAuthStateChanged se déclenche.
      await user.getIdToken();

      const usersSnap = await getDoc(doc(db, 'users', user.uid));
      const userDoc = usersSnap.exists() ? usersSnap : null;

      console.log('[AuthContext] Document utilisateur récupéré', {
        exists: userDoc !== null,
        uid: user.uid,
      });

      if (userDoc) {
        const data = userDoc.data() as UserData;

        // Cas C2 (spec §8) : doc utilisateur sans `roles` (legacy/corruption).
        // Auto-réparation fire-and-forget via ensureClientRole + fallback local
        // pour ne pas bloquer le rendu.
        let safeRoles: UserRoles;
        if (!data.roles) {
          console.warn('[AuthContext] User without roles, auto-repairing roles.client', {
            uid: user.uid,
          });
          safeRoles = {
            client: { enabled: true as const, joinedAt: data.createdAt },
          };
          // fire-and-forget — ne pas await pour éviter de bloquer le rendu
          import('@/services/roles.service')
            .then((m) =>
              m.ensureClientRole(data).catch((e) =>
                console.error('[AuthContext] ensureClientRole failed', e),
              ),
            )
            .catch((e) =>
              console.error('[AuthContext] roles.service import failed', e),
            );
        } else {
          safeRoles = data.roles;
        }

        console.log('[AuthContext] Données utilisateur chargées avec succès', {
          uid: user.uid,
          activeRole: data.activeRole,
          roles: Object.keys(safeRoles),
        });

        setUserData({
          uid: user.uid,
          email: user.email,
          phoneNumber: user.phoneNumber,
          emailVerified: user.emailVerified,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          profileImageUrl: data.profileImageUrl || user.photoURL || '',
          roles: safeRoles,
          activeRole: data.activeRole ?? 'client',
          lastActiveRole: data.lastActiveRole,
          country: data.country,
          address: data.address,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      } else {
        console.info('[AuthContext] Document utilisateur inexistant (peut être en cours de création)', {
          uid: user.uid,
          email: user.email
        });

        setUserData(null);
      }
    } catch (err: unknown) {
      const errorObj = err instanceof Error ? err : null;
      const errorCode = (err as Record<string, unknown>)?.code as string | undefined;
      const errorMessage = errorObj?.message ?? String(err);
      if (errorCode === 'unavailable' || errorMessage.includes('offline')) {
        console.warn('[AuthContext] Impossible de charger les données utilisateur (hors ligne):', {
          uid: user.uid,
          errorMessage
        });
      } else {
        console.error('[AuthContext] Erreur lors du chargement des données utilisateur:', {
          error: err,
          uid: user.uid,
          errorCode,
          errorMessage,
          errorName: errorObj?.name
        });
      }
      setUserData(null);
    }
  };

  useEffect(() => {
    // Écouter les changements d'état d'authentification Firebase
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        //  CORRECTION BUG #2 : Lire emailVerified directement depuis l'objet user
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
   *  CORRECTION BUG #4 : Recharge également les données Firestore
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
