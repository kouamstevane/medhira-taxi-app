import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { DELIVERY_SHARE_RATE } from '../config/stripe.js';
import { selectNearestDriver, type DriverCandidate } from '../utils/matching.js';
import {
  buildAssignedFoodDeliveryOrderData,
  canRetryDeliveryAssignment,
  getDeliveryOrderCancellationAfterRefusal,
  getFoodOrderStatusForDeliveryStatus,
  getNextDeliveryAssignmentAttempt,
  getStalePendingPaymentCancellationUpdate,
  isFoodOrderAssignableToDriver,
  isFoodOrderPaymentExpired,
  shouldSkipStaleDeliveryAssignment,
} from './foodDeliveryLifecycle.js';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

type OAuth2Client = import('google-auth-library').OAuth2Client;

type CloudTasksClientLike = {
  queuePath(project: string, location: string, queue: string): string;
  createTask(request: Record<string, unknown>): Promise<unknown>;
};

let _cloudTasksClient: CloudTasksClientLike | null = null;
async function getCloudTasksClient(): Promise<CloudTasksClientLike> {
  if (!_cloudTasksClient) {
    const { CloudTasksClient } = await import('@google-cloud/tasks');
    _cloudTasksClient = new CloudTasksClient();
  }
  return _cloudTasksClient;
}

let _oauthClient: OAuth2Client | null = null;
async function getOAuthClient() {
  if (!_oauthClient) {
    const { OAuth2Client } = await import('google-auth-library');
    _oauthClient = new OAuth2Client();
  }
  return _oauthClient;
}

async function getRtdb() {
  const { getDatabase } = await import('firebase-admin/database');
  return getDatabase();
}

async function setActiveDeliveryOrderClaim(uid: string | undefined | null, orderId: string | null): Promise<void> {
  if (!uid) return;
  try {
    const user = await admin.auth().getUser(uid);
    await admin.auth().setCustomUserClaims(uid, {
      ...(user.customClaims ?? {}),
      activeDeliveryOrderId: orderId,
    });
  } catch (err) {
    console.warn('[setActiveDeliveryOrderClaim] Failed to update claims', { uid, orderId, err });
  }
}

async function setDeliveryTrackingAccess(
  orderId: string,
  driverId: string,
  participantIds: Array<string | undefined | null>,
): Promise<void> {
  const participants = participantIds.reduce<Record<string, boolean>>((acc, uid) => {
    if (uid) acc[uid] = true;
    return acc;
  }, {});

  const rtdb = await getRtdb();
  await rtdb.ref(`delivery_tracking/${orderId}`).update({
    driverId,
    participants,
  });
}

async function scheduleDeliveryOrderTimeout(orderId: string, attemptNumber: number): Promise<void> {
  const cloudTasksClient = await getCloudTasksClient();
  const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!PROJECT_ID) {
    throw new Error('GCLOUD_PROJECT is required to schedule delivery order timeouts');
  }
  const LOCATION = 'europe-west1';
  const queuePath = cloudTasksClient.queuePath(PROJECT_ID, LOCATION, 'delivery-order-timeout');
  await cloudTasksClient.createTask({
    parent: queuePath,
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url: `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/onDeliveryOrderTimeout`,
        oidcToken: {
          serviceAccountEmail: `${PROJECT_ID}@appspot.gserviceaccount.com`,
        },
        body: Buffer.from(JSON.stringify({ orderId, attemptNumber })).toString('base64'),
        headers: { 'Content-Type': 'application/json' },
      },
      scheduleTime: { seconds: Math.floor(Date.now() / 1000) + 90 },
    },
  });
}

export const onFoodOrderPaymentValidated = onDocumentUpdated(
  { document: 'food_orders/{orderId}', region: 'europe-west1', secrets: [stripeSecretKey] },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after) return;

    if (before.paymentValidated || !after.paymentValidated) return;

    const orderId = event.params.orderId;
    const restaurantId = after.restaurantId;

    const restaurantRef = admin.firestore().collection('restaurants').doc(restaurantId);
    let restaurantData: FirebaseFirestore.DocumentData | undefined;
    const orderNumber = await admin.firestore().runTransaction(async (tx) => {
      const restaurantDoc = await tx.get(restaurantRef);
      restaurantData = restaurantDoc.data();
      const counter = (restaurantData?.orderCounter || 0) + 1;
      tx.update(restaurantRef, { orderCounter: counter });
      return `#${counter}`;
    });

    const deliveryPreference = after.deliveryPreference as string | undefined;
    let pinCode: string | null = null;
    if (deliveryPreference === 'meet_outside' || deliveryPreference === 'meet_at_door') {
      const crypto = await import('crypto');
      pinCode = crypto.randomInt(1000, 9999).toString();
    }

    const updates: Record<string, unknown> = {
      orderNumber,
      cityId: after.cityId || restaurantData?.cityId || 'edmonton',
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (pinCode != null) updates.pinCode = pinCode;
    if (!after.restaurantAddress && restaurantData) {
      const lat = restaurantData.location?.lat;
      const lng = restaurantData.location?.lng;
      if (lat == null || lng == null) {
        console.warn(`[FoodOrderPaymentValidated] Restaurant ${restaurantId} sans coordonnées, commande ${orderId}`);
      }
      updates.restaurantAddress = {
        address: restaurantData.address,
        lat: lat ?? 0,
        lng: lng ?? 0,
      };
    }
    if (!after.restaurantPhone && restaurantData) {
      updates.restaurantPhone = restaurantData.phone;
    }
    if (!after.restaurantName && restaurantData) {
      updates.restaurantName = restaurantData.name;
    }

    await admin.firestore().collection('food_orders').doc(orderId).update(updates);

    const { createStripeClient } = await import('../stripe/stripe-client.js');
    const { settleRestaurantForFoodOrder } = await import('../stripe/foodOrderSettlement.js');

    await settleRestaurantForFoodOrder(
      orderId,
      { ...after, ...updates },
      createStripeClient(stripeSecretKey.value()),
    );
  }
);

