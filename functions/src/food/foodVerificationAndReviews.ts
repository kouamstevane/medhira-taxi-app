import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { buildPickedUpClientAddress } from './foodDeliveryLifecycle.js';

export const onDriverRatingCreated = onDocumentCreated(
  { document: 'driver_ratings/{ratingId}', region: 'europe-west1' },
  async (event) => {
    const rating = event.data?.data();
    if (!rating) return;

    const db = admin.firestore();
    const driverRef = db.collection('drivers').doc(rating.driverId);

    await db.runTransaction(async (tx) => {
      const driverDoc = await tx.get(driverRef);
      const driverData = driverDoc.data();
      if (!driverData) return;

      const currentCount = driverData.ratingsCount ?? 0;
      const currentRating = driverData.rating ?? 0;
      const newCount = currentCount + 1;
      const newRating = (currentRating * currentCount + rating.score) / newCount;

      tx.update(driverRef, {
        rating: newRating,
        ratingsCount: newCount,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
);

export const onRestaurantReviewCreated = onDocumentCreated(
  { document: 'restaurant_reviews/{reviewId}', region: 'europe-west1' },
  async (event) => {
    const review = event.data?.data();
    if (!review) return;
    const rating = Number(review.rating);
    if (!review.restaurantId || !Number.isFinite(rating) || rating < 1 || rating > 5) return;

    const db = admin.firestore();
    const restaurantRef = db.collection('restaurants').doc(review.restaurantId);
    await db.runTransaction(async (tx) => {
      const restaurantSnap = await tx.get(restaurantRef);
      const restaurant = restaurantSnap.data();
      if (!restaurant) return;
      const currentCount = Number(restaurant.totalReviews ?? 0);
      const currentRating = Number(restaurant.rating ?? 0);
      const newCount = currentCount + 1;
      const newRating = (currentRating * currentCount + rating) / newCount;
      tx.update(restaurantRef, {
        rating: Math.round(newRating * 10) / 10,
        totalReviews: newCount,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
);

export const onDeliveryReviewCreated = onDocumentCreated(
  { document: 'delivery_reviews/{reviewId}', region: 'europe-west1' },
  async (event) => {
    const review = event.data?.data();
    if (!review) return;
    const rating = Number(review.rating);
    if (!review.driverId || !Number.isFinite(rating) || rating < 1 || rating > 5) return;

    const db = admin.firestore();
    const driverRef = db.collection('drivers').doc(review.driverId);
    await db.runTransaction(async (tx) => {
      const driverSnap = await tx.get(driverRef);
      const driver = driverSnap.data();
      if (!driver) return;
      const currentCount = Number(driver.ratingsCount ?? 0);
      const currentRating = Number(driver.rating ?? 0);
      const newCount = currentCount + 1;
      const newRating = (currentRating * currentCount + rating) / newCount;
      tx.update(driverRef, {
        rating: Math.round(newRating * 10) / 10,
        ratingsCount: newCount,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
);

const PIN_FAILURE_MAX_ATTEMPTS = 5;
const PIN_FAILURE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export const logPinFailure = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Vous devez être connecté.');

    const { z } = await import('zod');
    const pinFailureSchema = z.object({
      orderId: z.string().min(1),
      clientPhone: z.string().min(1),
    });
    const { orderId, clientPhone } = pinFailureSchema.parse(request.data);

    const db = admin.firestore();
    const rateLimitRef = db.collection('pin_failure_rate_limits').doc(uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(rateLimitRef);
      const data = snap.data();
      const now = Date.now();

      if (data && now < data.resetAt) {
        if (data.count >= PIN_FAILURE_MAX_ATTEMPTS) {
          throw new HttpsError('resource-exhausted', 'Trop de tentatives. Réessayez plus tard.');
        }
        tx.update(rateLimitRef, { count: FieldValue.increment(1) });
      } else {
        tx.set(rateLimitRef, { count: 1, resetAt: now + PIN_FAILURE_WINDOW_MS });
      }
    });

    await db.collection('audit_logs').add({
      type: 'delivery_pin_failed',
      orderId,
      driverId: uid,
      clientPhone,
      timestamp: FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);

export const validateDeliveryPinAndComplete = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Vous devez être connecté.');

    const { z } = await import('zod');
    const schema = z.object({
      orderId: z.string().min(1),
      pin: z.string().regex(/^\d{4}$/),
    });
    const { orderId, pin } = schema.parse(request.data);

    const db = admin.firestore();
    const deliveryRef = db.collection('food_delivery_orders').doc(orderId);
    const foodOrderRef = db.collection('food_orders').doc(orderId);

    await db.runTransaction(async (tx) => {
      const [deliverySnap, foodOrderSnap] = await Promise.all([
        tx.get(deliveryRef),
        tx.get(foodOrderRef),
      ]);
      if (!deliverySnap.exists || !foodOrderSnap.exists) {
        throw new HttpsError('not-found', 'Commande introuvable.');
      }

      const deliveryOrder = deliverySnap.data()!;
      const foodOrder = foodOrderSnap.data()!;

      if (deliveryOrder.driverId !== uid) {
        throw new HttpsError('permission-denied', 'Non autorisé.');
      }
      if (deliveryOrder.status !== 'arrived_client') {
        throw new HttpsError('failed-precondition', 'La commande doit être arrivée chez le client.');
      }
      if (!['meet_outside', 'meet_at_door'].includes(deliveryOrder.deliveryPreference)) {
        throw new HttpsError('failed-precondition', 'Cette commande ne nécessite pas de PIN.');
      }
      if (foodOrder.pinCode !== pin) {
        throw new HttpsError('permission-denied', 'Code PIN incorrect.');
      }

      tx.update(deliveryRef, {
        status: 'delivered',
        deliveredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  }
);

export const validateFoodPickupCodeAndMarkPickedUp = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Vous devez être connecté.');

    const { z } = await import('zod');
    const schema = z.object({
      orderId: z.string().min(1),
      pickupCode: z.string().trim().min(4).max(12),
    });
    const { orderId, pickupCode } = schema.parse(request.data);

    const db = admin.firestore();
    const deliveryRef = db.collection('food_delivery_orders').doc(orderId);
    const foodOrderRef = db.collection('food_orders').doc(orderId);

    await db.runTransaction(async (tx) => {
      const [deliverySnap, foodOrderSnap] = await Promise.all([
        tx.get(deliveryRef),
        tx.get(foodOrderRef),
      ]);
      if (!deliverySnap.exists || !foodOrderSnap.exists) {
        throw new HttpsError('not-found', 'Commande introuvable.');
      }

      const deliveryOrder = deliverySnap.data()!;
      const foodOrder = foodOrderSnap.data()!;
      if (deliveryOrder.driverId !== uid) {
        throw new HttpsError('permission-denied', 'Non autorisé.');
      }
      if (deliveryOrder.status !== 'waiting') {
        throw new HttpsError('failed-precondition', 'La commande doit être en attente au restaurant.');
      }
      if (String(foodOrder.pickupCode ?? '').toUpperCase() !== pickupCode.toUpperCase()) {
        throw new HttpsError('permission-denied', 'Code de récupération incorrect.');
      }

      tx.update(deliveryRef, {
        status: 'picked_up',
        clientAddress: buildPickedUpClientAddress(foodOrder),
        pickedUpAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  }
);
