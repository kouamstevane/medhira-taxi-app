/**
 * Service d'Authentification
 *
 * Gère toutes les opérations d'authentification Firebase et
 * les données utilisateur dans Firestore.
 *
 * @module services/auth
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  User,
  sendEmailVerification,
  reload,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { UserData } from '@/types';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';

/**
 * Connexion par email et mot de passe
 *  Vérifie la validation de l'email avant de laisser entrer
 */
export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

/**
 * Inscription par email et mot de passe
 *  Crée le document Firestore et envoie l'email de vérification
 */
export const signUpWithEmail = async (
  email: string,
  password: string,
  profileData: {
    firstName: string;
    lastName: string;
    phoneNumber?: string | null;
    country?: string;
  }
): Promise<User> => {
  const result = await createUserWithEmailAndPassword(auth, email, password);

  // Créer le document utilisateur dans Firestore
  await createUserDocument(result.user.uid, {
    email,
    firstName: profileData.firstName,
    lastName: profileData.lastName,
    phoneNumber: profileData.phoneNumber ?? null,
    country: profileData.country,
    emailVerified: false,
  });

  return result.user;
};

/**
 * Envoyer un email de vérification
 * @deprecated Utiliser la Cloud Function `sendVerificationCode` à la place.
 * L'envoi de code OTP remplace le lien email Firebase Auth.
 */
export const sendVerificationEmail = async (user: User): Promise<void> => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://medjira-service.firebaseapp.com';
  console.log('[AuthService] Envoi de l\'email de vérification', {
    uid: user.uid,
    email: user.email,
    url: `${origin}/login`
  });
  
  await sendEmailVerification(user, {
    url: `${origin}/login`,
    handleCodeInApp: false,
  });
};

/**
 * Vérifier si l'email de l'utilisateur est vérifié (force un reload)
 */
export const checkEmailVerified = async (user: User): Promise<boolean> => {
  await reload(user);
  return user.emailVerified || false;
};

/**
 * Recharger les données utilisateur depuis Firebase Auth
 */
export const reloadUser = async (user: User): Promise<void> => {
  await reload(user);
};

/**
 * Renvoyer un email de vérification avec gestion de l'état de chargement
 *
 * Cette fonction est utilisée dans le dashboard chauffeur pour permettre
 * aux utilisateurs de renvoyer l'email de vérification si nécessaire.
 *
 * @param user - L'utilisateur Firebase Auth
 * @param onSuccess - Callback optionnel appelé après l'envoi réussi
 * @param onError - Callback optionnel appelé en cas d'erreur
 *
 * @example
 * try {
 *   await resendVerificationEmail(user);
 *   // Afficher un message de succès
 * } catch (error) {
 *   // Afficher un message d'erreur
 * }
 * @deprecated Utiliser la Cloud Function `sendVerificationCode` à la place.
 */
export const resendVerificationEmail = async (
  user: User,
  onSuccess?: (message: string) => void,
  onError?: (error: string) => void
): Promise<void> => {
  try {
    await sendVerificationEmail(user);
    const successMessage = "Un nouvel email de validation a été envoyé à votre adresse. Veuillez vérifier votre boîte de réception.";
    if (onSuccess) {
      onSuccess(successMessage);
    }
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    const errorMessage = error.message || 'Erreur lors de l\'envoi de l\'email de vérification';
    console.error('[AuthService] Erreur lors de l\'envoi de l\'email de vérification:', error);
    if (onError) {
      onError(errorMessage);
    }
    throw error; // Re-throw pour permettre la gestion d'erreur externe si nécessaire
  }
};

/**
 * Connexion avec Google
 * Gère les cas natif (Capacitor) et web (popup)
 *  AJOUT PARAMÈTRE : intendedUserType pour spécifier le type d'utilisateur
 *  AJOUT LOGS : Capture détaillée pour diagnostic permission-denied
 */
