/**
 * Configuration Firebase - Point d'entrée unique pour tous les services Firebase
 *
 * Ce fichier centralise l'initialisation de Firebase et exporte les services
 * nécessaires (Auth, Firestore, Storage) pour toute l'application.
 *
 * @module config/firebase
 */

import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import {
  getFirestore,
  Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager
} from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getFunctions, Functions } from "firebase/functions";
import { getDatabase, Database } from "firebase/database";
import { Capacitor } from "@capacitor/core";

/**
 * Configuration Firebase récupérée depuis les variables d'environnement
 * Pour la production, utilisez des variables d'environnement sécurisées
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

/**
 * Initialise Firebase de manière sécurisée
 * Vérifie si une instance existe déjà pour éviter les duplications
 */
let app: FirebaseApp;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

/**
 * Instances des services Firebase
 * Exportées pour être utilisées dans toute l'application
 */
export const auth: Auth = getAuth(app);

//  Activer la persistance locale pour offline-first (medJira.md #3)
// Sur mobile (Capacitor), utiliser SingleTabManager — MultipleTabManager
// utilise BroadcastChannel/localStorage events qui ne fonctionnent pas
// correctement dans un WebView unique, ce qui empêche la propagation
// du token d'auth vers Firestore (erreurs permission-denied).
let firestoreInstance: Firestore;
if (typeof window !== 'undefined') {
  try {
    const isNative = Capacitor.isNativePlatform();
    initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: isNative ? persistentSingleTabManager(undefined) : persistentMultipleTabManager()
      })
    });
    firestoreInstance = getFirestore(app);
  } catch (e) {
    // Fallback si déjà initialisé
    console.warn('Firestore déjà initialisé, utilisation getFirestore');
    firestoreInstance = getFirestore(app);
  }
} else {
  firestoreInstance = getFirestore(app);
}

//  Export de l'instance Firestore
export const db: Firestore = firestoreInstance;
export const storage: FirebaseStorage = getStorage(app);
export const functions: Functions = getFunctions(app);
export const rtdb: Database = getDatabase(app);

/**
 * Export de l'app Firebase pour des cas d'usage avancés
 */
export { app };
export default app;
