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
import type { AuthStatus } from '@/types/user';

const AUTH_DATA_RETRY_LIMIT = 2;
const AUTH_DATA_RETRY_DELAY_MS = 150;

interface UserDataFetchResult {
  data: UserData | null;
  transient: boolean;
}

function isTransientAuthDataError(error: unknown): boolean {
  const errorCode = (error as Record<string, unknown>)?.code as string | undefined;
  const errorMessage = error instanceof Error ? error.message : String(error);

  return (
    errorCode === 'auth/network-request-failed'
    || errorCode === 'unavailable'
    || errorCode === 'deadline-exceeded'
    || errorMessage.includes('offline')
    || errorMessage.includes('network')
  );
}

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
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  /**
   * Charger les données utilisateur depuis Firestore.
   *
   * Lecture exclusive de `users/{uid}` (modèle V1, spec §3.1). Le statut effectif
   * d'un rôle pro (driver, restaurant) est lu à la demande via roles.service.
   */
  const fetchUserData = async (user: User, attempt = 0): Promise<UserDataFetchResult> => {
    try {
      console.log('[AuthContext] Début chargement données utilisateur', {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified
      });

      // Forcer le refresh du token avant les lectures Firestore
      // Évite les erreurs permission-denied sur mobile (Capacitor) où le token
      // peut ne pas encore être propagé quand onAuthStateChanged se déclenche.
      await user.getIdToken(attempt > 0);

      const usersSnap = await getDoc(doc(db, 'users', user.uid));
      const userDoc = usersSnap.exists() ? usersSnap : null;

      console.log('[AuthContext] Document utilisateur récupéré', {
        exists: userDoc !== null,
        uid: user.uid,
      });

      if (userDoc) {
        const data = userDoc.data() as UserData;

        const safeRoles = data.roles ?? {};

        console.log('[AuthContext] Données utilisateur chargées avec succès', {
          uid: user.uid,
          activeRole: data.activeRole,
          roles: Object.keys(safeRoles),
        });

        const resolvedUserData: UserData = {
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
          accountState: data.accountState,
          onboarding: data.onboarding,
          draftRestaurant: data.draftRestaurant,
          country: data.country,
          address: data.address,
          stripeCustomerId: data.stripeCustomerId,
          defaultPaymentMethodId: data.defaultPaymentMethodId,
          setupIntentId: data.setupIntentId,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };

        setUserData(resolvedUserData);
        return { data: resolvedUserData, transient: false };
      } else {
        console.info('[AuthContext] Document utilisateur inexistant (peut être en cours de création)', {
          uid: user.uid,
          email: user.email
        });

        setUserData(null);
        return { data: null, transient: false };
      }
    } catch (err: unknown) {
      if (isTransientAuthDataError(err) && attempt < AUTH_DATA_RETRY_LIMIT) {
        await new Promise((resolve) => {
          setTimeout(resolve, AUTH_DATA_RETRY_DELAY_MS * (attempt + 1));
        });
        return fetchUserData(user, attempt + 1);
      }

      const errorObj = err instanceof Error ? err : null;
      const errorCode = (err as Record<string, unknown>)?.code as string | undefined;
      const errorMessage = errorObj?.message ?? String(err);
      if (isTransientAuthDataError(err)) {
        console.warn('[AuthContext] Impossible de charger les données utilisateur (hors ligne):', {
          uid: user.uid,
          errorCode,
          errorMessage,
        });
        return { data: null, transient: true };
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
      return { data: null, transient: false };
    }
  };

  const resolveAuthenticatedUser = async (user: User): Promise<void> => {
    const result = await fetchUserData(user);

    if (auth.currentUser?.uid !== user.uid) return;

    if (result.data) {
      setError(null);
      setAuthStatus('authenticated');
      setLoading(false);
      return;
    }

    if (result.transient) {
      setError('Connexion temporairement indisponible. Synchronisation en attente.');
      setAuthStatus('degraded');
      setLoading(true);
      return;
    }

    setError(null);
    setAuthStatus('unauthenticated');
    setLoading(false);
  };

  useEffect(() => {
    // Écouter les changements d'état d'authentification Firebase
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        setLoading(true);
        setAuthStatus('loading');
        //  CORRECTION BUG #2 : Lire emailVerified directement depuis l'objet user
        setIsEmailVerified(user.emailVerified || false);
        await resolveAuthenticatedUser(user);
      } else {
        setLoading(false);
        setError(null);
        setIsEmailVerified(false);
        setUserData(null);
        setAuthStatus('unauthenticated');
      }
    });

    const retryWhenOnline = () => {
      const user = auth.currentUser;
      if (!user) return;
      setLoading(true);
      setAuthStatus('loading');
      void resolveAuthenticatedUser(user);
    };

    window.addEventListener('online', retryWhenOnline);

    // Nettoyage de l'écouteur lors du démontage
    return () => {
      unsubscribe();
      window.removeEventListener('online', retryWhenOnline);
    };
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
        const result = await fetchUserData(refreshedUser);
        if (result.transient) {
          setError('Connexion temporairement indisponible. Synchronisation en attente.');
          setAuthStatus('degraded');
          return;
        }
        if (!result.data) {
          setUserData(null);
          setAuthStatus('unauthenticated');
          throw new Error('Impossible de recharger le profil utilisateur.');
        }
        setError(null);
        setAuthStatus('authenticated');
      } catch (err) {
        console.error('Erreur lors du rechargement de l\'utilisateur:', err);
        throw err;
      }
    } else {
      setAuthStatus('unauthenticated');
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, authStatus, userData, error, isEmailVerified, reloadUser }}>
      {children}
    </AuthContext.Provider>
  );
}
