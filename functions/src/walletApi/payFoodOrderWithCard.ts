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
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { PayFoodOrderWithCardSchema } from '../validators/schemas.js';
import { createStripeClient, isStripeError } from '../stripe/stripe-client.js';
import {
  calculateVerifiedFoodOrderTotals,
  toStripeAmount,
  type VerifiedMenuItem,
} from '../food/foodOrderPricing.js';

const CURRENCY_CODE = 'CAD';
const CURRENCY = 'cad';
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

interface PayFoodOrderWithCardResult {
  transactionId?: string;
  clientSecret?: string;
  paymentIntentId?: string;
  amount?: number;
  currency?: string;
}

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

let _stripe: ReturnType<typeof createStripeClient> | null = null;
function getStripe() {
  if (!_stripe) {
    _stripe = createStripeClient(stripeSecretKey.value());
  }
  return _stripe;
}

export const payFoodOrderWithCard = onCall(
  { region: 'europe-west1', secrets: [stripeSecretKey] },
  async (request: CallableRequest<unknown>): Promise<PayFoodOrderWithCardResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    const userId = request.auth.uid;

    const parsed = PayFoodOrderWithCardSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', parsed.error.issues[0].message);
    }
    const { orderId, paymentIntentId } = parsed.data;

    await enforceRateLimit({
      identifier: userId,
      bucket: 'wallet:payFoodOrderWithCard',
      limit: 20,
      windowSec: 60,
    });

    try {
      const db = getDb();
      const orderRef = db.collection('food_orders').doc(orderId);

      const verifiedOrder = await db.runTransaction(async (tx) => {
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
          return {
            alreadyPaid: true,
            order,
            totals: {
              orderItems: order.orderItems,
              basePrice: order.basePrice,
              deliveryCost: order.deliveryCost,
              totalOrderPrice: order.totalOrderPrice,
            },
          };
        }

        if (order.status !== 'pending_payment') {
          throw new HttpsError('failed-precondition', 'Cette commande ne peut plus être payée.');
        }

        const restaurantSnap = await tx.get(db.collection('restaurants').doc(order.restaurantId));
        if (!restaurantSnap.exists) {
          throw new HttpsError('not-found', 'Restaurant introuvable');
        }
        const restaurant = restaurantSnap.data()!;
        if (restaurant.status !== 'approved' || restaurant.stripeConnectStatus !== 'active') {
          throw new HttpsError('failed-precondition', 'Restaurant indisponible pour le paiement carte.');
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

        const totals = calculateVerifiedFoodOrderTotals(
          {
            orderItems: order.orderItems ?? [],
            deliveryDistance: order.deliveryDistance,
            isWeekend: order.isWeekend === true,
          },
          menuItems,
        );

        tx.update(orderRef, {
          orderItems: totals.orderItems,
          basePrice: totals.basePrice,
          deliveryCost: totals.deliveryCost,
          totalOrderPrice: totals.totalOrderPrice,
          paymentMethod: 'card',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { alreadyPaid: false, order: { ...order, restaurant }, totals };
      });

      if (verifiedOrder.alreadyPaid) {
        return { transactionId: verifiedOrder.order.paymentTransactionId };
      }

      const existingPaymentIntentId = verifiedOrder.order.stripePaymentIntentId;

      if (!paymentIntentId) {
        if (existingPaymentIntentId) {
          const existing = await getStripe().paymentIntents.retrieve(existingPaymentIntentId);
          if (existing.client_secret) {
            return {
              clientSecret: existing.client_secret,
              paymentIntentId: existing.id,
              amount: verifiedOrder.totals.totalOrderPrice,
              currency: CURRENCY,
            };
          }
        }

        const amountCents = toStripeAmount(verifiedOrder.totals.totalOrderPrice, CURRENCY);
        const stripeAccountId = verifiedOrder.order.restaurant.stripeAccountId;
        if (typeof stripeAccountId !== 'string' || !stripeAccountId.startsWith('acct_')) {
          throw new HttpsError('failed-precondition', 'Compte Stripe du restaurant indisponible.');
        }
        const commissionRate =
          typeof verifiedOrder.order.restaurant.commissionRate === 'number'
            ? Math.min(Math.max(verifiedOrder.order.restaurant.commissionRate, 0), 100)
            : 0;
        const applicationFeeAmount = Math.min(
          Math.round(amountCents * (commissionRate / 100)),
          Math.max(amountCents - 1, 0),
        );
        const paymentIntent = await getStripe().paymentIntents.create(
          {
            amount: amountCents,
            currency: CURRENCY,
            capture_method: 'automatic',
            automatic_payment_methods: { enabled: true },
            ...(applicationFeeAmount > 0 ? { application_fee_amount: applicationFeeAmount } : {}),
            transfer_data: {
              destination: stripeAccountId,
            },
            metadata: {
              purpose: 'food_order',
              userId,
              orderId,
              restaurantId: verifiedOrder.order.restaurantId,
              stripeAccountId,
            },
            description: `Commande repas #${orderId}`,
          },
          { idempotencyKey: `food_order_${orderId}_${amountCents}` },
        );

        if (!paymentIntent.client_secret) {
          throw new HttpsError('internal', 'Impossible de créer le paiement carte.');
        }

        await orderRef.update({
          stripePaymentIntentId: paymentIntent.id,
          paymentCurrency: CURRENCY,
          paymentStatus: paymentIntent.status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          amount: verifiedOrder.totals.totalOrderPrice,
          currency: CURRENCY,
        };
      }

      if (existingPaymentIntentId && existingPaymentIntentId !== paymentIntentId) {
        throw new HttpsError('permission-denied', 'PaymentIntent non associé à cette commande.');
      }

      const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.status !== 'succeeded') {
        throw new HttpsError('failed-precondition', 'Paiement carte non confirmé.');
      }

      if (paymentIntent.metadata?.orderId !== orderId || paymentIntent.metadata?.userId !== userId) {
        throw new HttpsError('permission-denied', 'PaymentIntent invalide pour cette commande.');
      }

      const expectedAmount = toStripeAmount(verifiedOrder.totals.totalOrderPrice, CURRENCY);
      if (paymentIntent.amount !== expectedAmount || paymentIntent.currency !== CURRENCY) {
        throw new HttpsError('failed-precondition', 'Montant Stripe incohérent avec la commande.');
      }

      const transactionRef = db.collection('transactions').doc();
      const transactionId = transactionRef.id;

      await db.runTransaction(async (tx) => {
        const freshOrder = await tx.get(orderRef);
        if (!freshOrder.exists) {
          throw new HttpsError('not-found', 'Commande introuvable');
        }
        const order = freshOrder.data()!;
        if (order.paymentValidated === true || order.status === 'confirmed') {
          return;
        }

        // Enregistrer la transaction par carte bancaire et valider la commande
        tx.set(transactionRef, {
          id: transactionId,
          userId,
          type: 'payment',
          paymentMethod: 'card',
          amount: -verifiedOrder.totals.totalOrderPrice,
          currency: CURRENCY_CODE,
          description: `Paiement par carte bancaire commande repas chez ${order.restaurantName || 'Restaurant'}`,
          foodOrderId: orderId,
          stripePaymentIntentId: paymentIntent.id,
          status: 'completed',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.update(orderRef, {
          paymentValidated: true,
          paymentMethod: 'card',
          status: 'confirmed',
          paymentTransactionId: transactionId,
          stripePaymentIntentId: paymentIntent.id,
          paymentStatus: paymentIntent.status,
          paymentCurrency: CURRENCY,
          confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return { transactionId };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      if (isStripeError(err)) {
        console.error('[payFoodOrderWithCard] Stripe error:', {
          type: err.type,
          code: err.code,
          statusCode: err.statusCode,
          message: err.message,
          requestId: err.requestId,
        });
        throw new HttpsError('internal', `Stripe error: ${err.message}`);
      }
      console.error('[payFoodOrderWithCard] Erreur:', err);
      throw new HttpsError('internal', 'Une erreur est survenue lors du traitement du paiement par carte bancaire.');
    }
  },
);
