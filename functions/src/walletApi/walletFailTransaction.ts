/**
 * Cloud Function `walletFailTransaction` — Marque une transaction comme échouée
 *
 * Migration de `src/app/api/wallet/fail-transaction/route.ts` vers `onCall`.
 *
 * @module walletApi/walletFailTransaction
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { WalletFailTransactionSchema } from '../validators/schemas.js';

interface WalletFailTransactionResult {
  success: true;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

export const walletFailTransaction = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>): Promise<WalletFailTransactionResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    const userId = request.auth.uid;

    const parsed = WalletFailTransactionSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    }
    const { transactionId, reason } = parsed.data;

    await enforceRateLimit({
      identifier: userId,
      bucket: 'wallet:failTransaction',
      limit: 30,
      windowSec: 60,
    });

    try {
      const db = getDb();
      const transactionRef = db.collection('transactions').doc(transactionId);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(transactionRef);
        if (!snap.exists) {
          throw new HttpsError('not-found', 'Transaction introuvable');
        }
        if (snap.data()?.userId !== userId) {
          throw new HttpsError('permission-denied', 'Non autorisé');
        }

        const currentStatus = snap.data()?.status;
        if (currentStatus !== 'pending' && currentStatus !== 'processing') {
          throw new HttpsError(
            'failed-precondition',
            `Impossible de marquer comme échouée : statut actuel "${currentStatus}"`,
          );
        }

        tx.update(transactionRef, {
          status: 'failed',
          failureReason: reason,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return { success: true };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('[walletFailTransaction] Erreur:', err);
      throw new HttpsError('internal', 'Une erreur est survenue. Veuillez réessayer.');
    }
  },
);
