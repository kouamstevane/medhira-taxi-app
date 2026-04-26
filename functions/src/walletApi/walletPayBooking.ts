/**
 * Cloud Function `walletPayBooking` — Paie une réservation depuis le wallet
 *
 * Migration de `src/app/api/wallet/pay-booking/route.ts` vers `onCall`.
 *
 * Sécurité (C-SEC-05) :
 *   - le montant débité est lu depuis le booking côté serveur (jamais le body),
 *   - l'ownership du booking est vérifiée avant débit,
 *   - création de la transaction "completed", débit du wallet et marquage
 *     du booking comme payé sont atomiques (Firestore runTransaction).
 *
 * @module walletApi/walletPayBooking
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { WalletPayBookingSchema } from '../validators/schemas.js';

const CURRENCY_CODE = 'CAD';
const MAX_PAY_AMOUNT = 100_000;
// Garde-fou minimal — la logique métier de prix se trouve dans le booking.
const MIN_RIDE_PRICE = 1;

interface WalletPayBookingResult {
  transactionId: string;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

export const walletPayBooking = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>): Promise<WalletPayBookingResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    const userId = request.auth.uid;

    const parsed = WalletPayBookingSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    }
    const { bookingId } = parsed.data;

    await enforceRateLimit({
      identifier: userId,
      bucket: 'wallet:payBooking',
      limit: 20,
      windowSec: 60,
    });

    try {
      const db = getDb();
      const walletRef = db.collection('wallets').doc(userId);
      const bookingRef = db.collection('bookings').doc(bookingId);
      const transactionRef = db.collection('transactions').doc();
      const transactionId = transactionRef.id;

      await db.runTransaction(async (tx) => {
        // 1. Lire le booking et vérifier ownership + prix côté serveur
        const bookingDoc = await tx.get(bookingRef);
        if (!bookingDoc.exists) {
          throw new HttpsError('not-found', 'Réservation introuvable');
        }
        const booking = bookingDoc.data()!;

        if (booking.userId !== userId) {
          throw new HttpsError(
            'permission-denied',
            'Non autorisé : cette réservation ne vous appartient pas',
          );
        }

        if (booking.paymentStatus === 'paid' || booking.status === 'paid') {
          throw new HttpsError('failed-precondition', 'Réservation déjà payée');
        }

        const amount = booking.price;
        if (
          typeof amount !== 'number' ||
          !Number.isFinite(amount) ||
          amount < MIN_RIDE_PRICE ||
          amount > MAX_PAY_AMOUNT
        ) {
          throw new HttpsError('invalid-argument', 'Montant de réservation invalide');
        }

        // 2. Vérifier le solde
        const walletDoc = await tx.get(walletRef);
        if (!walletDoc.exists) {
          throw new HttpsError('not-found', 'Portefeuille introuvable');
        }
        const currentBalance = walletDoc.data()?.balance ?? 0;
        if (currentBalance < amount) {
          throw new HttpsError('failed-precondition', 'Solde insuffisant');
        }

        // 3. Créer la transaction, débiter le wallet, marquer la réservation payée
        tx.set(transactionRef, {
          id: transactionId,
          userId,
          type: 'payment',
          amount: -amount,
          currency: CURRENCY_CODE,
          description: 'Paiement de course',
          bookingId,
          status: 'completed',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.update(walletRef, {
          balance: currentBalance - amount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.update(bookingRef, {
          paymentStatus: 'paid',
          paymentTransactionId: transactionId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return { transactionId };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('[walletPayBooking] Erreur:', err);
      throw new HttpsError('internal', 'Une erreur est survenue. Veuillez réessayer.');
    }
  },
);
