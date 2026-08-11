import * as admin from 'firebase-admin';
import type Stripe from 'stripe';
import { calculateFoodSettlement, resolveRestaurantCommissionRate } from '../food/foodSettlement.js';

type StripeClient = InstanceType<typeof Stripe>;

const CURRENCY = 'cad';
const SETTLEMENT_VERSION = 'food_split_v1';

function getDb(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function asAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function asOptionalRate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

async function getSourceChargeId(
  stripe: StripeClient,
  order: FirebaseFirestore.DocumentData,
): Promise<{ chargeId?: string; isLegacyDestinationCharge: boolean }> {
  if (order.paymentMethod !== 'card' || typeof order.stripePaymentIntentId !== 'string') {
    return { isLegacyDestinationCharge: false };
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
  const metadata = paymentIntent.metadata ?? {};
  const transferData = paymentIntent.transfer_data;

  if (metadata.settlementVersion !== SETTLEMENT_VERSION) {
    return {
      isLegacyDestinationCharge: Boolean(transferData?.destination),
    };
  }

  const latestCharge = paymentIntent.latest_charge;
  return {
    chargeId: typeof latestCharge === 'string' ? latestCharge : latestCharge?.id,
    isLegacyDestinationCharge: false,
  };
}

export async function settleRestaurantForFoodOrder(
  orderId: string,
  order: FirebaseFirestore.DocumentData,
  stripe: StripeClient,
): Promise<void> {
  const db = getDb();
  const settlementRef = db.collection('food_order_settlements').doc(orderId);
  const restaurantRef = db.collection('restaurants').doc(String(order.restaurantId));
  const [restaurantSnap, existingSettlementSnap] = await Promise.all([
    restaurantRef.get(),
    settlementRef.get(),
  ]);

  if (!restaurantSnap.exists) throw new Error(`Restaurant introuvable pour la commande ${orderId}`);
  const restaurant = restaurantSnap.data()!;
  const settlement = calculateFoodSettlement({
    basePrice: asAmount(order.basePrice),
    deliveryCost: asAmount(order.deliveryCost),
    commissionRate: asOptionalRate(order.commissionRate ?? restaurant.commissionRate),
  });

  if (existingSettlementSnap.exists && existingSettlementSnap.data()?.restaurantStatus === 'succeeded') {
    return;
  }

  const source = await getSourceChargeId(stripe, order);
  if (source.isLegacyDestinationCharge) {
    await settlementRef.set({
      orderId,
      paymentMethod: order.paymentMethod ?? 'card',
      settlementVersion: 'legacy_destination_charge',
      restaurantStatus: 'legacy_destination',
      driverStatus: 'pending_delivery',
      restaurantTransferId: null,
      ...settlement,
      commissionRate: resolveRestaurantCommissionRate(order.commissionRate ?? restaurant.commissionRate),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return;
  }

  await settlementRef.set({
    orderId,
    paymentMethod: order.paymentMethod ?? 'wallet',
    settlementVersion: SETTLEMENT_VERSION,
    restaurantStatus: existingSettlementSnap.data()?.restaurantStatus ?? 'pending',
    driverStatus: existingSettlementSnap.data()?.driverStatus ?? 'pending_delivery',
    ...settlement,
    commissionRate: resolveRestaurantCommissionRate(order.commissionRate ?? restaurant.commissionRate),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  if (settlement.restaurantNetCents === 0) {
    await settlementRef.update({
      restaurantStatus: 'succeeded',
      restaurantTransferId: null,
      restaurantSettledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  const stripeAccountId = restaurant.stripeAccountId;
  if (typeof stripeAccountId !== 'string' || !stripeAccountId.startsWith('acct_')) {
    await settlementRef.update({
      restaurantStatus: 'failed',
      error: 'Compte Stripe du restaurant indisponible.',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  try {
    await settlementRef.update({
      restaurantStatus: 'processing',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const transfer = await stripe.transfers.create({
      amount: settlement.restaurantNetCents,
      currency: CURRENCY,
      destination: stripeAccountId,
      ...(source.chargeId ? { source_transaction: source.chargeId } : {}),
      transfer_group: orderId,
      description: `Part restaurant commande repas #${orderId}`,
      metadata: {
        purpose: 'food_order_restaurant_earning',
        orderId,
        restaurantId: String(order.restaurantId),
        settlementVersion: SETTLEMENT_VERSION,
      },
    }, { idempotencyKey: `food_restaurant_transfer_${orderId}` });

    await settlementRef.update({
      restaurantStatus: 'succeeded',
      restaurantTransferId: transfer.id,
      restaurantSettledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('food_orders').doc(orderId).update({
      restaurantSettlementStatus: 'succeeded',
      restaurantTransferId: transfer.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    await settlementRef.update({
      restaurantStatus: 'failed',
      error: error instanceof Error ? error.message : String(error),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw error;
  }
}

export async function reverseRestaurantFoodOrderTransfer(
  orderId: string,
  stripe: StripeClient,
): Promise<void> {
  const db = getDb();
  const settlementRef = db.collection('food_order_settlements').doc(orderId);
  const settlementSnap = await settlementRef.get();
  if (!settlementSnap.exists) return;

  const settlement = settlementSnap.data()!;
  if (settlement.restaurantStatus !== 'succeeded' || !settlement.restaurantTransferId) return;
  if (settlement.restaurantReversalStatus === 'succeeded') return;

  await stripe.transfers.createReversal(settlement.restaurantTransferId, {
    metadata: { purpose: 'food_order_restaurant_refund', orderId },
  }, { idempotencyKey: `food_restaurant_reversal_${orderId}` });

  await settlementRef.update({
    restaurantReversalStatus: 'succeeded',
    restaurantReversedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
