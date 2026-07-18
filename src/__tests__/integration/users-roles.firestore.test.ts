/**
 * Integration Tests - Users/Roles Firestore Rules
 *
 * Validates the anti-self-promotion rules on users/{uid}:
 *   CREATE: client profile OR locked driver onboarding draft
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
import { doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
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

    test('AUTHORIZED: auto-réparation C2 — add missing roles.client', async () => {
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

      await assertSucceeds(updateDoc(doc(db, 'users', 'grace'), {
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
});