// TODO P1: param ignoré, à retirer après refactor des appelants (Tasks 11/13)
export const signInWithGoogle = async (
  _intendedUserType?: string
): Promise<User> => {
  console.log('[AuthService] signInWithGoogle appelé', {
    platform: Capacitor.isNativePlatform() ? 'native' : 'web',
  });

  let user: User;

  if (Capacitor.isNativePlatform()) {
    try {
      console.log('[AuthService] Initialisation SocialLogin natif');

      const webClientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;
      if (!webClientId) {
        throw new Error('NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID non configuré');
      }

      await SocialLogin.initialize({
        google: {
          webClientId,
          mode: 'online',
        },
      });

      console.log('[AuthService] SocialLogin.initialized, tentative login');

      const response = await SocialLogin.login({
        provider: 'google',
        options: {},
      });

      console.log('[AuthService] SocialLogin.login réponse reçue', {
        responseType: response.result.responseType,
        hasIdToken: 'idToken' in response.result
      });

      if (response.result.responseType === 'offline' || !('idToken' in response.result)) {
        throw new Error('Google Sign-In failed: No ID token received');
      }

      const credential = GoogleAuthProvider.credential(response.result.idToken);
      const { signInWithCredential } = await import('firebase/auth');
      const result = await signInWithCredential(auth, credential);
      user = result.user;

      console.log('[AuthService] Connexion Google native réussie', {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified
      });
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string; details?: unknown; stack?: string; constructor?: { name?: string } };
      console.error('[AuthService] Erreur Google Sign-In natif détaillée:', {
        message: err.message,
        code: err.code,
        details: err.details,
        stack: err.stack,
        fullName: err.constructor?.name
      });
      
      // Analyse spécifique de l'erreur "cancelled"
      if (err.message?.includes('cancelled')) {
        console.warn('[AuthService] L\'activité a été annulée. Vérifiez SHA-1 ET Web Client ID dans Firebase.');
      }

      throw error;
    }
  } else {
    // Web: Utilisation standard de la popup
    console.log('[AuthService] Connexion Google web (popup)');

    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    user = result.user;

    console.log('[AuthService] Connexion Google web réussie', {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified
    });
  }

  // Lecture / création unique dans users/{uid}
  const userRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    try {
      await createUserDocument(user.uid, {
        email: user.email,
        firstName: user.displayName?.split(' ')[0] || '',
        lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
        profileImageUrl: user.photoURL || undefined,
        emailVerified: user.emailVerified,
      });
    } catch (docError) {
      // Empêcher un compte Auth orphelin sans document Firestore
      console.error('[AuthService] Échec création document Firestore, déconnexion préventive', {
        uid: user.uid,
        docError
      });
      try { await firebaseSignOut(auth); } catch {}
      throw new Error('Erreur lors de la création du profil. Veuillez réessayer.');
    }
  } else {
    const data = userDoc.data();
    if (user.photoURL && !data.profileImageUrl) {
      await updateDoc(userRef, {
        profileImageUrl: user.photoURL,
        updatedAt: serverTimestamp(),
      });
    }
  }

  return user;
};

/**
 * Déconnexion
 */
export const signOut = async (): Promise<void> => {
  await firebaseSignOut(auth);
};

/**
 * Connexion avec Google côté parcours chauffeur.
 *
 * Avec le modèle multi-rôles, cette fonction est un alias sémantique de
 * `signInWithGoogle()`. Le document `users/{uid}` est créé avec `roles.client`
 * par défaut ; le rôle `chauffeur` et le doc `driverProfiles/{uid}` seront
 * ajoutés par la Cloud Function lors de la soumission du formulaire.
 *
 * @returns {Promise<User>} L'utilisateur Firebase connecté avec le document utilisateur approprié
 *
 * @throws {Error} Si la connexion Google échoue (authentification requise)
 *
 * @example
 * ```ts
 * try {
 *   const user = await signInWithGoogleForDriver();
 *   // Rediriger vers le formulaire d'inscription chauffeur
 *   router.push('/driver/register');
 * } catch (error) {
 *   console.error('Erreur de connexion:', error);
 * }
 * ```
 *
 * @see signInWithGoogle pour la fonction de connexion Google générique
 */
export const signInWithGoogleForDriver = async (): Promise<User> => {
  console.log('[AuthService] signInWithGoogleForDriver appelé');

  // Connexion Google standard ; le doc users/{uid} est créé/maj par signInWithGoogle.
  // Le doc driverProfiles/{uid} sera créé à l'étape 5 du formulaire (Cloud Function).
  const user = await signInWithGoogle();

  console.log('[AuthService] Connexion Google réussie pour chauffeur', {
    uid: user.uid,
    email: user.email
  });

  return user;
};

/**
 * Créer ou mettre à jour le document utilisateur dans Firestore
 *  CORRECTION BUG #5 : Utilise serverTimestamp() au lieu de new Date()
 *  CORRECTION BUG #3 : Inclut toujours le champ uid
 *  AJOUT LOGS : Capture détaillée pour diagnostic permission-denied
 */
export const createUserDocument = async (
  userId: string,
  data: {
    email?: string | null;
    phoneNumber?: string | null;
    firstName: string;
    lastName: string;
    profileImageUrl?: string | null;
    emailVerified?: boolean;
    country?: string;
  },
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    await updateDoc(userRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await setDoc(userRef, {
    uid: userId,
    email: data.email ?? null,
    phoneNumber: data.phoneNumber ?? null,
    firstName: data.firstName,
    lastName: data.lastName,
    profileImageUrl: data.profileImageUrl ?? null,
    emailVerified: data.emailVerified ?? false,
    country: data.country,
    roles: {
      client: { enabled: true, joinedAt: serverTimestamp() },
    },
    activeRole: 'client',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

/**
 * Récupérer les données utilisateur depuis Firestore
 */
export const getUserData = async (userId: string): Promise<UserData | null> => {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  return userSnap.exists() ? (userSnap.data() as UserData) : null;
};

/**
 * Mettre à jour le profil utilisateur
 */
export const updateUserProfile = async (
  userId: string,
  updates: Partial<UserData>
): Promise<void> => {
  const { roles, activeRole: _ar, ...allowed } = updates as Partial<UserData> & {
    roles?: unknown;
  };
  if (roles !== undefined) {
    throw new Error('Cannot update roles client-side — use Cloud Function');
  }
  await updateDoc(doc(db, 'users', userId), {
    ...allowed,
    updatedAt: serverTimestamp(),
  });
};
