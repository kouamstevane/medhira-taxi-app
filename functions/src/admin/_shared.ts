/**
 * Helpers partagés pour les Cloud Functions du groupe admin.
 *
 * Conventions :
 * - `request.auth` doit exister (sinon `unauthenticated`).
 * - Le caller doit être présent dans la collection `admins` soit sous `admins/{uid}`,
 *   soit avec un document où `userId == uid` (parité avec les routes Next.js).
 */

import * as admin from 'firebase-admin';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';

/**
 * Garantit que l'appelant est authentifié et possède des droits admin.
 * Renvoie l'UID de l'admin.
 */
export async function requireAdmin(request: CallableRequest): Promise<string> {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Vous devez être connecté pour effectuer cette action.',
    );
  }
  const uid = request.auth.uid;
  const db = admin.firestore();

  const directDoc = await db.collection('admins').doc(uid).get();
  if (directDoc.exists) return uid;

  const snap = await db
    .collection('admins')
    .where('userId', '==', uid)
    .limit(1)
    .get();

  if (snap.empty) {
    console.warn(`[admin] Tentative d'accès non autorisé par ${uid}`);
    throw new HttpsError(
      'permission-denied',
      'Accès non autorisé. Seuls les administrateurs peuvent effectuer cette action.',
    );
  }
  return uid;
}
