import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, Functions } from "firebase/functions";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { connectDatabaseEmulator, getDatabase, type Database } from "firebase/database";
import { Capacitor } from "@capacitor/core";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

let app: FirebaseApp;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const auth: Auth = getAuth(app);
const useEmulators =
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' &&
  typeof window !== 'undefined';

let firestoreInstance: Firestore;
if (typeof window !== 'undefined') {
  try {
    const isNative = Capacitor.isNativePlatform();
    initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
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
export const functions: Functions = getFunctions(app, 'europe-west1');

if (useEmulators) {
  const globalState = globalThis as typeof globalThis & {
    __medjiraFirebaseEmulatorsConnected?: boolean;
  };
  if (!globalState.__medjiraFirebaseEmulatorsConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    globalState.__medjiraFirebaseEmulatorsConnected = true;
  }
}

let _storage: FirebaseStorage | undefined;
export const getFirebaseStorage = (): FirebaseStorage => {
  if (!_storage) {
    _storage = getStorage(app);
    if (useEmulators) {
      connectStorageEmulator(_storage, '127.0.0.1', 9199);
    }
  }
  return _storage;
};

let _driverApplicationAuth: Auth | undefined;
let _driverApplicationFunctions: Functions | undefined;
let _driverApplicationStorage: FirebaseStorage | undefined;

export const getDriverApplicationFirebaseClients = () => {
  if (!_driverApplicationAuth || !_driverApplicationFunctions || !_driverApplicationStorage) {
    const driverApplicationApp = getApps().find((candidate) => candidate.name === 'driver-application')
      ?? initializeApp(firebaseConfig, 'driver-application');
    _driverApplicationAuth = getAuth(driverApplicationApp);
    _driverApplicationFunctions = getFunctions(driverApplicationApp, 'europe-west1');
    _driverApplicationStorage = getStorage(driverApplicationApp);

    if (useEmulators) {
      connectAuthEmulator(_driverApplicationAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFunctionsEmulator(_driverApplicationFunctions, '127.0.0.1', 5001);
      connectStorageEmulator(_driverApplicationStorage, '127.0.0.1', 9199);
    }
  }

  return {
    auth: _driverApplicationAuth,
    functions: _driverApplicationFunctions,
    storage: _driverApplicationStorage,
  };
};

let _rtdb: Database | undefined;
export const getFirebaseDatabase = (): Database => {
  if (!_rtdb) {
    _rtdb = getDatabase(app);
    if (useEmulators) {
      connectDatabaseEmulator(_rtdb, '127.0.0.1', 9010);
    }
  }
  return _rtdb;
};

export { app };
export default app;
