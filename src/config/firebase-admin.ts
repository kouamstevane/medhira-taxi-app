/**
 * Configuration Firebase Admin SDK
 * 
 * Utilisé pour les opérations côté serveur nécessitant
 * des privilèges élevés (API routes)
 */

import * as admin from 'firebase-admin';

// Vérifier si Firebase Admin est déjà initialisé
if (!admin.apps.length) {
  // Vérifier si les credentials sont disponibles
  const hasCredentials = process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY;

  if (hasCredentials) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
      });
      console.log(' Firebase Admin SDK initialisé');
    } catch (error) {
      console.error('Erreur initialisation Firebase Admin SDK:', error);
    }
  } else {
    console.warn(' Firebase Admin SDK non initialisé (credentials manquants) - Les routes admin ne seront pas disponibles');
  }
}

export const adminAuth = admin.apps.length ? admin.auth() : null;
export const adminDb = admin.apps.length ? admin.firestore() : null;

export default admin;
