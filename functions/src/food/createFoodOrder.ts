import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { CreateFoodOrderRequestSchema } from '../validators/schemas.js';
import { enforceRateLimit } from '../utils/rateLimiter.js';
import {
  calculateRoadDistanceKm,
  calculateVerifiedFoodOrderTotals,
  type VerifiedMenuItem,
} from './foodOrderPricing.js';

const googleMapsApiKey = defineSecret('GOOGLE_MAPS_API_KEY');

const MAX_LOCATION_PARAM_LEN = 500;

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function generatePickupCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return code;
}

function formatLocationParam(value: string | { lat: number; lng: number }): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_LOCATION_PARAM_LEN) {
      throw new HttpsError('invalid-argument', 'Adresse de livraison invalide.');
    }
    return trimmed;
  }
  return `${value.lat},${value.lng}`;
}

async function calculateServerDistanceKm(
  origin: string | { lat: number; lng: number },
  destination: string | { lat: number; lng: number },
): Promise<number> {
  const apiKey = googleMapsApiKey.value();
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'Calcul de distance serveur non configuré.');
  }

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', formatLocationParam(origin));
  url.searchParams.set('destinations', formatLocationParam(destination));
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('language', 'fr');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString());
  const data = await res.json();
  const elem = data?.rows?.[0]?.elements?.[0];
  if (data.status !== 'OK' || !elem || elem.status !== 'OK') {
    throw new HttpsError('failed-precondition', 'Distance de livraison indisponible.');
  }

  return elem.distance.value / 1000;
}

export const createFoodOrder = onCall(
  { region: 'europe-west1', secrets: [googleMapsApiKey] },
  async (request: CallableRequest<unknown>) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    const parsed = CreateFoodOrderRequestSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', 'Données de commande invalides.', parsed.error.format());
    }

    await enforceRateLimit({
      identifier: uid,
      bucket: 'food:createOrder',
      limit: 20,
      windowSec: 60,
    });

    const payload = parsed.data;
    const db = getDb();
    const restaurantRef = db.collection('restaurants').doc(payload.restaurantId);
    const userRef = db.collection('users').doc(uid);
    const orderRef = db.collection('food_orders').doc();

    const [restaurantSnap, userSnap] = await Promise.all([
      restaurantRef.get(),
      userRef.get(),
    ]);

    if (!restaurantSnap.exists) {
      throw new HttpsError('not-found', 'Restaurant introuvable.');
    }
    if (!userSnap.exists) {
      throw new HttpsError('failed-precondition', 'Document utilisateur introuvable.');
    }

    const restaurant = restaurantSnap.data()!;
    if (restaurant.status !== 'approved' || restaurant.stripeConnectStatus !== 'active' || restaurant.isOpen === false) {
      throw new HttpsError('failed-precondition', 'Ce restaurant n\'est pas disponible actuellement.');
    }

    const restaurantLocation = restaurant.location;
    if (
      !restaurantLocation ||
      typeof restaurantLocation.lat !== 'number' ||
      typeof restaurantLocation.lng !== 'number'
    ) {
      throw new HttpsError('failed-precondition', 'Coordonnées du restaurant indisponibles.');
    }

    const menuItems = new Map<string, VerifiedMenuItem>();
    for (const item of payload.orderItems) {
      const itemSnap = await restaurantRef.collection('menu_items').doc(item.menuItemId).get();
      if (itemSnap.exists) {
        const data = itemSnap.data()!;
        menuItems.set(item.menuItemId, {
          name: data.name,
          price: data.price,
          isAvailable: data.isAvailable === true,
        });
      }
    }

    const serverDistanceKm = await calculateServerDistanceKm(
      restaurantLocation,
      payload.deliveryLocation ?? payload.deliveryAddress,
    );
    const deliveryDistance = calculateRoadDistanceKm({
      serverDistanceKm,
    });

    const totals = calculateVerifiedFoodOrderTotals(
      {
        orderItems: payload.orderItems,
        deliveryDistance,
        isWeekend: payload.isWeekend,
      },
      menuItems,
    );

    const user = userSnap.data()!;
    const customerName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.displayName || '';
    const customerPhone = payload.customerPhone ?? user.phone ?? user.phoneNumber ?? '';

    const order: Record<string, unknown> = {
      id: orderRef.id,
      userId: uid,
      restaurantId: payload.restaurantId,
      restaurantOwnerId: restaurant.ownerId,
      orderItems: totals.orderItems,
      deliveryDistance,
      isWeekend: payload.isWeekend,
      deliveryAddress: payload.deliveryAddress,
      basePrice: totals.basePrice,
      deliveryCost: totals.deliveryCost,
      totalOrderPrice: totals.totalOrderPrice,
      status: 'pending_payment',
      pickupCode: generatePickupCode(),
      paymentValidated: false,
      paymentMethod: payload.paymentMethod ?? 'wallet',
      restaurantName: restaurant.name,
      restaurantPhone: restaurant.phone || '',
      restaurantAddress: {
        address: restaurant.address || '',
        lat: restaurantLocation.lat,
        lng: restaurantLocation.lng,
      },
      deliveryPreference: payload.deliveryPreference ?? 'leave_at_door',
      customerName,
      customerPhone,
      clientNeighbourhood: payload.clientNeighbourhood ?? '',
      cityId: payload.cityId ?? restaurant.cityId ?? 'edmonton',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (payload.deliveryLocation) order.deliveryLocation = payload.deliveryLocation;
    if (restaurant.imageUrl) order.restaurantImage = restaurant.imageUrl;
    if (payload.deliveryInstructions) order.deliveryInstructions = payload.deliveryInstructions;

    await orderRef.create(order);

    return {
      orderId: orderRef.id,
      basePrice: totals.basePrice,
      deliveryCost: totals.deliveryCost,
      totalOrderPrice: totals.totalOrderPrice,
      deliveryDistance,
    };
  },
);
