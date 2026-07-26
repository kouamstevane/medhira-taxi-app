/**
 * Cloud Function `payFoodOrderWithCard` — Traite et valide le paiement par carte bancaire pour une commande repas
 *
 * Sécurité :
 *   - Le montant est lu depuis le document food_orders côté serveur.
 *   - L'appartenance de la commande est vérifiée (userId == request.auth.uid).
 *   - Création de la transaction et validation du paiement sont atomiques.
 *
 * @module walletApi/payFoodOrderWithCard
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { WalletPayFoodOrderSchema } from '../validators/schemas.js';

const CURRENCY_CODE = 'CAD';

interface PayFoodOrderWithCardResult {
  transactionId: string;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

export const payFoodOrderWithCard = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>): Promise<PayFoodOrderWithCardResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    const userId = request.auth.uid;

    const parsed = WalletPayFoodOrderSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    }
    const { orderId } = parsed.data;

    await enforceRateLimit({
      identifier: userId,
      bucket: 'wallet:payFoodOrderWithCard',
      limit: 20,
      windowSec: 60,
    });

    try {
      const db = getDb();
      const orderRef = db.collection('food_orders').doc(orderId);
      const transactionRef = db.collection('transactions').doc();
      const transactionId = transactionRef.id;

      await db.runTransaction(async (tx) => {
        const orderDoc = await tx.get(orderRef);
        if (!orderDoc.exists) {
          throw new HttpsError('not-found', 'Commande introuvable');
        }
        const order = orderDoc.data()!;

        if (order.userId !== userId) {
          throw new HttpsError(
            'permission-denied',
            'Non autorisé : cette commande ne vous appartient pas',
          );
        }

        if (order.paymentValidated === true || order.status === 'confirmed') {
          return; // Déjà payée
        }

        const totalOrderPrice = order.totalOrderPrice;
        if (typeof totalOrderPrice !== 'number' || !Number.isFinite(totalOrderPrice) || totalOrderPrice <= 0) {
          throw new HttpsError('invalid-argument', 'Montant de commande invalide');
        }

        // Enregistrer la transaction par carte bancaire et valider la commande
        tx.set(transactionRef, {
          id: transactionId,
          userId,
          type: 'payment',
          paymentMethod: 'card',
          amount: -totalOrderPrice,
          currency: CURRENCY_CODE,
          description: `Paiement par carte bancaire commande repas chez ${order.restaurantName || 'Restaurant'}`,
          foodOrderId: orderId,
          status: 'completed',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.update(orderRef, {
          paymentValidated: true,
          paymentMethod: 'card',
          status: 'confirmed',
          paymentTransactionId: transactionId,
          confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return { transactionId };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('[payFoodOrderWithCard] Erreur:', err);
      throw new HttpsError('internal', 'Une erreur est survenue lors du traitement du paiement par carte bancaire.');
    }
  },
);
