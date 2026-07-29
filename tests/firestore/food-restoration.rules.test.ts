import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestContext,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Food restoration Firestore rules', () => {
  let testEnv: RulesTestEnvironment;

  const clientId = 'food-client';
  const otherClientId = 'food-other-client';
  const driverId = 'food-driver';
  const restaurantOwnerId = 'food-restaurant-owner';
  const restaurantId = 'food-restaurant';
  const orderId = 'food-order';

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'medjira-taxi-test',
      firestore: {
        rules: readFileSync(join(__dirname, '../../firestore.rules'), 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  const seedFoodOrder = async (status: string, overrides: Record<string, unknown> = {}) => {
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      const db = context.firestore();
      await setDoc(doc(db, 'restaurants', restaurantId), {
        ownerId: restaurantOwnerId,
        status: 'approved',
      });
      await setDoc(doc(db, 'food_orders', orderId), {
        userId: clientId,
        restaurantId,
        driverId,
        status,
        paymentValidated: status !== 'pending_payment',
        ...overrides,
      });
    });
  };

  const seedDeliveryOrder = async (status: string, deliveryPreference: 'meet_at_door' | 'leave_at_door') => {
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      const db = context.firestore();
      await setDoc(doc(db, 'food_delivery_orders', orderId), {
        driverId,
        clientId,
        status,
        deliveryPreference,
        clientNeighbourhood: 'Downtown',
        clientAddress: {
          address: '100 Client Street, Edmonton',
          lat: 53.55,
          lng: -113.5,
          instructions: 'Leave at the side door',
        },
        totalAmount: 25,
        driverEarnings: 6,
        updatedAt: '2026-07-28T00:00:00.000Z',
      });
    });
  };

  test('driver cannot mark a food delivery picked up directly', async () => {
    await seedDeliveryOrder('waiting', 'meet_at_door');
    const db = testEnv.authenticatedContext(driverId).firestore();

    await assertFails(updateDoc(doc(db, 'food_delivery_orders', orderId), {
      status: 'picked_up',
      pickedUpAt: '2026-07-28T00:01:00.000Z',
      updatedAt: '2026-07-28T00:01:00.000Z',
    }));
  });

  test('client cannot forge food order payment validation', async () => {
    await seedFoodOrder('pending_payment', { paymentValidated: false });
    const db = testEnv.authenticatedContext(clientId).firestore();

    await assertFails(updateDoc(doc(db, 'food_orders', orderId), {
      paymentValidated: true,
      status: 'confirmed',
      confirmedAt: '2026-07-28T00:01:00.000Z',
      updatedAt: '2026-07-28T00:01:00.000Z',
    }));
  });

  test('client cannot directly cancel an already paid food order', async () => {
    await seedFoodOrder('confirmed', { paymentValidated: true });
    const db = testEnv.authenticatedContext(clientId).firestore();

    await assertFails(updateDoc(doc(db, 'food_orders', orderId), {
      status: 'cancelled',
      paymentValidated: true,
      cancelledBy: 'client',
      cancellationReason: 'client_cancelled',
      cancelledAt: '2026-07-28T00:01:00.000Z',
      updatedAt: '2026-07-28T00:01:00.000Z',
    }));
  });

  test('client cannot create food orders directly', async () => {
    const db = testEnv.authenticatedContext(clientId).firestore();

    await assertFails(setDoc(doc(db, 'food_orders', 'client-created-order'), {
      id: 'client-created-order',
      userId: clientId,
      restaurantId,
      orderItems: [{ menuItemId: 'item-1', itemName: 'Plat', itemQuantity: 1, itemPrice: 12 }],
      deliveryDistance: 1,
      isWeekend: false,
      deliveryAddress: '123 Rue Test',
      basePrice: 12,
      deliveryCost: 1.5,
      totalOrderPrice: 13.5,
      status: 'pending_payment',
      pickupCode: 'ABC123',
      paymentValidated: false,
    }));
  });

  test('restaurant owner cannot perform food order status transitions directly', async () => {
    await seedFoodOrder('confirmed');
    const db = testEnv.authenticatedContext(restaurantOwnerId).firestore();

    await assertFails(updateDoc(doc(db, 'food_orders', orderId), {
      status: 'accepted',
      updatedAt: '2026-07-28T00:01:00.000Z',
    }));

    await seedFoodOrder('pending_payment', { paymentValidated: false });
    await assertFails(updateDoc(doc(db, 'food_orders', orderId), {
      status: 'accepted',
      updatedAt: '2026-07-28T00:02:00.000Z',
    }));

    await seedFoodOrder('confirmed');
    await assertFails(updateDoc(doc(db, 'food_orders', orderId), {
      status: 'delivered',
      updatedAt: '2026-07-28T00:03:00.000Z',
    }));
  });

  test('driver can complete leave-at-door delivery only with photo proof', async () => {
    await seedDeliveryOrder('arrived_client', 'leave_at_door');
    const db = testEnv.authenticatedContext(driverId).firestore();

    await assertFails(updateDoc(doc(db, 'food_delivery_orders', orderId), {
      status: 'delivered',
      deliveredAt: '2026-07-28T00:02:00.000Z',
      updatedAt: '2026-07-28T00:02:00.000Z',
    }));

    await assertSucceeds(updateDoc(doc(db, 'food_delivery_orders', orderId), {
      status: 'delivered',
      proofPhotoUrl: 'https://example.com/proof.jpg',
      deliveredAt: '2026-07-28T00:03:00.000Z',
      updatedAt: '2026-07-28T00:03:00.000Z',
    }));
  });

  test('driver cannot complete pin delivery directly', async () => {
    await seedDeliveryOrder('arrived_client', 'meet_at_door');
    const db = testEnv.authenticatedContext(driverId).firestore();

    await assertFails(updateDoc(doc(db, 'food_delivery_orders', orderId), {
      status: 'delivered',
      deliveredAt: '2026-07-28T00:04:00.000Z',
      updatedAt: '2026-07-28T00:04:00.000Z',
    }));
  });

  test('restaurant review requires a matching delivered food order owned by the user', async () => {
    await seedFoodOrder('confirmed');
    const db = testEnv.authenticatedContext(clientId).firestore();

    await assertFails(setDoc(doc(db, 'restaurant_reviews', 'review-before-delivery'), {
      userId: clientId,
      restaurantId,
      orderId,
      rating: 5,
    }));

    await seedFoodOrder('delivered');

    await assertSucceeds(setDoc(doc(db, 'restaurant_reviews', `${orderId}_${clientId}`), {
      userId: clientId,
      restaurantId,
      orderId,
      rating: 5,
    }));

    const otherDb = testEnv.authenticatedContext(otherClientId).firestore();
    await assertFails(setDoc(doc(otherDb, 'restaurant_reviews', 'review-other-user'), {
      userId: otherClientId,
      restaurantId,
      orderId,
      rating: 5,
    }));
  });

  test('delivery review requires a matching delivered order and driver', async () => {
    await seedFoodOrder('delivered');
    const db = testEnv.authenticatedContext(clientId).firestore();

    await assertSucceeds(setDoc(doc(db, 'delivery_reviews', `${orderId}_${driverId}_${clientId}`), {
      userId: clientId,
      driverId,
      orderId,
      rating: 5,
    }));

    await assertFails(setDoc(doc(db, 'delivery_reviews', 'delivery-review-wrong-driver'), {
      userId: clientId,
      driverId: 'another-driver',
      orderId,
      rating: 5,
    }));
  });

  test('restaurant owner cannot publish invalid menu items', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      const db = context.firestore();
      await setDoc(doc(db, 'restaurants', restaurantId), {
        ownerId: restaurantOwnerId,
        status: 'approved',
      });
    });

    const ownerDb = testEnv.authenticatedContext(restaurantOwnerId).firestore();
    const itemRef = doc(ownerDb, 'restaurants', restaurantId, 'menu_items', 'bad-price');

    await assertFails(setDoc(itemRef, {
      name: 'Pizza',
      description: 'Pizza maison',
      price: -1,
      category: 'plats',
      isAvailable: true,
    }));

    await assertSucceeds(setDoc(doc(ownerDb, 'restaurants', restaurantId, 'menu_items', 'valid-item'), {
      name: 'Pizza',
      description: 'Pizza maison',
      price: 12.5,
      category: 'plats',
      isAvailable: true,
    }));
  });

  test('restaurant owner can toggle legacy menu item availability without rewriting the full item', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      const db = context.firestore();
      await setDoc(doc(db, 'restaurants', restaurantId), {
        ownerId: restaurantOwnerId,
        status: 'approved',
      });
      await setDoc(doc(db, 'restaurants', restaurantId, 'menu_items', 'legacy-item'), {
        name: 'Ancien plat',
        isAvailable: true,
      });
    });

    const ownerDb = testEnv.authenticatedContext(restaurantOwnerId).firestore();
    await assertSucceeds(updateDoc(doc(ownerDb, 'restaurants', restaurantId, 'menu_items', 'legacy-item'), {
      isAvailable: false,
      updatedAt: '2026-07-28T00:05:00.000Z',
    }));
  });

  test('reviews are unique per order by requiring deterministic review ids', async () => {
    await seedFoodOrder('delivered');
    const db = testEnv.authenticatedContext(clientId).firestore();

    await assertFails(setDoc(doc(db, 'restaurant_reviews', 'custom-review-id'), {
      userId: clientId,
      restaurantId,
      orderId,
      rating: 5,
    }));

    await assertSucceeds(setDoc(doc(db, 'restaurant_reviews', `${orderId}_${clientId}`), {
      userId: clientId,
      restaurantId,
      orderId,
      rating: 5,
    }));

    await assertFails(setDoc(doc(db, 'restaurant_reviews', `${orderId}_${clientId}`), {
      userId: clientId,
      restaurantId,
      orderId,
      rating: 4,
    }));

    await assertFails(setDoc(doc(db, 'delivery_reviews', 'custom-delivery-review-id'), {
      userId: clientId,
      driverId,
      orderId,
      rating: 5,
    }));

    await assertSucceeds(setDoc(doc(db, 'delivery_reviews', `${orderId}_${driverId}_${clientId}`), {
      userId: clientId,
      driverId,
      orderId,
      rating: 5,
    }));
  });
});
