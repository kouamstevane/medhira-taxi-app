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
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  
  // Vérifier si l'utilisateur existe dans Firestore
  const userDoc = await getDoc(doc(db, 'users', result.user.uid));
  
  if (!userDoc.exists()) {
    // Créer le document utilisateur s'il n'existe pas
    await createUserDocument(result.user.uid, {
      email: result.user.email,
      firstName: result.user.displayName?.split(' ')[0] || '',
      lastName: result.user.displayName?.split(' ')[1] || '',
      profileImageUrl: result.user.photoURL || undefined,
      userType: 'client',
    });
  }
  
  return result.user;
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
