import { initializeTestEnvironment, RulesTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-p2-callables',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => testEnv.cleanup());
beforeEach(async () => testEnv.clearFirestore());

describe('Callable integration — submitDriverApplication', () => {
  test('after callable creates drivers/{uid}, roles.driver exists on users/{uid}', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const adminDb = admin.firestore();
      const uid = 'driver_call_1';
      const now = Timestamp.now();

      await setDoc(doc(adminDb, 'users', uid), {
        uid,
        email: 'driver@test.fr',
        emailVerified: true,
        firstName: 'Test',
        lastName: 'Driver',
        roles: { client: { enabled: true, joinedAt: now } },
        activeRole: 'client',
        createdAt: now,
        updatedAt: now,
      });

      await setDoc(doc(adminDb, 'drivers', uid), {
        uid,
        firstName: 'Test',
        lastName: 'Driver',
        email: 'driver@test.fr',
        phone: '+33600000000',
        driverType: 'chauffeur',
        vehicleType: 'voiture',
        cityId: 'edmonton',
        status: 'pending',
        isAvailable: false,
        rating: 0,
        tripsCompleted: 0,
        createdAt: now,
        updatedAt: now,
      });

      await updateDoc(doc(adminDb, 'users', uid), {
        'roles.driver': { joinedAt: now },
        activeRole: 'driver',
        lastActiveRole: 'driver',
        updatedAt: now,
      });

      const userDoc = await getDoc(doc(adminDb, 'users', uid));
      const userData = userDoc.data();
      expect(userData?.roles.driver).toBeDefined();
      expect(userData?.activeRole).toBe('driver');
      expect(userData?.roles.client.enabled).toBe(true);
    });
  });
});

describe('Callable integration — submitRestaurantApplication', () => {
  test('after callable creates restaurant, roles.restaurant exists on users/{uid}', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const adminDb = admin.firestore();
      const uid = 'resto_call_1';
      const now = Timestamp.now();
      const restaurantId = 'rest_call_1';

      await setDoc(doc(adminDb, 'users', uid), {
        uid,
        email: 'resto@test.fr',
        emailVerified: true,
        firstName: 'Test',
        lastName: 'Restaurateur',
        roles: { client: { enabled: true, joinedAt: now } },
        activeRole: 'client',
        createdAt: now,
        updatedAt: now,
      });

      await setDoc(doc(adminDb, 'restaurants', restaurantId), {
        id: restaurantId,
        ownerId: uid,
        name: 'Test Restaurant',
        description: 'A valid test restaurant description',
        address: '123 Test Street',
        phone: '+33600000000',
        email: 'resto@test.fr',
        cuisineType: ['Test'],
        avgPricePerPerson: 15,
        commissionRate: 10,
        status: 'pending_approval',
        rating: 2.5,
        totalReviews: 0,
        stripeConnectStatus: 'not_started',
        createdAt: now,
        updatedAt: now,
      });

      await updateDoc(doc(adminDb, 'users', uid), {
        'roles.restaurant': { restaurantId, joinedAt: now },
        activeRole: 'restaurant',
        lastActiveRole: 'restaurant',
        draftRestaurant: null,
        updatedAt: now,
      });

      const userDoc = await getDoc(doc(adminDb, 'users', uid));
      const userData = userDoc.data();
      expect(userData?.roles.restaurant.restaurantId).toBe(restaurantId);
      expect(userData?.activeRole).toBe('restaurant');
      expect(userData?.roles.client.enabled).toBe(true);
    });
  });

  test('after admin approve, restaurant status is approved', async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const adminDb = admin.firestore();
      const uid = 'resto_approve_1';
      const restaurantId = 'rest_approve_1';
      const now = Timestamp.now();

      await setDoc(doc(adminDb, 'restaurants', restaurantId), {
        id: restaurantId,
        ownerId: uid,
        name: 'To Approve',
        description: 'Restaurant to be approved by admin',
        address: '456 Approve St',
        phone: '+33600000000',
        email: 'approve@test.fr',
        cuisineType: ['Test'],
        avgPricePerPerson: 15,
        commissionRate: 10,
        status: 'pending_approval',
        rating: 2.5,
        totalReviews: 0,
        stripeConnectStatus: 'not_started',
        createdAt: now,
        updatedAt: now,
      });

      await updateDoc(doc(adminDb, 'restaurants', restaurantId), {
        status: 'approved',
        approvedAt: now,
        approvedBy: 'admin_uid',
        updatedAt: now,
      });

      const restoDoc = await getDoc(doc(adminDb, 'restaurants', restaurantId));
      expect(restoDoc.data()?.status).toBe('approved');
    });
  });
});
