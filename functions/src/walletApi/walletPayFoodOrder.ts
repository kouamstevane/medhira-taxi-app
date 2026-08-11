/**
 * Cloud Function `walletPayFoodOrder` — Paie une commande de livraison de repas depuis le wallet
 *
 * Sécurité :
 *   - Le montant est lu depuis le document food_orders côté serveur.
 *   - L'appartenance de la commande est vérifiée (userId == request.auth.uid).
 *   - Création de la transaction, débit du wallet et validation du paiement sont atomiques.
 *
 * @module walletApi/walletPayFoodOrder
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { WalletPayFoodOrderSchema } from '../validators/schemas.js';
import {
  calculateVerifiedFoodOrderTotals,
  type VerifiedMenuItem,
} from '../food/foodOrderPricing.js';
import { isFoodOrderPayable } from '../food/foodDeliveryLifecycle.js';

const CURRENCY_CODE = 'CAD';

interface WalletPayFoodOrderResult {
  transactionId: string;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

export const walletPayFoodOrder = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>): Promise<WalletPayFoodOrderResult> => {
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
      bucket: 'wallet:payFoodOrder',
      limit: 20,
      windowSec: 60,
    });

    try {
      const db = getDb();
      const walletRef = db.collection('wallets').doc(userId);
      const orderRef = db.collection('food_orders').doc(orderId);
      const transactionRef = db.collection('transactions').doc();
      const transactionId = transactionRef.id;
      let resolvedTransactionId = transactionId;

      await db.runTransaction(async (tx) => {
        // 1. Lire la commande et vérifier l'appartenance
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
          resolvedTransactionId = order.paymentTransactionId ?? transactionId;
          return; // Déjà payée
        }

        if (!isFoodOrderPayable(order)) {
          throw new HttpsError('failed-precondition', 'Cette commande ne peut plus être payée.');
        }

        const restaurantSnap = await tx.get(db.collection('restaurants').doc(order.restaurantId));
        if (!restaurantSnap.exists) {
          throw new HttpsError('not-found', 'Restaurant introuvable');
        }
        const restaurant = restaurantSnap.data()!;
        if (restaurant.status !== 'approved' || restaurant.stripeConnectStatus !== 'active') {
          throw new HttpsError('failed-precondition', 'Restaurant indisponible pour le paiement.');
        }

        const menuItems = new Map<string, VerifiedMenuItem>();
        for (const item of order.orderItems ?? []) {
          const itemSnap = await tx.get(
            db
              .collection('restaurants')
              .doc(order.restaurantId)
              .collection('menu_items')
              .doc(item.menuItemId),
          );
          if (itemSnap.exists) {
            const data = itemSnap.data()!;
            menuItems.set(item.menuItemId, {
              name: data.name,
              price: data.price,
              isAvailable: data.isAvailable === true,
            });
          }
        }

        const verifiedTotals = calculateVerifiedFoodOrderTotals(
          {
            orderItems: order.orderItems ?? [],
            deliveryDistance: order.deliveryDistance,
            isWeekend: order.isWeekend === true,
          },
          menuItems,
        );

        // 2. Vérifier le solde du portefeuille
        const walletDoc = await tx.get(walletRef);
        if (!walletDoc.exists) {
          throw new HttpsError('not-found', 'Portefeuille introuvable');
        }
        const currentBalance = walletDoc.data()?.balance ?? 0;
        if (currentBalance < verifiedTotals.totalOrderPrice) {
          throw new HttpsError(
            'failed-precondition',
            `Solde insuffisant: ${currentBalance.toFixed(2)} ${CURRENCY_CODE} disponibles (< ${verifiedTotals.totalOrderPrice.toFixed(2)} ${CURRENCY_CODE})`,
          );
        }

        // 3. Enregistrer la transaction, débiter le portefeuille et valider la commande
        tx.set(transactionRef, {
          id: transactionId,
          userId,
          type: 'payment',
          amount: -verifiedTotals.totalOrderPrice,
          currency: CURRENCY_CODE,
          description: `Paiement commande repas chez ${order.restaurantName || 'Restaurant'}`,
          foodOrderId: orderId,
          status: 'completed',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.update(walletRef, {
          balance: currentBalance - verifiedTotals.totalOrderPrice,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.update(orderRef, {
          orderItems: verifiedTotals.orderItems,
          basePrice: verifiedTotals.basePrice,
          deliveryCost: verifiedTotals.deliveryCost,
          totalOrderPrice: verifiedTotals.totalOrderPrice,
          paymentValidated: true,
          status: 'confirmed',
          paymentTransactionId: transactionId,
          confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return { transactionId: resolvedTransactionId };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('[walletPayFoodOrder] Erreur:', err);
      throw new HttpsError('internal', 'Une erreur est survenue lors du paiement de la commande.');
    }
  },
);
