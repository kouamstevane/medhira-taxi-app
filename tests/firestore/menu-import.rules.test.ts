import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestContext,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Menu Import & Security Rules', () => {
  let testEnv: RulesTestEnvironment;

  const restaurantOwnerId = 'owner-123';
  const otherUserId = 'other-456';
  const restaurantId = 'resto-789';
  const itemId = 'item-001';
  const importId = 'import-101';

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

    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      const db = context.firestore();
      await setDoc(doc(db, 'restaurants', restaurantId), {
        ownerId: restaurantOwnerId,
        name: 'Super Resto',
        status: 'approved',
      });
    });
  });

  describe('menu_imports subcollection', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'restaurants', restaurantId, 'menu_imports', importId), {
          id: importId,
          restaurantId,
          type: 'csv',
          status: 'pending',
          totalItems: 0,
          processedItems: 0,
          failedItems: 0,
          errors: [],
        });
      });
    });

    test('restaurant owner can read menu_imports', async () => {
      const ownerDb = testEnv.authenticatedContext(restaurantOwnerId).firestore();
      const docRef = doc(ownerDb, 'restaurants', restaurantId, 'menu_imports', importId);
      await assertSucceeds(getDoc(docRef));
    });

    test('non-owner cannot read menu_imports', async () => {
      const otherDb = testEnv.authenticatedContext(otherUserId).firestore();
      const docRef = doc(otherDb, 'restaurants', restaurantId, 'menu_imports', importId);
      await assertFails(getDoc(docRef));
    });

    test('unauthenticated user cannot read menu_imports', async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      const docRef = doc(unauthDb, 'restaurants', restaurantId, 'menu_imports', importId);
      await assertFails(getDoc(docRef));
    });

    test('client cannot create, update, or delete in menu_imports directly', async () => {
      const ownerDb = testEnv.authenticatedContext(restaurantOwnerId).firestore();
      const docRef = doc(ownerDb, 'restaurants', restaurantId, 'menu_imports', 'new-import');

      await assertFails(
        setDoc(docRef, {
          id: 'new-import',
          restaurantId,
          type: 'csv',
          status: 'pending',
        })
      );

      const existingDocRef = doc(ownerDb, 'restaurants', restaurantId, 'menu_imports', importId);
      await assertFails(updateDoc(existingDocRef, { status: 'completed' }));
      await assertFails(deleteDoc(existingDocRef));
    });
  });

  describe('private_integrations subcollection', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'restaurants', restaurantId, 'private_integrations', 'woocommerce'), {
          provider: 'woocommerce',
          encryptedCredentials: 'secret-blob',
        });
      });
    });

    test('private_integrations is strictly inaccessible to owner and others', async () => {
      const ownerDb = testEnv.authenticatedContext(restaurantOwnerId).firestore();
      const docRef = doc(ownerDb, 'restaurants', restaurantId, 'private_integrations', 'woocommerce');

      await assertFails(getDoc(docRef));
      await assertFails(setDoc(docRef, { provider: 'woocommerce' }));
      await assertFails(updateDoc(docRef, { provider: 'woocommerce' }));
      await assertFails(deleteDoc(docRef));
    });
  });

  describe('menu_items subcollection permissions & validation', () => {
    test('owner can create valid menu item with source manual and price up to 50,000,000', async () => {
      const ownerDb = testEnv.authenticatedContext(restaurantOwnerId).firestore();
      const docRef = doc(ownerDb, 'restaurants', restaurantId, 'menu_items', itemId);

      await assertSucceeds(
        setDoc(docRef, {
          id: itemId,
          restaurantId,
          name: 'Burger Gourmet',
          description: 'Délicieux burger',
          price: 15000,
          category: 'Plats',
          isAvailable: true,
          preparationTime: 20,
          source: 'manual',
        })
      );
    });

    test('owner cannot create menu item with source csv or woocommerce (reserved to Admin SDK)', async () => {
      const ownerDb = testEnv.authenticatedContext(restaurantOwnerId).firestore();
      const docRef = doc(ownerDb, 'restaurants', restaurantId, 'menu_items', itemId);

      await assertFails(
        setDoc(docRef, {
          id: itemId,
          restaurantId,
          name: 'Burger Importé',
          description: 'Importé',
          price: 12,
          category: 'Plats',
          isAvailable: true,
          source: 'csv',
          externalId: 'ext-123',
        })
      );
    });

    test('owner cannot modify source, externalId, sourceUpdatedAt or lastImportId on update', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'restaurants', restaurantId, 'menu_items', itemId), {
          id: itemId,
          restaurantId,
          name: 'Plat Sync',
          description: 'Desc',
          price: 25,
          category: 'Plats',
          isAvailable: true,
          source: 'woocommerce',
          externalId: 'wc-999',
        });
      });

      const ownerDb = testEnv.authenticatedContext(restaurantOwnerId).firestore();
      const docRef = doc(ownerDb, 'restaurants', restaurantId, 'menu_items', itemId);

      // Updating name is allowed
      await assertSucceeds(updateDoc(docRef, { name: 'Plat Modifié' }));

      // Attempting to change source is forbidden
      await assertFails(updateDoc(docRef, { source: 'manual' }));

      // Attempting to change externalId is forbidden
      await assertFails(updateDoc(docRef, { externalId: 'other-id' }));
    });

    test('physical deletion of menu items is disallowed (soft-delete only)', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'restaurants', restaurantId, 'menu_items', itemId), {
          id: itemId,
          restaurantId,
          name: 'Plat à supprimer',
          description: 'Desc',
          price: 10,
          category: 'Plats',
          isAvailable: true,
          source: 'manual',
        });
      });

      const ownerDb = testEnv.authenticatedContext(restaurantOwnerId).firestore();
      const docRef = doc(ownerDb, 'restaurants', restaurantId, 'menu_items', itemId);

      await assertFails(deleteDoc(docRef));

      // Soft delete via isAvailable = false is allowed
      await assertSucceeds(updateDoc(docRef, { isAvailable: false }));
    });
  });
});
