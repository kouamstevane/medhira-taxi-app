/**
 * Cloud Function `walletEnsure` — Crée le wallet de l'utilisateur s'il n'existe pas
 *
 * Migration de `src/app/api/wallet/ensure/route.ts` vers `onCall`.
 *
 * @module walletApi/walletEnsure
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from '../utils/rateLimiter.js';

const CURRENCY_CODE = 'CAD';

interface WalletEnsureResult {
  userId: string;
  balance: number;
  currency: string;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

export const walletEnsure = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<void>): Promise<WalletEnsureResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    const userId = request.auth.uid;

    await enforceRateLimit({
      identifier: userId,
      bucket: 'wallet:ensure',
      limit: 30,
      windowSec: 60,
    });

    try {
      const db = getDb();
      const walletRef = db.collection('wallets').doc(userId);
      const snap = await walletRef.get();

      if (snap.exists) {
        const data = snap.data()!;
        return {
          userId,
          balance: data.balance ?? 0,
          currency: data.currency ?? CURRENCY_CODE,
        };
      }

      await walletRef.set({
        userId,
        balance: 0,
        currency: CURRENCY_CODE,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        userId,
        balance: 0,
        currency: CURRENCY_CODE,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('[walletEnsure] Erreur:', err);
      throw new HttpsError('internal', 'Une erreur est survenue. Veuillez réessayer.');
    }
  },
);
