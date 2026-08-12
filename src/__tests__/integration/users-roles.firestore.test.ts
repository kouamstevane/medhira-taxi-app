/**
 * Integration Tests - Users/Roles Firestore Rules
 *
 * Validates the anti-self-promotion rules on users/{uid}:
 *   CREATE: client profile OR locked professional onboarding draft
 *   UPDATE: isOwner(userId) && request.resource.data.roles == resource.data.roles
 *
 * Run via: firebase emulators:exec "npx jest src/__tests__/integration/users-roles.firestore.test.ts"
 */

import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  RulesTestContext,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Users/Roles Firestore Rules', () => {
  let testEnv: RulesTestEnvironment;

  const aliceId = 'alice-roles-test';
  const bobId = 'bob-roles-test';

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'medjira-taxi-test',
      firestore: {
        rules: readFileSync(join(__dirname, '../../../firestore.rules'), 'utf8'),
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

  const setupUser = async (uid: string, roles: Record<string, unknown>) => {
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', uid), {
        uid,
        roles,
        activeRole: 'client',
        emailVerified: true,
        createdAt: new Date().toISOString(),
      });
    });
  };

  test('AUTHORIZED: Create users/{uid} with roles.client only', async () => {
    const aliceDb = testEnv.authenticatedContext(aliceId).firestore();

    await assertSucceeds(
      setDoc(doc(aliceDb, 'users', aliceId), {
        uid: aliceId,
        roles: {
          client: { enabled: true, joinedAt: Timestamp.fromDate(new Date()) },
        },
        activeRole: 'client',
        emailVerified: true,
        email: 'alice@example.com',
        createdAt: new Date().toISOString(),
      }),
    );
  });

  test('AUTHORIZED: Create users/{uid} as locked driver onboarding draft', async () => {
    const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
    const now = Timestamp.fromDate(new Date());

    await assertSucceeds(
      setDoc(doc(aliceDb, 'users', aliceId), {
        uid: aliceId,
        roles: {},
        activeRole: 'driver_onboarding',
        accountState: 'driver_onboarding',
        onboarding: {
          driver: {
            status: 'draft',
            currentStep: 1,
            startedAt: now,
            updatedAt: now,
          },
        },
        emailVerified: false,
        email: 'alice@example.com',
        createdAt: new Date().toISOString(),
      }),
    );
  });

  test('AUTHORIZED: Create users/{uid} as locked restaurant onboarding draft', async () => {
    const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
    const now = Timestamp.fromDate(new Date());

    await assertSucceeds(
      setDoc(doc(aliceDb, 'users', aliceId), {
        uid: aliceId,
        roles: {},
        activeRole: 'restaurant_onboarding',
        accountState: 'restaurant_onboarding',
        onboarding: {
          restaurant: {
            status: 'draft',
            currentStep: 2,
            startedAt: now,
            updatedAt: now,
          },
        },
        emailVerified: false,
        email: 'alice@example.com',
        createdAt: new Date().toISOString(),
      }),
    );
  });

  test('REJECTED: Owner cannot promote emailVerified from a restaurant onboarding draft', async () => {
    const aliceDb = testEnv.authenticatedContext(aliceId, {
      email_verified: false,
    }).firestore();
    const now = Timestamp.fromDate(new Date());

    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      await setDoc(doc(context.firestore(), 'users', aliceId), {
        uid: aliceId,
        roles: {},
        activeRole: 'restaurant_onboarding',
        accountState: 'restaurant_onboarding',
        onboarding: { restaurant: { status: 'draft', currentStep: 2, updatedAt: now } },
        emailVerified: false,
      });
    });

    await assertFails(updateDoc(doc(aliceDb, 'users', aliceId), { emailVerified: true }));
  });

  test('REJECTED: Create users/{uid} with roles.driver at init (anti self-promotion)', async () => {
    const aliceDb = testEnv.authenticatedContext(aliceId).firestore();

    await assertFails(
      setDoc(doc(aliceDb, 'users', aliceId), {
        uid: aliceId,
        roles: {
          client: { enabled: true, joinedAt: Timestamp.fromDate(new Date()) },
          driver: { joinedAt: Timestamp.fromDate(new Date()) },
        },
        activeRole: 'client',
        emailVerified: true,
        email: 'alice@example.com',
        createdAt: new Date().toISOString(),
      }),
    );
  });

  test('REJECTED: Create users/{uid} with roles.restaurant at init', async () => {
    const aliceDb = testEnv.authenticatedContext(aliceId).firestore();

    await assertFails(
      setDoc(doc(aliceDb, 'users', aliceId), {
        uid: aliceId,
        roles: {
          client: { enabled: true, joinedAt: Timestamp.fromDate(new Date()) },
          restaurant: { joinedAt: Timestamp.fromDate(new Date()) },
        },
        activeRole: 'client',
        emailVerified: true,
        email: 'alice@example.com',
        createdAt: new Date().toISOString(),
      }),
    );
  });

  test('REJECTED: Client cannot mutate roles after create', async () => {
    const clientRoles = {
      client: { enabled: true, joinedAt: Timestamp.fromDate(new Date()) },
    };
    await setupUser(aliceId, clientRoles);

    const aliceDb = testEnv.authenticatedContext(aliceId).firestore();

    await assertFails(
      updateDoc(doc(aliceDb, 'users', aliceId), {
        roles: {
          client: { enabled: true, joinedAt: Timestamp.fromDate(new Date()) },
          driver: { joinedAt: Timestamp.fromDate(new Date()) },
        },
      }),
    );
  });

  describe('Anti self-promotion §10.2', () => {
    test('REJECTED: user cannot create users/{uid} with roles.driver', async () => {
      const ctx = testEnv.authenticatedContext('mallory');
      const db = ctx.firestore();

      await assertFails(setDoc(doc(db, 'users', 'mallory'), {
        uid: 'mallory',
        email: 'mallory@test.fr',
        emailVerified: true,
        firstName: 'Mallory',
        lastName: 'Attacker',
        roles: {
          client: { enabled: true, joinedAt: Timestamp.now() },
          driver: { joinedAt: Timestamp.now() },
        },
        activeRole: 'driver',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }));
    });

    test('REJECTED: user cannot create users/{uid} with roles.restaurant', async () => {
      const ctx = testEnv.authenticatedContext('sybil');
      const db = ctx.firestore();

      await assertFails(setDoc(doc(db, 'users', 'sybil'), {
        uid: 'sybil',
        email: 'sybil@test.fr',
        emailVerified: true,
        firstName: 'Sybil',
        lastName: 'Attacker',
        roles: {
          client: { enabled: true, joinedAt: Timestamp.now() },
          restaurant: { restaurantId: 'rest_fake', joinedAt: Timestamp.now() },
        },
        activeRole: 'restaurant',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }));
    });

    test('REJECTED: owner cannot add roles.driver after create', async () => {
      const ctx = testEnv.authenticatedContext('eve');
      const db = ctx.firestore();

      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        await setDoc(doc(context.firestore(), 'users', 'eve'), {
          uid: 'eve',
          email: 'eve@test.fr',
          emailVerified: true,
          firstName: 'Eve',
          lastName: 'Test',
          roles: { client: { enabled: true, joinedAt: Timestamp.now() } },
          activeRole: 'client',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });

      await assertFails(updateDoc(doc(db, 'users', 'eve'), {
        'roles.driver': { joinedAt: Timestamp.now() },
      }));
    });

    test('REJECTED: owner cannot add roles.restaurant after create', async () => {
      const ctx = testEnv.authenticatedContext('frank');
      const db = ctx.firestore();

      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        await setDoc(doc(context.firestore(), 'users', 'frank'), {
          uid: 'frank',
          email: 'frank@test.fr',
          emailVerified: true,
          firstName: 'Frank',
          lastName: 'Test',
          roles: { client: { enabled: true, joinedAt: Timestamp.now() } },
          activeRole: 'client',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });

      await assertFails(updateDoc(doc(db, 'users', 'frank'), {
        'roles.restaurant': { restaurantId: 'r1', joinedAt: Timestamp.now() },
      }));
    });

    test('REJECTED: client SDK cannot add missing roles.client automatically', async () => {
      const ctx = testEnv.authenticatedContext('grace');
      const db = ctx.firestore();

      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        await setDoc(doc(context.firestore(), 'users', 'grace'), {
          uid: 'grace',
          email: 'grace@test.fr',
          emailVerified: true,
          firstName: 'Grace',
          lastName: 'Test',
          roles: {},
          activeRole: 'client',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });

      await assertFails(updateDoc(doc(db, 'users', 'grace'), {
        roles: { client: { enabled: true, joinedAt: Timestamp.now() } },
      }));
    });

    test('REJECTED: auto-réparation cannot also add roles.driver', async () => {
      const ctx = testEnv.authenticatedContext('heidi');
      const db = ctx.firestore();

      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        await setDoc(doc(context.firestore(), 'users', 'heidi'), {
          uid: 'heidi',
          email: 'heidi@test.fr',
          emailVerified: true,
          firstName: 'Heidi',
          lastName: 'Test',
          roles: {},
          activeRole: 'client',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });

      await assertFails(updateDoc(doc(db, 'users', 'heidi'), {
        roles: {
          client: { enabled: true, joinedAt: Timestamp.now() },
          driver: { joinedAt: Timestamp.now() },
        },
      }));
    });

    test('REJECTED: suspended driver cannot be selected as activeRole', async () => {
      const uid = 'suspended-driver';
      await setupUser(uid, {
        client: { enabled: true, joinedAt: Timestamp.now() },
        driver: { joinedAt: Timestamp.now() },
      });

      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        await setDoc(doc(context.firestore(), 'drivers', uid), { status: 'suspended' });
      });

      const db = testEnv.authenticatedContext(uid).firestore();
      await assertFails(updateDoc(doc(db, 'users', uid), {
        activeRole: 'driver',
        lastActiveRole: 'driver',
      }));
    });

    test('AUTHORIZED: non-suspended driver can be selected as activeRole', async () => {
      const uid = 'pending-driver';
      await setupUser(uid, {
        client: { enabled: true, joinedAt: Timestamp.now() },
        driver: { joinedAt: Timestamp.now() },
      });

      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        await setDoc(doc(context.firestore(), 'drivers', uid), { status: 'pending' });
      });

      const db = testEnv.authenticatedContext(uid).firestore();
      await assertSucceeds(updateDoc(doc(db, 'users', uid), {
        activeRole: 'driver',
        lastActiveRole: 'driver',
      }));
    });

    test('REJECTED: suspended restaurant cannot be selected as activeRole', async () => {
      const uid = 'suspended-restaurant';
      const restaurantId = 'restaurant-suspended';
      await setupUser(uid, {
        client: { enabled: true, joinedAt: Timestamp.now() },
        restaurant: { restaurantId, joinedAt: Timestamp.now() },
      });

      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        await setDoc(doc(context.firestore(), 'restaurants', restaurantId), {
          ownerId: uid,
          status: 'suspended',
        });
      });

      const db = testEnv.authenticatedContext(uid).firestore();
      await assertFails(updateDoc(doc(db, 'users', uid), {
        activeRole: 'restaurant',
        lastActiveRole: 'restaurant',
      }));
    });
  });

  describe('Restaurants security §10.2', () => {
    test('REJECTED: client cannot create restaurant directly', async () => {
      const ctx = testEnv.authenticatedContext('alice');
      const db = ctx.firestore();

      await assertFails(setDoc(doc(db, 'restaurants', 'rest_abc'), {
        id: 'rest_abc',
        ownerId: 'alice',
        name: 'Fake Restaurant',
        description: 'Should not work',
        address: '123 Rue Fake',
        phone: '+33600000000',
        email: 'fake@test.fr',
        cuisineType: ['Fake'],
        avgPricePerPerson: 10,
        commissionRate: 15,
        status: 'pending_approval',
        rating: 2.5,
        totalReviews: 0,
        stripeConnectStatus: 'not_started',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }));
    });

    test('REJECTED: owner cannot change restaurant status', async () => {
      const ctx = testEnv.authenticatedContext('alice');
      const db = ctx.firestore();

      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        await setDoc(doc(context.firestore(), 'restaurants', 'rest_owned'), {
          id: 'rest_owned',
          ownerId: 'alice',
          name: 'Alice Restaurant',
          description: 'A valid restaurant with enough characters',
          address: '123 Rue Alice',
          phone: '+33600000000',
          email: 'alice@test.fr',
          cuisineType: ['Française'],
          avgPricePerPerson: 15,
          commissionRate: 10,
          status: 'pending_approval',
          rating: 2.5,
          totalReviews: 0,
          stripeConnectStatus: 'not_started',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });

      await assertFails(updateDoc(doc(db, 'restaurants', 'rest_owned'), {
        status: 'approved',
      }));
    });

    test('REJECTED: owner cannot change stripeConnectStatus', async () => {
      const ctx = testEnv.authenticatedContext('alice');
      const db = ctx.firestore();

      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        await setDoc(doc(context.firestore(), 'restaurants', 'rest_stripe'), {
          id: 'rest_stripe',
          ownerId: 'alice',
          name: 'Stripe Restaurant',
          description: 'Testing stripe immutability with enough characters',
          address: '123 Rue Stripe',
          phone: '+33600000000',
          email: 'stripe@test.fr',
          cuisineType: ['Test'],
          avgPricePerPerson: 20,
          commissionRate: 10,
          status: 'approved',
          rating: 2.5,
          totalReviews: 0,
          stripeConnectStatus: 'not_started',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });

      await assertFails(updateDoc(doc(db, 'restaurants', 'rest_stripe'), {
        stripeConnectStatus: 'active',
      }));
    });
  });

  describe('Drivers security §10.2', () => {
    test('REJECTED: client cannot create driver document directly', async () => {
      const ctx = testEnv.authenticatedContext('alice');
      const db = ctx.firestore();

      await assertFails(setDoc(doc(db, 'drivers', 'alice'), {
        uid: 'alice',
        firstName: 'Alice',
        lastName: 'Test',
        email: 'alice@test.fr',
        phone: '+33600000000',
        driverType: 'chauffeur',
        vehicleType: 'voiture',
        cityId: 'edmonton',
        status: 'pending',
        isAvailable: false,
        rating: 0,
        tripsCompleted: 0,
        car: { year: 2020, brand: 'Toyota', model: 'Camry' },
      }));
    });

    test('REJECTED: owner cannot promote driver status to approved', async () => {
      const ctx = testEnv.authenticatedContext('bob');
      const db = ctx.firestore();

      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        await setDoc(doc(context.firestore(), 'drivers', 'bob'), {
          uid: 'bob',
          firstName: 'Bob',
          lastName: 'Driver',
          email: 'bob@test.fr',
          phone: '+33600000000',
          driverType: 'chauffeur',
          vehicleType: 'voiture',
          cityId: 'edmonton',
          status: 'pending',
          isAvailable: false,
          rating: 0,
          tripsCompleted: 0,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });

      await assertFails(updateDoc(doc(db, 'drivers', 'bob'), {
        status: 'approved',
      }));
    });
  });

  describe('Regression coverage for sensitive collections', () => {
    test('REJECTED: an authenticated user cannot read another user document', async () => {
      await setupUser(bobId, { client: { enabled: true, joinedAt: Timestamp.now() } });

      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();

      await assertFails(getDoc(doc(aliceDb, 'users', bobId)));
    });

    test('AUTHORIZED: a client can refresh its own FCM token', async () => {
      await setupUser(aliceId, { client: { enabled: true, joinedAt: Timestamp.now() } });

      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();

      await assertSucceeds(updateDoc(doc(aliceDb, 'users', aliceId), {
        fcmToken: 'token-for-tests',
        tokenUpdatedAt: Timestamp.now(),
      }));
    });

    test('REJECTED: a pending booking is not readable by a non-driver', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        await setDoc(doc(context.firestore(), 'bookings', 'pending-booking'), {
          userId: bobId,
          status: 'pending',
          price: 10,
        });
      });

      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();

      await assertFails(getDoc(doc(aliceDb, 'bookings', 'pending-booking')));
    });

    test('REJECTED: a client cannot update a wallet balance', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        await setDoc(doc(context.firestore(), 'wallets', aliceId), {
          balance: 100,
          currency: 'EUR',
        });
      });

      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();

      await assertFails(updateDoc(doc(aliceDb, 'wallets', aliceId), { balance: 99999 }));
    });

    test('REJECTED: a client cannot create a financial transaction directly', async () => {
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();

      await assertFails(setDoc(doc(aliceDb, 'transactions', 'fake-transaction'), {
        userId: aliceId,
        amount: 99999,
        type: 'credit',
      }));
    });

    test('REJECTED: a booking participant cannot delete active tracking data', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        await setDoc(doc(context.firestore(), 'active_bookings', 'active-booking'), {
          userId: aliceId,
          driverId: bobId,
          bookingId: 'booking-1',
        });
      });

      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();

      await assertFails(deleteDoc(doc(aliceDb, 'active_bookings', 'active-booking')));
    });

    test('REJECTED: the client cannot update driver-only active tracking data', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        await setDoc(doc(context.firestore(), 'active_bookings', 'active-booking'), {
          userId: aliceId,
          driverId: bobId,
          bookingId: 'booking-1',
          driverLocation: { lat: 1, lng: 1 },
        });
      });

      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();

      await assertFails(updateDoc(doc(aliceDb, 'active_bookings', 'active-booking'), {
        driverLocation: { lat: 99, lng: 99 },
      }));
    });
  });
});
