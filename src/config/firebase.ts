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

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

let app: FirebaseApp;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const auth: Auth = getAuth(app);

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
    console.warn('Firestore déjà initialisé, utilisation getFirestore');
    firestoreInstance = getFirestore(app);
  }
} else {
  firestoreInstance = getFirestore(app);
}

export const db: Firestore = firestoreInstance;
export const storage: FirebaseStorage = getStorage(app);
export const functions: Functions = getFunctions(app);
export const rtdb: Database = getDatabase(app);

export { app };
export default app;
