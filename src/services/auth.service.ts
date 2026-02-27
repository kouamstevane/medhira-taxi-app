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
 * ✅ AJOUT PARAMÈTRE : intendedUserType pour spécifier le type d'utilisateur
 * ✅ AJOUT LOGS : Capture détaillée pour diagnostic permission-denied
 */
export const signInWithGoogle = async (
  intendedUserType: UserType = 'client'
): Promise<User> => {
  console.log('[AuthService] signInWithGoogle appelé', {
    platform: Capacitor.isNativePlatform() ? 'native' : 'web',
    intendedUserType
  });

  let user: User;

  if (Capacitor.isNativePlatform()) {
    try {
      console.log('[AuthService] Initialisation SocialLogin natif');

      await SocialLogin.initialize({
        google: {
          webClientId: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || '113581657187-6ks0rjk23dah979ngued5pjpe638fq85.apps.googleusercontent.com',
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
    } catch (error: any) {
      console.error('[AuthService] Erreur Google Sign-In natif détaillée:', {
        message: error.message,
        code: error.code,
        details: error.details,
        stack: error.stack,
        fullName: error.constructor?.name
      });
      
      // Analyse spécifique de l'erreur "cancelled"
      if (error.message?.includes('cancelled')) {
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

  // Vérifier si l'utilisateur existe dans l'une des collections
  // ✅ CORRECTION : Vérifier la collection correspondante au type attendu
  const collectionName = intendedUserType === 'chauffeur' ? 'drivers' : 'users';
  console.log(`[AuthService] Vérification document dans la collection: ${collectionName}`, {
    uid: user.uid,
    intendedUserType
  });

  const userDoc = await getDoc(doc(db, collectionName, user.uid));

  console.log('[AuthService] Document utilisateur récupéré', {
    exists: userDoc.exists(),
    uid: user.uid
  });

  if (!userDoc.exists()) {
    // Créer le document utilisateur s'il n'existe pas
    // ✅ CORRECTION : Utiliser le paramètre intendedUserType au lieu de hardcoder 'client'
    console.log('[AuthService] Création document utilisateur', {
      uid: user.uid,
      email: user.email,
      userType: intendedUserType
    });

    await createUserDocument(user.uid, {
      email: user.email,
      firstName: user.displayName?.split(' ')[0] || '',
      lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
      profileImageUrl: user.photoURL || undefined,
      userType: intendedUserType,
      ...(intendedUserType === 'chauffeur' ? { status: 'draft' } : {}),
    });

    console.log('[AuthService] Document utilisateur créé avec succès', {
      userType: intendedUserType,
      collection: collectionName
    });
  } else {
    // Mettre à jour l'image de profil si manquante
    const userData = userDoc.data();
    if (user.photoURL && !userData.profileImageUrl) {
      console.log('[AuthService] Mise à jour image de profil', {
        uid: user.uid,
        collection: collectionName
      });

      await updateDoc(doc(db, collectionName, user.uid), {
        profileImageUrl: user.photoURL,
        updatedAt: serverTimestamp(),
      });

      console.log('[AuthService] Image de profil mise à jour avec succès');
    } else {
      console.log('[AuthService] Document utilisateur déjà à jour', {
        uid: user.uid,
        hasProfileImage: !!userData.profileImageUrl
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
 * Connexion avec Google pour les chauffeurs
 *
 * Cette fonction spécialisée gère l'inscription des chauffeurs via Google OAuth.
 * Contrairement à signInWithGoogle() standard, elle crée les documents appropriés
 * dans les collections 'users' (userType: 'chauffeur') et 'drivers' (status: 'draft').
 *
 * Comportement "Best Effort" :
 * - La connexion Google est obligatoire et échouera si elle ne réussit pas
 * - La création du document chauffeur est "best effort" : si elle échoue,
 *   la fonction retourne quand même l'utilisateur connecté
 * - Le document chauffeur sera créé lors de la soumission du formulaire d'inscription
 *
 * Collections affectées :
 * - users/{uid} : Document utilisateur avec userType='chauffeur' (créé par signInWithGoogle)
 * - drivers/{uid} : Document chauffeur avec status='draft' (créé par cette fonction)
 *
 * @returns {Promise<User>} L'utilisateur Firebase connecté avec les documents appropriés
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

  // 1. Se connecter avec Google en spécifiant 'chauffeur' comme userType
  const user = await signInWithGoogle('chauffeur');

  console.log('[AuthService] Connexion Google réussie pour chauffeur', {
    uid: user.uid,
    email: user.email
  });

  // 2. Vérifier si un document existe déjà dans la collection drivers
  const driverDoc = await getDoc(doc(db, 'drivers', user.uid));

  if (!driverDoc.exists()) {
    // 3. Créer le document dans la collection drivers avec le statut 'draft'
    console.log('[AuthService] Création document chauffeur (draft)', {
      uid: user.uid,
      email: user.email
    });

    try {
      await setDoc(doc(db, 'drivers', user.uid), {
        uid: user.uid,
        email: user.email,
        firstName: user.displayName?.split(' ')[0] || '',
        lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
        profileImageUrl: user.photoURL || null,
        userType: 'chauffeur',
        status: 'draft', // Statut initial pour les chauffeurs
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      console.log('[AuthService] Document chauffeur créé avec succès');
    } catch (error) {
      console.error('[AuthService] Erreur lors de la création du document chauffeur:', error);
      // ⚠️ COMPORTEMENT "BEST EFFORT" : On ne lance pas d'erreur pour permettre à l'utilisateur de continuer
      // Le document sera créé lors de la soumission du formulaire d'inscription
      // Cela évite de bloquer l'utilisateur si une erreur temporaire survient
    }
  } else {
    console.log('[AuthService] Document chauffeur existe déjà', {
      uid: user.uid,
      status: driverDoc.data()?.status
    });
  }

  return user;
};

/**
 * Créer ou mettre à jour le document utilisateur dans Firestore
 * ✅ CORRECTION BUG #5 : Utilise serverTimestamp() au lieu de new Date()
 * ✅ CORRECTION BUG #3 : Inclut toujours le champ uid
 * ✅ AJOUT LOGS : Capture détaillée pour diagnostic permission-denied
 */
export const createUserDocument = async (
  userId: string,
  data: Partial<UserData>
): Promise<void> => {
  console.log('[AuthService] createUserDocument appelé', {
    userId,
    dataKeys: Object.keys(data),
    hasEmail: !!data.email
  });
  
  // ✅ NETTOYAGE : Supprimer les champs undefined pour éviter les erreurs Firestore
  const cleanData = Object.entries(data).reduce((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key as keyof UserData] = value as any;
    }
    return acc;
  }, {} as Partial<UserData>);

  // ✅ DÉTERMINER LA COLLECTION : 'drivers' pour les chauffeurs, 'users' pour les clients
  const collectionName = data.userType === 'chauffeur' ? 'drivers' : 'users';
  const userRef = doc(db, collectionName, userId);
  
  try {
    const userSnap = await getDoc(userRef);

    console.log('[AuthService] Document utilisateur vérifié', {
      userId,
      exists: userSnap.exists()
    });

    if (userSnap.exists()) {
      // Mettre à jour l'utilisateur existant
      console.log('[AuthService] Mise à jour document utilisateur existant', {
        userId
      });

      await updateDoc(userRef, {
        ...cleanData,
        updatedAt: serverTimestamp(),
      });

      console.log('[AuthService] Document utilisateur mis à jour avec succès', {
        userId
      });
    } else {
      // Créer un nouveau document utilisateur
      console.log('[AuthService] Création nouveau document utilisateur', {
        userId,
        userType: data.userType
      });

      await setDoc(userRef, {
        uid: userId,          // ✅ uid toujours présent
        ...cleanData,
        createdAt: serverTimestamp(),  // ✅ serverTimestamp() au lieu de new Date()
        updatedAt: serverTimestamp(),
      });

      console.log('[AuthService] Nouveau document utilisateur créé avec succès', {
        userId
      });
    }
  } catch (error) {
    console.error('[AuthService] Erreur lors de la création/mise à jour du document utilisateur', {
      error,
      userId,
      errorCode: (error as { code?: string }).code,
      errorMessage: (error as { message?: string }).message
    });
    throw error;
  }
};

/**
 * Récupérer les données utilisateur depuis Firestore
 */
export const getUserData = async (userId: string): Promise<UserData | null> => {
  // ✅ RECHERCHE MULTI-COLLECTION : Un utilisateur peut être dans 'users' (client) ou 'drivers' (chauffeur)
  const collections = ['users', 'drivers'];
  
  for (const coll of collections) {
    const userRef = doc(db, coll, userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return userSnap.data() as UserData;
    }
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
  // Déterminer la collection d'après le userType si fourni, sinon chercher
  let collectionName = updates.userType === 'chauffeur' ? 'drivers' : 'users';
  
  if (!updates.userType) {
    const data = await getUserData(userId);
    if (data) {
      collectionName = data.userType === 'chauffeur' ? 'drivers' : 'users';
    }
  }

  const userRef = doc(db, collectionName, userId);
  await updateDoc(userRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};
