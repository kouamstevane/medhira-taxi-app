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
});
