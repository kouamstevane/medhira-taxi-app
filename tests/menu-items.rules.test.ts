import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Menu item deletion rules', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'medjira-taxi-test',
      firestore: {
        rules: readFileSync(join(__dirname, '../firestore.rules'), 'utf8'),
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
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'restaurants', 'restaurant-delete-test'), {
        ownerId: 'owner-delete-test',
      });
      await setDoc(doc(db, 'restaurants', 'restaurant-delete-test', 'menu_items', 'item-delete-test'), {
        name: 'Plat de test',
      });
    });
  });

  it('allows the restaurant owner to physically delete a menu item', async () => {
    const ownerDb = testEnv.authenticatedContext('owner-delete-test').firestore();

    await assertSucceeds(
      deleteDoc(doc(ownerDb, 'restaurants', 'restaurant-delete-test', 'menu_items', 'item-delete-test')),
    );
  });

  it('denies menu item deletion to another authenticated user', async () => {
    const otherUserDb = testEnv.authenticatedContext('other-user-delete-test').firestore();

    await assertFails(
      deleteDoc(doc(otherUserDb, 'restaurants', 'restaurant-delete-test', 'menu_items', 'item-delete-test')),
    );
  });
});
