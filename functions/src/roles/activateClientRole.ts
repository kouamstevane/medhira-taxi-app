import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

export function buildActivateClientRoleUpdate(now: FirebaseFirestore.FieldValue) {
  return {
    'roles.client': { enabled: true, joinedAt: now },
    accountState: 'active',
    updatedAt: now,
  };
}

export const activateClientRole = onCall(
  { region: 'europe-west1', cors: true },
  async (request: CallableRequest) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(request.auth.uid);
    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(userRef);
      if (!snap.exists) {
        throw new HttpsError('failed-precondition', 'Profil utilisateur introuvable.');
      }

      const data = snap.data() ?? {};
      if (data.accountState === 'driver_onboarding' || data.activeRole === 'driver_onboarding') {
        throw new HttpsError('failed-precondition', 'Terminez votre inscription chauffeur avant d’activer l’espace client.');
      }

      if (data.roles?.client?.enabled === true) {
        transaction.update(userRef, { updatedAt: now });
        return;
      }

      transaction.update(userRef, buildActivateClientRoleUpdate(now));
    });

    return { success: true };
  },
);
