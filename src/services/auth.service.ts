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
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { UserData, UserType } from '@/types';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';

/**
 * Connexion par email et mot de passe
 */
export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

/**
 * Inscription par email et mot de passe
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

  return result.user;
};


/**
 * Connexion avec Google
 */
export const signInWithGoogle = async (): Promise<User> => {
  let user: User;

  if (Capacitor.isNativePlatform()) {
    try {
      // Initialisation du plugin (nécessaire pour @capgo/capacitor-social-login)
      // IMPORTANT: Remplacez par vos vrais IDs depuis la console Firebase/Google Cloud
      await SocialLogin.initialize({
        google: {
          webClientId: '113581657187-6ks0rjk23dah979ngued5pjpe638fq85.apps.googleusercontent.com',
          iOSClientId: '113581657187-6ks0rjk23dah979ngued5pjpe638fq85.apps.googleusercontent.com', // À remplacer par iOS Client ID
          iOSServerClientId: '113581657187-6ks0rjk23dah979ngued5pjpe638fq85.apps.googleusercontent.com', // Même que webClientId
          mode: 'online', // 'online' pour obtenir les données utilisateur
        },
      });

      const response = await SocialLogin.login({
        provider: 'google',
        options: {},
      });

      // Vérifier que nous sommes en mode online (avec idToken)
      if (response.result.responseType === 'offline' || !('idToken' in response.result)) {
        throw new Error('Google Sign-In failed: No ID token received (mode offline?)');
      }

      const credential = GoogleAuthProvider.credential(response.result.idToken);
      // Sur mobile, on utilise signInWithCredential car on a déjà le token
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
      lastName: user.displayName?.split(' ')[1] || '',
      profileImageUrl: user.photoURL || undefined,
      userType: 'client',
    });
  }

  return user;
};

/**
 * Configuration du reCAPTCHA pour l'authentification par téléphone
 */
export const setupRecaptcha = (containerId: string): RecaptchaVerifier => {
  return new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {
      // reCAPTCHA résolu
    },
  });
};

/**
 * Envoi du code de vérification par SMS
 */
export const sendVerificationCode = async (
  phoneNumber: string,
  recaptchaVerifier: RecaptchaVerifier
): Promise<ConfirmationResult> => {
  return await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
};

/**
 * Vérification du code SMS et connexion
 */
export const verifyCode = async (
  confirmationResult: ConfirmationResult,
  code: string
): Promise<User> => {
  const result = await confirmationResult.confirm(code);

  // Vérifier si l'utilisateur existe dans Firestore
  const userDoc = await getDoc(doc(db, 'users', result.user.uid));

  if (!userDoc.exists()) {
    // Créer le document utilisateur s'il n'existe pas
    await createUserDocument(result.user.uid, {
      phoneNumber: result.user.phoneNumber || '',
      firstName: '',
      lastName: '',
      userType: 'client',
    });
  }

  return result.user;
};

/**
 * Déconnexion
 */
export const signOut = async (): Promise<void> => {
  await firebaseSignOut(auth);
};

/**
 * Créer ou mettre à jour le document utilisateur dans Firestore
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
      uid: userId,
      ...data,
      createdAt: serverTimestamp(),
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
