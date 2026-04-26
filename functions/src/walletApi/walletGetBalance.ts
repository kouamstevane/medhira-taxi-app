/**
 * Cloud Function `walletGetBalance` — Solde du portefeuille
 *
 * Migration de `src/app/api/wallet/balance/route.ts` vers `onCall`.
 * Retourne le solde courant du wallet de l'utilisateur authentifié.
 *
 * @module walletApi/walletGetBalance
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const CURRENCY_CODE = 'CAD';

interface WalletBalanceResult {
  balance: number;
  currency: string;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

export const walletGetBalance = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<void>): Promise<WalletBalanceResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    const userId = request.auth.uid;

    try {
      const db = getDb();
      const walletSnap = await db.collection('wallets').doc(userId).get();

      if (!walletSnap.exists) {
        return { balance: 0, currency: CURRENCY_CODE };
      }
      const data = walletSnap.data()!;
      return {
        balance: data.balance ?? 0,
        currency: data.currency ?? CURRENCY_CODE,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('[walletGetBalance] Erreur:', err);
      throw new HttpsError('internal', 'Une erreur est survenue. Veuillez réessayer.');
    }
  },
);
