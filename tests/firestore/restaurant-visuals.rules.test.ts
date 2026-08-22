import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestContext,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Restaurant visual Firestore rules', () => {
  let testEnv: RulesTestEnvironment;
  const ownerId = 'restaurant-visual-owner';
  const otherUserId = 'restaurant-visual-other';
  const restaurantId = 'restaurant-visuals';

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
    await testEnv?.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      await setDoc(doc(context.firestore(), 'restaurants', restaurantId), {
        ownerId,
        status: 'approved',
        commissionRate: 10,
        stripeConnectStatus: 'active',
        stripeAccountId: 'acct-test',
      });
    });
  });

  it('allows the owner to add and replace the logo and cover URLs', async () => {
    const db = testEnv.authenticatedContext(ownerId).firestore();
    const firstVisuals = {
      logoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/logo-1.webp',
      coverImageUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/cover-1.webp',
    };

    await assertSucceeds(updateDoc(doc(db, 'restaurants', restaurantId), firstVisuals));
    await assertSucceeds(updateDoc(doc(db, 'restaurants', restaurantId), {
      logoUrl: null,
      coverImageUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/cover-2.webp',
    }));
  });

  it('allows visual updates when the newly created restaurant has no Stripe account field yet', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      await setDoc(doc(context.firestore(), 'restaurants', 'restaurant-without-stripe'), {
        ownerId,
        status: 'pending_approval',
        commissionRate: 5,
        stripeConnectStatus: 'not_started',
      });
    });

    const db = testEnv.authenticatedContext(ownerId).firestore();
    await assertSucceeds(updateDoc(doc(db, 'restaurants', 'restaurant-without-stripe'), {
      logoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/logo-new.webp',
    }));
  });

  it('rejects visual updates from another user and protects restaurant ownership fields', async () => {
    const otherDb = testEnv.authenticatedContext(otherUserId).firestore();
    await assertFails(updateDoc(doc(otherDb, 'restaurants', restaurantId), {
      logoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/logo-1.webp',
    }));

    const ownerDb = testEnv.authenticatedContext(ownerId).firestore();
    await assertFails(updateDoc(doc(ownerDb, 'restaurants', restaurantId), {
      logoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/logo-1.webp',
      ownerId: otherUserId,
    }));
  });

  it('rejects oversized visual URLs', async () => {
    const db = testEnv.authenticatedContext(ownerId).firestore();
    await assertFails(updateDoc(doc(db, 'restaurants', restaurantId), {
      logoUrl: `https://firebasestorage.googleapis.com/v0/b/demo/o/${'a'.repeat(2049)}`,
    }));
  });

  it('blocks direct reads of restaurants and menus when Stripe is not active', async () => {
    const unavailableRestaurantId = 'restaurant-without-active-stripe';

    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      const db = context.firestore();
      await setDoc(doc(db, 'restaurants', unavailableRestaurantId), {
        ownerId,
        status: 'approved',
        commissionRate: 10,
        stripeConnectStatus: 'restricted',
      });
      await setDoc(doc(db, 'restaurants', unavailableRestaurantId, 'menu_items', 'menu-item-1'), {
        name: 'Plat masqué',
        isAvailable: true,
      });
    });

    const clientDb = testEnv.authenticatedContext(otherUserId).firestore();
    await assertFails(getDoc(doc(clientDb, 'restaurants', unavailableRestaurantId)));
    await assertFails(getDoc(doc(clientDb, 'restaurants', unavailableRestaurantId, 'menu_items', 'menu-item-1')));

    const ownerDb = testEnv.authenticatedContext(ownerId).firestore();
    await assertSucceeds(getDoc(doc(ownerDb, 'restaurants', unavailableRestaurantId)));
    await assertSucceeds(getDoc(doc(ownerDb, 'restaurants', unavailableRestaurantId, 'menu_items', 'menu-item-1')));
  });
});
