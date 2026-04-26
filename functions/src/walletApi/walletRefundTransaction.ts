/**
 * Cloud Function `walletRefundTransaction` — Rembourse une transaction wallet
 *
 * Migration de `src/app/api/wallet/refund-transaction/route.ts` vers `onCall`.
 *
 * Crée une transaction "refund" idempotente (id = `refund_<originalId>`) et
 * crédite le wallet. Idempotence garantie par lecture d'existence dans la
 * même transaction Firestore.
 *
 * @module walletApi/walletRefundTransaction
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { WalletRefundTransactionSchema } from '../validators/schemas.js';

interface WalletRefundResult {
  refundId: string;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

export const walletRefundTransaction = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>): Promise<WalletRefundResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    const userId = request.auth.uid;

    const parsed = WalletRefundTransactionSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    }
    const { originalTransactionId } = parsed.data;

    await enforceRateLimit({
      identifier: userId,
      bucket: 'wallet:refundTransaction',
      limit: 20,
      windowSec: 60,
    });

    try {
      const db = getDb();
      const originalRef = db.collection('transactions').doc(originalTransactionId);
      const walletRef = db.collection('wallets').doc(userId);
      const refundDocId = `refund_${originalTransactionId}`;
      const refundRef = db.collection('transactions').doc(refundDocId);

      await db.runTransaction(async (tx) => {
        const originalSnap = await tx.get(originalRef);
        if (!originalSnap.exists) {
          throw new HttpsError('not-found', 'Transaction originale introuvable');
        }
        const originalData = originalSnap.data()!;

        if (originalData.userId !== userId) {
          throw new HttpsError(
            'permission-denied',
            'Non autorisé : cette transaction ne vous appartient pas',
          );
        }
        if (originalData.status !== 'completed') {
          throw new HttpsError(
            'failed-precondition',
            'Seules les transactions complétées peuvent être remboursées',
          );
        }

        const existingRefundSnap = await tx.get(refundRef);
        if (existingRefundSnap.exists) {
          throw new HttpsError(
            'already-exists',
            'Cette transaction a déjà été remboursée',
          );
        }

        const walletSnap = await tx.get(walletRef);
        if (!walletSnap.exists) {
          throw new HttpsError('not-found', 'Portefeuille introuvable');
        }

        const refundAmount = Math.abs(originalData.amount);

        tx.set(refundRef, {
          id: refundDocId,
          userId,
          type: 'refund',
          amount: refundAmount,
          currency: originalData.currency,
          description: `Remboursement de la transaction ${originalTransactionId}`,
          reference: originalTransactionId,
          status: 'completed',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const currentBalance = walletSnap.data()?.balance ?? 0;
        tx.update(walletRef, {
          balance: currentBalance + refundAmount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return { refundId: refundDocId };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('[walletRefundTransaction] Erreur:', err);
      throw new HttpsError('internal', 'Une erreur est survenue. Veuillez réessayer.');
    }
  },
);
