import * as admin from 'firebase-admin';

let adminAuth: admin.auth.Auth;
let adminDb: admin.firestore.Firestore;

try {
  if (!admin.apps.length) {
    const hasCredentials = process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY;

    if (!hasCredentials) {
      throw new Error('Firebase Admin credentials missing: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are required');
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
    });
    console.log(' Firebase Admin SDK initialisé');
  }
  adminAuth = admin.auth();
  adminDb = admin.firestore();
} catch (error) {
  throw new Error(`Firebase Admin initialization failed: ${error instanceof Error ? error.message : String(error)}`);
}

export { adminAuth, adminDb };
export default admin;
