/**
 * Configuration Firebase - Exports pour les services VoIP
 * Réexporte les instances Firebase depuis src/config/firebase.ts
 */

import { getFunctions } from 'firebase/functions';
import { db as firestore } from '@/config/firebase';

/**
 * Instance Firestore exportée
 */
export { firestore };

/**
 * Instance Functions Firebase
 */
export const functions = getFunctions();
