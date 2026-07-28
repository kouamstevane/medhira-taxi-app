import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { RestaurantManageFoodOrderStatusSchema } from '../validators/schemas.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import { RESTAURANT_CANCELLABLE_FOOD_ORDER_STATUSES } from '../food/foodDeliveryLifecycle.js';

const allowedTransitions: Record<string, readonly string[]> = {
  ...Object.fromEntries(
    RESTAURANT_CANCELLABLE_FOOD_ORDER_STATUSES.map((status) => [status, ['cancelled_by_restaurant']]),
  ),
  confirmed: ['accepted', 'cancelled_by_restaurant'],
  accepted: ['preparing', 'cancelled_by_restaurant'],
  preparing: ['ready', 'cancelled_by_restaurant'],
};

export const restaurantManageFoodOrderStatus = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    const parsed = RestaurantManageFoodOrderStatusSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'Données invalides.', parsed.error.format());
    }

    const { orderId, status, cancellationReason } = parsed.data;

    await enforceRateLimit({
      identifier: uid,
      bucket: 'restaurant:manageFoodOrderStatus',
      limit: 60,
      windowSec: 60,
    });

    const db = admin.firestore();
    const orderRef = db.collection('food_orders').doc(orderId);

    await db.runTransaction(async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) {
        throw new HttpsError('not-found', 'Commande introuvable.');
      }

      const order = orderSnap.data()!;
      const restaurantId = order.restaurantId;
      if (typeof restaurantId !== 'string' || !restaurantId) {
        throw new HttpsError('failed-precondition', 'Restaurant invalide.');
      }

      const restaurantSnap = await tx.get(db.collection('restaurants').doc(restaurantId));
      if (!restaurantSnap.exists) {
        throw new HttpsError('not-found', 'Restaurant introuvable.');
      }

      const restaurant = restaurantSnap.data()!;
      if (restaurant.ownerId !== uid) {
        throw new HttpsError('permission-denied', 'Non autorisé.');
      }

      const currentStatus = String(order.status ?? '');
      if (!allowedTransitions[currentStatus]?.includes(status)) {
        throw new HttpsError('failed-precondition', 'Transition de statut non autorisée.');
      }

      if (status === 'accepted' && order.paymentValidated !== true) {
        throw new HttpsError('failed-precondition', 'Le paiement doit être validé avant acceptation.');
      }

      if (status === 'cancelled_by_restaurant' && !cancellationReason && currentStatus === 'pending') {
        throw new HttpsError('invalid-argument', 'Raison requise pour refuser une commande.');
      }

      const updateData: Record<string, unknown> = {
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (status === 'cancelled_by_restaurant') {
        updateData.cancelledAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.cancelledBy = 'restaurant';
        if (cancellationReason) updateData.cancellationReason = cancellationReason;
      }

      tx.update(orderRef, updateData);
      tx.set(db.collection('audit_logs').doc(), {
        type: 'restaurant_food_order_status_change',
        orderId,
        restaurantId,
        actorUid: uid,
        fromStatus: currentStatus,
        toStatus: status,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true, orderId, status };
  },
);
