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
      await setDoc(doc(db, 'food_orders', orderId), {
        userId: clientId,
        restaurantId,
        driverId,
        status,
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

    await assertSucceeds(setDoc(doc(db, 'restaurant_reviews', 'review-delivered'), {
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

    await assertSucceeds(setDoc(doc(db, 'delivery_reviews', 'delivery-review'), {
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
});