export const onFoodOrderStatusChanged = onDocumentUpdated('food_orders/{orderId}', async (event) => {
  const oldData = event.data?.before.data();
  const newData = event.data?.after.data();

  if (!oldData || !newData) {
    console.log("[FoodOrderUpdate] Données manquantes, ignorance de l'événement.");
    return;
  }

  if (oldData.status === newData.status) {
    return;
  }

  const clientId = newData.userId;
  const newStatus = newData.status;
  const restaurantName = newData.restaurantName || 'Le restaurant';

  try {
    const userDoc = await admin.firestore().collection('users').doc(clientId).get();

    if (!userDoc.exists) {
      console.log(`[FoodOrderUpdate] Utilisateur ${clientId} introuvable.`);
      return;
    }

    const userData = userDoc.data();
    const fcmToken = userData?.fcmToken;

    if (!fcmToken) {
      console.log(`[FoodOrderUpdate] Pas de token FCM pour le client ${clientId}.`);
      return;
    }

    let title = 'Mise à jour de votre commande';
    let body = `Votre commande chez ${restaurantName} a été mise à jour.`;

    switch (newStatus) {
      case 'confirmed':
        title = 'Commande confirmée ! ';
        body = `${restaurantName} a accepté votre commande et va bientôt la préparer.`;
        break;
      case 'preparing':
        title = 'Préparation en cours 🍳';
        body = `Votre repas est en cours de préparation chez ${restaurantName}.`;
        break;
      case 'ready':
        title = 'Commande prête ! 🛍️';
        body = `Votre commande est prête à être récupérée par le livreur.`;
        break;
      case 'picked_up':
        title = 'En route vers vous ! 🛵';
        body = `Le livreur a récupéré votre commande et est en route !`;
        break;
      case 'delivering':
        title = 'Livraison imminente 📍';
        body = `Le livreur est presque arrivé avec votre commande.`;
        break;
      case 'delivered':
        title = 'Bon appétit ! 🍽️';
        body = `Votre commande a été livrée. N'hésitez pas à laisser un avis !`;
        break;
      case 'cancelled':
        title = 'Commande annulée ❌';
        body = `Votre commande chez ${restaurantName} a été annulée.`;
        break;
      default:
        if (newStatus === 'pending') return;
        break;
    }

    const message = {
      notification: {
        title,
        body,
      },
      data: {
        type: 'food_order_update',
        orderId: event.params.orderId,
        status: newStatus,
        click_action: 'FOOD_ORDER_UPDATE',
      },
      token: fcmToken,
    };

    const response = await admin.messaging().send(message);
    console.log(`[FoodOrderUpdate] Notification envoyée au client ${clientId} pour commande ${event.params.orderId}. ID: ${response}`);

    const { createNotification } = await import('../utils/notificationService.js');
    await createNotification({
      userId: clientId,
      title,
      body,
      type: 'food_order_update',
      metadata: { orderId: event.params.orderId, status: newStatus },
    });
  } catch (error: unknown) {
    const errorCode = (error as { code?: string })?.code;
    if (errorCode === 'messaging/invalid-registration-token' || errorCode === 'messaging/registration-token-not-registered') {
      console.log(`[FoodOrderUpdate] Token invalide pour le client ${clientId}. Nettoyage.`);
      try {
        await admin.firestore().collection('users').doc(clientId).update({ fcmToken: FieldValue.delete() });
      } catch { /* ignore */ }
    } else {
      console.error(`[FoodOrderUpdate] Erreur envoi notification:`, error);
    }
  }
});

