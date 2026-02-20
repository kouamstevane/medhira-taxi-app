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
import { UserData, UserType } from '@/types';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';

/**
 * Connexion par email et mot de passe
 * ✅ Vérifie la validation de l'email avant de laisser entrer
 */
export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  const result = await signInWithEmailAndPassword(auth, email, password);

  // Vérifier si l'email est vérifié
  if (!result.user.emailVerified) {
    await signOut();
    throw new Error('Veuillez vérifier votre adresse email avant de vous connecter');
  }

  return result.user;
};

/**
 * Inscription par email et mot de passe
 * ✅ Crée le document Firestore et envoie l'email de vérification
 */
export const signUpWithEmail = async (
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  userType: UserType = 'client'
): Promise<User> => {
  const result = await createUserWithEmailAndPassword(auth, email, password);

  // Créer le document utilisateur dans Firestore
  await createUserDocument(result.user.uid, {
    email,
    firstName,
    lastName,
    userType,
  });

  // Envoyer l'email de vérification
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://medjira-service.firebaseapp.com';
    await sendEmailVerification(result.user, {
      url: `${origin}/login`,
      handleCodeInApp: false,
    });
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email de vérification:', error);
    // On continue quand même, l'utilisateur peut renvoyer l'email plus tard
  }

  return result.user;
};

/**
 * Envoyer un email de vérification
 */
export const sendVerificationEmail = async (user: User): Promise<void> => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://medjira-service.firebaseapp.com';
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
 * Connexion avec Google
 * Gère les cas natif (Capacitor) et web (popup)
 */
export const signInWithGoogle = async (): Promise<User> => {
  let user: User;

  if (Capacitor.isNativePlatform()) {
    try {
      await SocialLogin.initialize({
        google: {
          webClientId: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || '113581657187-6ks0rjk23dah979ngued5pjpe638fq85.apps.googleusercontent.com',
          mode: 'online',
        },
      });

      const response = await SocialLogin.login({
        provider: 'google',
        options: {},
      });

      if (response.result.responseType === 'offline' || !('idToken' in response.result)) {
        throw new Error('Google Sign-In failed: No ID token received');
      }

      const credential = GoogleAuthProvider.credential(response.result.idToken);
      const { signInWithCredential } = await import('firebase/auth');
      const result = await signInWithCredential(auth, credential);
      user = result.user;
    } catch (error) {
      console.error('Native Google Sign-In Error:', error);
      throw error;
    }
  } else {
    // Web: Utilisation standard de la popup
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    user = result.user;
  }

  // Vérifier si l'utilisateur existe dans Firestore
  const userDoc = await getDoc(doc(db, 'users', user.uid));

  if (!userDoc.exists()) {
    // Créer le document utilisateur s'il n'existe pas
    await createUserDocument(user.uid, {
      email: user.email,
      firstName: user.displayName?.split(' ')[0] || '',
      lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
      profileImageUrl: user.photoURL || undefined,
      userType: 'client',
    });
  } else {
    // Mettre à jour l'image de profil si manquante
    const userData = userDoc.data();
    if (user.photoURL && !userData.profileImageUrl) {
      await updateDoc(doc(db, 'users', user.uid), {
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
 * Créer ou mettre à jour le document utilisateur dans Firestore
 * ✅ CORRECTION BUG #5 : Utilise serverTimestamp() au lieu de new Date()
 * ✅ CORRECTION BUG #3 : Inclut toujours le champ uid
 */
export const createUserDocument = async (
  userId: string,
  data: Partial<UserData>
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    // Mettre à jour l'utilisateur existant
    await updateDoc(userRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } else {
    // Créer un nouveau document utilisateur
    await setDoc(userRef, {
      uid: userId,          // ✅ uid toujours présent
      ...data,
      createdAt: serverTimestamp(),  // ✅ serverTimestamp() au lieu de new Date()
      updatedAt: serverTimestamp(),
    });
  }
};

/**
 * Récupérer les données utilisateur depuis Firestore
 */
export const getUserData = async (userId: string): Promise<UserData | null> => {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    return userSnap.data() as UserData;
  }

  return null;
};

/**
 * Mettre à jour le profil utilisateur
 */
export const updateUserProfile = async (
  userId: string,
  updates: Partial<UserData>
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};