export const onFoodOrderAccepted = onDocumentUpdated(
  { document: 'food_orders/{orderId}', region: 'europe-west1' },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after) return;

    if (before.status === 'accepted' || after.status !== 'accepted') return;

    const orderId = event.params.orderId;
    const db = admin.firestore();
    const rtdb = await getRtdb();

    const candidates = await db.collection('drivers')
      .where('cityId', '==', after.cityId || 'edmonton')
      .where('isAvailable', '==', true)
      .where('status', '==', 'approved')
      .where('driverType', 'in', ['livreur', 'les_deux'])
      .limit(20)
      .get();

    const activeCandidates = candidates.docs.filter((doc) => {
      const d = doc.data();
      if (d.driverType === 'les_deux' && d.activeMode !== 'livraison') return false;
      if (d.activeDeliveryOrderId != null) return false;
      return true;
    });

    const locationSnaps = await Promise.all(
      activeCandidates.map((doc) => rtdb.ref(`driver_locations/${doc.id}`).get())
    );
    const candidatesWithLocation = activeCandidates
      .map((doc, i) => ({
        id: doc.id,
        data: doc.data(),
        loc: locationSnaps[i].val() as { lat: number; lng: number } | null,
      }))
      .filter((c): c is { id: string; data: FirebaseFirestore.DocumentData; loc: { lat: number; lng: number } } => c.loc != null);

    if (!after.restaurantAddress || after.restaurantAddress.lat == null || after.restaurantAddress.lng == null) {
      console.warn(`[FoodOrderAccepted] Commande ${orderId} sans restaurantAddress valide, impossible d'assigner un livreur.`);
      await db.collection('food_orders').doc(orderId).update({
        status: 'no_driver_available',
        updatedAt: FieldValue.serverTimestamp(),
      });
      await setActiveDeliveryOrderClaim(after.userId, null);
      return;
    }
    let remainingCandidates = candidatesWithLocation;
    let nearest = selectNearestDriver(remainingCandidates, after.restaurantAddress);

    if (!nearest) {
      await db.collection('food_orders').doc(orderId).update({
        status: 'no_driver_available',
        updatedAt: FieldValue.serverTimestamp(),
      });
      await setActiveDeliveryOrderClaim(after.userId, null);
      return;
    }

    let assignedCandidate: DriverCandidate | null = null;
    while (nearest && !assignedCandidate) {
      const candidate = nearest;
      const result = await db.runTransaction(async (transaction): Promise<'assigned' | 'retry' | 'stale'> => {
        const foodOrderRef = db.collection('food_orders').doc(orderId);
        const deliveryOrderRef = db.collection('food_delivery_orders').doc(orderId);
        const driverRef = db.collection('drivers').doc(candidate.id);
        const [currentOrderSnap, deliveryOrderSnap, driverSnap] = await Promise.all([
          transaction.get(foodOrderRef),
          transaction.get(deliveryOrderRef),
          transaction.get(driverRef),
        ]);
        const currentOrder = currentOrderSnap.data();
        const currentDriver = driverSnap.data();
        if (shouldSkipStaleDeliveryAssignment(currentOrder, deliveryOrderSnap.exists)) return 'stale';
        if (currentDriver?.activeDeliveryOrderId != null) {
          return 'retry';
        }

        transaction.set(deliveryOrderRef, {
          ...buildAssignedFoodDeliveryOrderData({
            orderId,
            driverId: candidate.id,
            source: {
              restaurantId: currentOrder?.restaurantId ?? after.restaurantId,
              userId: currentOrder?.userId ?? after.userId,
              cityId: currentOrder?.cityId || after.cityId || 'edmonton',
              deliveryPreference: currentOrder?.deliveryPreference ?? after.deliveryPreference ?? 'leave_at_door',
              restaurantAddress: currentOrder?.restaurantAddress ?? after.restaurantAddress,
              clientNeighbourhood: currentOrder?.clientNeighbourhood ?? after.clientNeighbourhood ?? '',
              orderItems: currentOrder?.orderItems ?? after.orderItems ?? [],
              orderNumber: currentOrder?.orderNumber ?? after.orderNumber ?? '',
              restaurantName: currentOrder?.restaurantName ?? after.restaurantName ?? '',
              restaurantPhone: currentOrder?.restaurantPhone ?? after.restaurantPhone ?? '',
              customerPhone: currentOrder?.customerPhone ?? after.customerPhone ?? '',
              totalOrderPrice: currentOrder?.totalOrderPrice ?? after.totalOrderPrice ?? 0,
              deliveryCost: currentOrder?.deliveryCost ?? after.deliveryCost ?? 0,
            },
            assignmentAttempt: 1,
            deliveryShareRate: DELIVERY_SHARE_RATE,
          }),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.update(driverRef, {
          activeDeliveryOrderId: orderId,
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.update(foodOrderRef, {
          driverId: candidate.id,
          driverName: `${candidate.data.firstName ?? ''} ${candidate.data.lastName ?? ''}`.trim() || candidate.data.displayName || 'Livreur',
          driverPhone: candidate.data.phone ?? '',
          deliveryAssignmentAttempt: 1,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return 'assigned';
      });

      if (result === 'assigned') {
        assignedCandidate = candidate;
      } else if (result === 'retry') {
        remainingCandidates = remainingCandidates.filter((c) => c.id !== nearest?.id);
        nearest = selectNearestDriver(remainingCandidates, after.restaurantAddress);
      } else {
        break;
      }
    }

    if (!assignedCandidate) {
      const orderRef = db.collection('food_orders').doc(orderId);
      await db.runTransaction(async (transaction) => {
        const currentOrderSnap = await transaction.get(orderRef);
        if (isFoodOrderAssignableToDriver(currentOrderSnap.data())) {
          transaction.update(orderRef, {
            status: 'no_driver_available',
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
      await setActiveDeliveryOrderClaim(after.userId, null);
      return;
    }

    await setDeliveryTrackingAccess(orderId, assignedCandidate.id, [assignedCandidate.id, after.userId]);

    await Promise.all([
      setActiveDeliveryOrderClaim(assignedCandidate.id, orderId),
      setActiveDeliveryOrderClaim(after.userId, orderId),
    ]);

    const driverSnap = await db.collection('drivers').doc(assignedCandidate.id).get();
    const fcmToken = driverSnap.data()?.fcmToken;
    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: 'Nouvelle commande',
          body: `${after.restaurantName ?? 'Restaurant'} — ${after.orderNumber ?? ''}`,
        },
        data: { type: 'delivery_order_new', orderId },
      });
    }

    await scheduleDeliveryOrderTimeout(orderId, 1);
  }
);

async function reassignFoodDeliveryOrderAfterDriverRefusal(
  orderId: string,
  deliveryOrder: FirebaseFirestore.DocumentData,
): Promise<void> {
  const db = admin.firestore();
  const rtdb = await getRtdb();
  const currentDriverId = deliveryOrder.driverId as string | undefined;
  const clientId = deliveryOrder.clientId as string | undefined;
  const currentAttempt = Number(deliveryOrder.assignmentAttempt ?? 1);

  if (currentDriverId) {
    await db.collection('drivers').doc(currentDriverId).update({
      activeDeliveryOrderId: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await setActiveDeliveryOrderClaim(currentDriverId, null);
  }

  const deliveryRef = db.collection('food_delivery_orders').doc(orderId);
  const foodOrderRef = db.collection('food_orders').doc(orderId);

  if (!canRetryDeliveryAssignment(currentAttempt)) {
    await db.runTransaction(async (tx) => {
      tx.update(foodOrderRef, {
        status: 'no_driver_available',
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(deliveryRef, {
        ...getDeliveryOrderCancellationAfterRefusal(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await setActiveDeliveryOrderClaim(clientId, null);
    return;
  }

  const foodOrderSnap = await foodOrderRef.get();
  if (!foodOrderSnap.exists) {
    await deliveryRef.update({
      ...getDeliveryOrderCancellationAfterRefusal(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await setActiveDeliveryOrderClaim(clientId, null);
    return;
  }
  const foodOrder = foodOrderSnap.data()!;
  if (!['accepted', 'preparing', 'ready'].includes(String(foodOrder.status))) {
    await deliveryRef.update({
      ...getDeliveryOrderCancellationAfterRefusal(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await setActiveDeliveryOrderClaim(clientId, null);
    return;
  }

  const candidates = await db.collection('drivers')
    .where('cityId', '==', foodOrder.cityId ?? deliveryOrder.cityId ?? 'edmonton')
    .where('isAvailable', '==', true)
    .where('status', '==', 'approved')
    .where('driverType', 'in', ['livreur', 'les_deux'])
    .limit(20)
    .get();

  const activeCandidates = candidates.docs.filter((doc) => {
    if (doc.id === currentDriverId) return false;
    const d = doc.data();
    if (d.driverType === 'les_deux' && d.activeMode !== 'livraison') return false;
    if (d.activeDeliveryOrderId != null) return false;
    return true;
  });

  const locationSnaps = await Promise.all(
    activeCandidates.map((doc) => rtdb.ref(`driver_locations/${doc.id}`).get()),
  );
  const candidatesWithLocation = activeCandidates
    .map((doc, i) => ({ id: doc.id, data: doc.data(), loc: locationSnaps[i].val() as { lat: number; lng: number } | null }))
    .filter((c): c is { id: string; data: FirebaseFirestore.DocumentData; loc: { lat: number; lng: number } } => c.loc != null);

  if (!foodOrder.restaurantAddress) {
    await db.runTransaction(async (tx) => {
      tx.update(foodOrderRef, {
        status: 'no_driver_available',
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(deliveryRef, {
        ...getDeliveryOrderCancellationAfterRefusal(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await setActiveDeliveryOrderClaim(clientId, null);
    return;
  }

  const nextDriver = selectNearestDriver(candidatesWithLocation, foodOrder.restaurantAddress);
  if (!nextDriver) {
    await db.runTransaction(async (tx) => {
      tx.update(foodOrderRef, {
        status: 'no_driver_available',
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(deliveryRef, {
        ...getDeliveryOrderCancellationAfterRefusal(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await setActiveDeliveryOrderClaim(clientId, null);
    return;
  }

  const nextAttempt = getNextDeliveryAssignmentAttempt(currentAttempt);
  const reassignmentResult = await db.runTransaction(async (tx): Promise<'reassigned' | 'not_reassigned'> => {
    const [latestFoodOrderSnap, latestDeliverySnap, nextDriverSnap] = await Promise.all([
      tx.get(foodOrderRef),
      tx.get(deliveryRef),
      tx.get(db.collection('drivers').doc(nextDriver.id)),
    ]);
    const latestFoodOrder = latestFoodOrderSnap.data();
    const latestDeliveryOrder = latestDeliverySnap.data();
    const latestDriver = nextDriverSnap.data();
    if (!latestFoodOrderSnap.exists || !latestDeliverySnap.exists) return 'not_reassigned';
    if (!['accepted', 'preparing', 'ready'].includes(String(latestFoodOrder?.status))) {
      tx.update(deliveryRef, {
        ...getDeliveryOrderCancellationAfterRefusal(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return 'not_reassigned';
    }
    if (latestDeliveryOrder?.status !== 'refused') return 'not_reassigned';
    if (latestDriver?.activeDeliveryOrderId != null) {
      tx.update(foodOrderRef, {
        status: 'no_driver_available',
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(deliveryRef, {
        ...getDeliveryOrderCancellationAfterRefusal(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return 'not_reassigned';
    }

    tx.update(deliveryRef, {
      driverId: nextDriver.id,
      status: 'assigned',
      assignmentAttempt: nextAttempt,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(foodOrderRef, {
      driverId: nextDriver.id,
      driverName: `${nextDriver.data.firstName ?? ''} ${nextDriver.data.lastName ?? ''}`.trim() || nextDriver.data.displayName || 'Livreur',
      driverPhone: nextDriver.data.phone ?? '',
      deliveryAssignmentAttempt: nextAttempt,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(db.collection('drivers').doc(nextDriver.id), {
      activeDeliveryOrderId: orderId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return 'reassigned';
  });

  if (reassignmentResult !== 'reassigned') {
    await setActiveDeliveryOrderClaim(clientId, null);
    return;
  }
  await setDeliveryTrackingAccess(orderId, nextDriver.id, [nextDriver.id, clientId]);
  await setActiveDeliveryOrderClaim(nextDriver.id, orderId);

  const fcmToken = typeof nextDriver.data.fcmToken === 'string' ? nextDriver.data.fcmToken : null;
  if (fcmToken) {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title: 'Nouvelle commande', body: foodOrder.orderNumber ?? '' },
      data: { type: 'delivery_order_new', orderId },
    });
  }

  await scheduleDeliveryOrderTimeout(orderId, nextAttempt);
}

export const onDeliveryStatusChanged = onDocumentUpdated(
  { document: 'food_delivery_orders/{orderId}', region: 'europe-west1' },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after || before.status === after.status) return;

    const db = admin.firestore();

    if (after.status === 'refused') {
      await reassignFoodDeliveryOrderAfterDriverRefusal(event.params.orderId, after);
      return;
    }

    const foodOrderStatus = getFoodOrderStatusForDeliveryStatus(after.status);
    if (!foodOrderStatus) return;

    await db.collection('food_orders').doc(event.params.orderId).update({
      status: foodOrderStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const sendClientNotif = async (title: string, body: string) => {
      const clientSnap = await db.collection('users').doc(after.clientId).get();
      const fcmToken = clientSnap.data()?.fcmToken;
      if (fcmToken) {
        await admin.messaging().send({
          token: fcmToken,
          notification: { title, body },
          data: { type: 'delivery_order_update', orderId: event.params.orderId },
        });
      }
    };

    if (after.status === 'picked_up') {
      await sendClientNotif('Votre commande est en route !',
        `${after.restaurantName} — votre commande a été récupérée`);
    }
    if (after.status === 'delivered') {
      await sendClientNotif('Commande livrée', 'Votre commande est arrivée — notez votre livreur');
    }
  }
);

export const onRestaurantCancelOrder = onDocumentUpdated(
  { document: 'food_orders/{orderId}', region: 'europe-west1' },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after) return;
    if (after.status !== 'cancelled_by_restaurant' || before.status === 'cancelled_by_restaurant') return;

    const db = admin.firestore();
    const deliveryOrderSnap = await db.collection('food_delivery_orders').doc(event.params.orderId).get();
    if (!deliveryOrderSnap.exists) return;

    const deliveryOrder = deliveryOrderSnap.data()!;

    if (['picked_up', 'heading_to_client', 'arrived_client', 'delivered'].includes(deliveryOrder.status)) {
      await db.collection('audit_logs').add({
        type: 'restaurant_cancel_after_pickup',
        orderId: event.params.orderId,
        driverId: deliveryOrder.driverId,
        timestamp: FieldValue.serverTimestamp(),
      });
      return;
    }

    await db.collection('food_delivery_orders').doc(event.params.orderId).update({
      status: 'cancelled',
      cancellationReason: 'restaurant_cancelled',
      cancellationImpactOnStats: false,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection('drivers').doc(deliveryOrder.driverId).update({
      activeDeliveryOrderId: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await Promise.all([
      setActiveDeliveryOrderClaim(deliveryOrder.driverId, null),
      setActiveDeliveryOrderClaim(deliveryOrder.clientId, null),
    ]);

    const driverSnap = await db.collection('drivers').doc(deliveryOrder.driverId).get();
    const fcmToken = driverSnap.data()?.fcmToken;
    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: 'Commande annulée',
          body: `Le restaurant a annulé la commande ${deliveryOrder.orderNumber}`,
        },
        data: { type: 'delivery_order_update', orderId: event.params.orderId },
      });
    }
  }
);

async function refundFoodOrderPayment(orderId: string, order: FirebaseFirestore.DocumentData): Promise<void> {
  if (order.paymentValidated !== true || order.paymentRefunded === true) return;

  const db = admin.firestore();

  if (order.paymentMethod === 'wallet') {
    const { createStripeClient } = await import('../stripe/stripe-client.js');
    const { reverseRestaurantFoodOrderTransfer } = await import('../stripe/foodOrderSettlement.js');

    await reverseRestaurantFoodOrderTransfer(
      orderId,
      createStripeClient(stripeSecretKey.value()),
    );

    const originalTransactionId = order.paymentTransactionId;
    if (!originalTransactionId) return;

    const originalRef = db.collection('transactions').doc(originalTransactionId);
    const refundRef = db.collection('transactions').doc(`refund_${originalTransactionId}`);
    const walletRef = db.collection('wallets').doc(order.userId);
    const orderRef = db.collection('food_orders').doc(orderId);

    await db.runTransaction(async (tx) => {
      const [originalSnap, refundSnap, walletSnap, orderSnap] = await Promise.all([
        tx.get(originalRef),
        tx.get(refundRef),
        tx.get(walletRef),
        tx.get(orderRef),
      ]);
      if (!originalSnap.exists || !walletSnap.exists || !orderSnap.exists) return;
      if (refundSnap.exists || orderSnap.data()?.paymentRefunded === true) return;

      const original = originalSnap.data()!;
      const amount = Math.abs(original.amount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) return;

      tx.set(refundRef, {
        id: refundRef.id,
        userId: order.userId,
        type: 'refund',
        amount,
        currency: original.currency ?? 'CAD',
        description: `Remboursement commande repas ${orderId}`,
        reference: originalTransactionId,
        foodOrderId: orderId,
        status: 'completed',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(walletRef, {
        balance: (walletSnap.data()?.balance ?? 0) + amount,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(orderRef, {
        paymentRefunded: true,
        refundTransactionId: refundRef.id,
        refundedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return;
  }

  if (order.paymentMethod === 'card' && order.stripePaymentIntentId) {
    const { createStripeClient } = await import('../stripe/stripe-client.js');
    const { reverseRestaurantFoodOrderTransfer } = await import('../stripe/foodOrderSettlement.js');

    const stripe = createStripeClient(stripeSecretKey.value());
    const settlementSnap = await db.collection('food_order_settlements').doc(orderId).get();
    const settlementVersion = settlementSnap.data()?.settlementVersion;

    if (settlementVersion === 'food_split_v1') {
      await reverseRestaurantFoodOrderTransfer(orderId, stripe);
    }

    const refund = await stripe.refunds.create(
      {
        payment_intent: order.stripePaymentIntentId,
        reason: 'requested_by_customer',
        ...(settlementVersion === 'food_split_v1'
          ? {}
          : { reverse_transfer: true, refund_application_fee: true }),
        metadata: { purpose: 'food_order_refund', orderId },
      },
      { idempotencyKey: `food_refund_${orderId}_${order.stripePaymentIntentId}` },
    );

    await db.collection('food_orders').doc(orderId).update({
      paymentRefunded: true,
      stripeRefundId: refund.id,
      refundedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

export const onFoodOrderRefundRequired = onDocumentUpdated(
  { document: 'food_orders/{orderId}', region: 'europe-west1', secrets: [stripeSecretKey] },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after || before.status === after.status) return;
    if (!['cancelled', 'cancelled_by_restaurant', 'no_driver_available'].includes(after.status)) return;
    await refundFoodOrderPayment(event.params.orderId, after);
  },
);

export const retryFailedFoodOrderSettlements = onSchedule(
  { schedule: 'every 15 minutes', region: 'europe-west1', secrets: [stripeSecretKey] },
  async () => {
    const db = admin.firestore();
    const failedSettlements = await db.collection('food_order_settlements')
      .where('restaurantStatus', 'in', ['failed', 'processing'])
      .limit(50)
      .get();

    const { createStripeClient } = await import('../stripe/stripe-client.js');
    const { settleRestaurantForFoodOrder } = await import('../stripe/foodOrderSettlement.js');

    for (const settlementDoc of failedSettlements.docs) {
      const orderId = settlementDoc.id;
      const orderSnap = await db.collection('food_orders').doc(orderId).get();
      const order = orderSnap.data();
      if (!order || order.paymentValidated !== true || order.paymentRefunded === true) continue;

      try {
        await settleRestaurantForFoodOrder(
          orderId,
          order,
          createStripeClient(stripeSecretKey.value()),
        );
      } catch (error) {
        console.error('[retryFailedFoodOrderSettlements] retry failed', {
          orderId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
);

export const cleanupAbandonedFoodPayments = onSchedule(
  { schedule: 'every 15 minutes', region: 'europe-west1' },
  async () => {
    const db = admin.firestore();
    const threshold = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 60 * 1000);
    const staleOrders = await db.collection('food_orders')
      .where('status', '==', 'pending_payment')
      .where('createdAt', '<=', threshold)
      .limit(100)
      .get();

    const batch = db.batch();
    let writeCount = 0;
    staleOrders.docs.forEach((orderDoc) => {
      const order = orderDoc.data();
      if (!isFoodOrderPaymentExpired(order)) return;
      batch.update(orderDoc.ref, {
        ...getStalePendingPaymentCancellationUpdate(),
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeCount += 1;
    });
    if (writeCount > 0) await batch.commit();
  },
);

export const onDeliveryOrderCompleted = onDocumentUpdated(
  { document: 'food_delivery_orders/{orderId}', region: 'europe-west1' },
  async (event) => {
    if (!event.data) return;
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after) return;
    if (!['delivered', 'cancelled'].includes(after.status) || before.status === after.status) return;

    const db = admin.firestore();
    const rtdb = await getRtdb();
    const orderId = event.params.orderId;
    const driverId = after.driverId;

    const driverUpdate: Record<string, unknown> = {
      activeDeliveryOrderId: null,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (after.status === 'delivered') {
      driverUpdate.deliveriesCompleted = FieldValue.increment(1);
      driverUpdate.deliveryEarnings = FieldValue.increment(after.driverEarnings ?? 0);
      driverUpdate.pendingBalanceCents = FieldValue.increment(
        Math.max(0, Math.round(Number(after.driverEarnings ?? 0) * 100)),
      );
      driverUpdate.currency = 'cad';
    }

    await db.collection('drivers').doc(driverId).update(driverUpdate);

    await Promise.all([
      setActiveDeliveryOrderClaim(driverId, null),
      setActiveDeliveryOrderClaim(after.clientId, null),
    ]);

    await rtdb.ref(`delivery_tracking/${orderId}`).remove();
  }
);

export const onDeliveryOrderTimeout = onRequest(
  { region: 'europe-west1' },
  async (req, res) => {
    const authHeader = (req.headers['authorization'] as string | undefined) ?? '';
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
      console.warn('[onDeliveryOrderTimeout] Missing bearer token');
      res.status(401).send('Missing bearer token');
      return;
    }
    const idToken = match[1];

    const region = process.env.FUNCTION_REGION ?? 'europe-west1';
    const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      console.error('[onDeliveryOrderTimeout] GCLOUD_PROJECT not defined');
      res.status(500).send('Server misconfigured');
      return;
    }
    const expectedAudience = `https://${region}-${projectId}.cloudfunctions.net/onDeliveryOrderTimeout`;
    const expectedServiceAccount = process.env.CLOUD_TASKS_SERVICE_ACCOUNT;

    try {
      const oauthClient = await getOAuthClient();
      const ticket = await oauthClient.verifyIdToken({
        idToken,
        audience: expectedAudience,
      });
      const payload = ticket.getPayload();
      if (!payload || payload.iss !== 'https://accounts.google.com') {
        console.warn('[onDeliveryOrderTimeout] Invalid issuer', { iss: payload?.iss });
        res.status(401).send('Invalid issuer');
        return;
      }
      if (expectedServiceAccount && payload.email !== expectedServiceAccount) {
        console.warn('[onDeliveryOrderTimeout] Unexpected caller service account', { email: payload.email });
        res.status(403).send('Unauthorized caller');
        return;
      }
    } catch (e) {
      console.warn('[onDeliveryOrderTimeout] OIDC token verification failed', e);
      res.status(401).send('Invalid token');
      return;
    }

    const queueName = req.headers['x-cloudtasks-queuename'] as string | undefined;
    if (queueName && queueName !== 'delivery-order-timeout') {
      console.warn('[onDeliveryOrderTimeout] Unexpected queue', { queueName });
      res.status(403).send('Unauthorized');
      return;
    }

    const { orderId, attemptNumber } = req.body as { orderId: string; attemptNumber: number };
    const db = admin.firestore();
    const rtdb = await getRtdb();

    const orderRef = db.collection('food_delivery_orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) { res.status(200).send('Order not found'); return; }

    const order = orderSnap.data()!;

    if (order.status !== 'assigned') { res.status(200).send('Already processed'); return; }

    await db.collection('drivers').doc(order.driverId).update({
      activeDeliveryOrderId: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await setActiveDeliveryOrderClaim(order.driverId, null);

    const foodOrderRef = db.collection('food_orders').doc(orderId);

    if (attemptNumber >= 3) {
      await db.runTransaction(async (tx) => {
        tx.update(foodOrderRef, {
          status: 'no_driver_available',
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(orderRef, {
          status: 'cancelled',
          cancellationReason: 'driver_cancelled',
          cancellationImpactOnStats: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      await setActiveDeliveryOrderClaim(order.clientId, null);
      res.status(200).send('No driver available after 3 attempts');
      return;
    }

    const foodOrderSnap = await foodOrderRef.get();
    if (!foodOrderSnap.exists) {
      await orderRef.update({
        status: 'cancelled',
        cancellationReason: 'food_order_missing',
        cancellationImpactOnStats: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await setActiveDeliveryOrderClaim(order.clientId, null);
      res.status(200).send('Food order not found');
      return;
    }
    const foodOrder = foodOrderSnap.data()!;
    if (!['accepted', 'preparing', 'ready'].includes(String(foodOrder.status))) {
      await orderRef.update({
        status: 'cancelled',
        cancellationReason: 'food_order_not_assignable',
        cancellationImpactOnStats: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await setActiveDeliveryOrderClaim(order.clientId, null);
      res.status(200).send('Food order not assignable');
      return;
    }

    const candidates = await db.collection('drivers')
      .where('cityId', '==', foodOrder.cityId)
      .where('isAvailable', '==', true)
      .where('status', '==', 'approved')
      .where('driverType', 'in', ['livreur', 'les_deux'])
      .limit(20)
      .get();

    const activeCandidates = candidates.docs.filter((doc) => {
      if (doc.id === order.driverId) return false;
      const d = doc.data();
      if (d.driverType === 'les_deux' && d.activeMode !== 'livraison') return false;
      if (d.activeDeliveryOrderId != null) return false;
      return true;
    });

    const locationSnaps = await Promise.all(
      activeCandidates.map((doc) => rtdb.ref(`driver_locations/${doc.id}`).get())
    );
    const candidatesWithLocation = activeCandidates
      .map((doc, i) => ({ id: doc.id, data: doc.data(), loc: locationSnaps[i].val() as { lat: number; lng: number } | null }))
      .filter((c): c is { id: string; data: FirebaseFirestore.DocumentData; loc: { lat: number; lng: number } } => c.loc != null);

    const nextDriver = selectNearestDriver(candidatesWithLocation, foodOrder.restaurantAddress);

    if (!nextDriver) {
      await db.runTransaction(async (tx) => {
        tx.update(foodOrderRef, { status: 'no_driver_available', updatedAt: FieldValue.serverTimestamp() });
        tx.update(orderRef, { status: 'cancelled', cancellationReason: 'driver_cancelled', cancellationImpactOnStats: false, updatedAt: FieldValue.serverTimestamp() });
      });
      await setActiveDeliveryOrderClaim(order.clientId, null);
      res.status(200).send('No candidate found');
      return;
    }

    const reassignmentResult = await db.runTransaction(async (tx): Promise<'reassigned' | 'not_reassigned'> => {
      const [latestOrderSnap, latestFoodOrderSnap, nextDriverSnap] = await Promise.all([
        tx.get(orderRef),
        tx.get(foodOrderRef),
        tx.get(db.collection('drivers').doc(nextDriver.id)),
      ]);
      const latestOrder = latestOrderSnap.data();
      const latestFoodOrder = latestFoodOrderSnap.data();
      const latestDriver = nextDriverSnap.data();
      if (latestOrder?.status !== 'assigned') return 'not_reassigned';
      if (!['accepted', 'preparing', 'ready'].includes(String(latestFoodOrder?.status))) {
        tx.update(orderRef, { status: 'cancelled', cancellationReason: 'food_order_not_assignable', cancellationImpactOnStats: false, updatedAt: FieldValue.serverTimestamp() });
        return 'not_reassigned';
      }
      if (latestDriver?.activeDeliveryOrderId != null) {
        tx.update(foodOrderRef, { status: 'no_driver_available', updatedAt: FieldValue.serverTimestamp() });
        tx.update(orderRef, { status: 'cancelled', cancellationReason: 'driver_cancelled', cancellationImpactOnStats: false, updatedAt: FieldValue.serverTimestamp() });
        return 'not_reassigned';
      }
      tx.update(orderRef, {
        driverId: nextDriver.id,
        status: 'assigned',
        assignmentAttempt: attemptNumber + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(foodOrderRef, {
        driverId: nextDriver.id,
        driverName: `${nextDriver.data.firstName ?? ''} ${nextDriver.data.lastName ?? ''}`.trim() || nextDriver.data.displayName || 'Livreur',
        driverPhone: nextDriver.data.phone ?? '',
        deliveryAssignmentAttempt: attemptNumber + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(db.collection('drivers').doc(nextDriver.id), { activeDeliveryOrderId: orderId, updatedAt: FieldValue.serverTimestamp() });
      return 'reassigned';
    });
    if (reassignmentResult !== 'reassigned') {
      await setActiveDeliveryOrderClaim(order.clientId, null);
      res.status(200).send('Order no longer assignable');
      return;
    }
    await setDeliveryTrackingAccess(orderId, nextDriver.id, [nextDriver.id, order.clientId]);
    await setActiveDeliveryOrderClaim(nextDriver.id, orderId);

    const driverSnap = await db.collection('drivers').doc(nextDriver.id).get();
    const fcmToken = driverSnap.data()?.fcmToken;
    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: { title: 'Nouvelle commande', body: foodOrder.orderNumber ?? '' },
        data: { type: 'delivery_order_new', orderId },
      });
    }

    await scheduleDeliveryOrderTimeout(orderId, attemptNumber + 1);

    res.status(200).send(`Reassigned to ${nextDriver.id}, attempt ${attemptNumber + 1}`);
  }
);
