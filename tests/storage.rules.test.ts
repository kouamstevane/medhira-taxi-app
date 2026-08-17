import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestContext,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Storage rules', () => {
  let testEnv: RulesTestEnvironment;

  const orderId = 'food-order';
  const driverId = 'food-driver';
  const clientId = 'food-client';
  const otherClientId = 'food-other-client';

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'medjira-service',
      firestore: {
        rules: readFileSync(join(__dirname, '../firestore.rules'), 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
      storage: {
        rules: readFileSync(join(__dirname, '../storage.rules'), 'utf8'),
        host: '127.0.0.1',
        port: 9199,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.clearStorage();
  });

  test('delivery proof reads are limited to the delivery participants', async () => {
    const proofPath = `delivery_proofs/${orderId}/proof.jpg`;
    const driverStorage = testEnv
      .authenticatedContext(driverId, { activeDeliveryOrderId: orderId })
      .storage();

    await assertSucceeds(
      uploadBytes(ref((driverStorage as any)._delegate, proofPath), new Blob(['proof']), {
        contentType: 'image/jpeg',
      }),
    );

    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      await setDoc(doc(context.firestore(), 'food_delivery_orders', orderId), {
        driverId,
        clientId,
        status: 'delivered',
      });
    });

    const clientStorage = testEnv.authenticatedContext(clientId).storage();
    await assertSucceeds(getBytes(ref((clientStorage as any)._delegate, proofPath)));

    const anonStorage = testEnv.unauthenticatedContext().storage();
    await assertFails(getBytes(ref((anonStorage as any)._delegate, proofPath)));

    const otherStorage = testEnv.authenticatedContext(otherClientId).storage();
    await assertFails(getBytes(ref((otherStorage as any)._delegate, proofPath)));
  });

  test('menu image storage rules enforce ownership, format, size limits, and public reads', async () => {
    const restaurantId = 'rest-123';
    const ownerId = 'owner-456';
    const otherUserId = 'user-789';
    const imagePath = `menu-images/${restaurantId}/item-1/up-1.webp`;

    // Seed restaurant owner in Firestore
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      await setDoc(doc(context.firestore(), 'restaurants', restaurantId), {
        ownerId,
        status: 'approved',
      });
    });

    const ownerStorage = testEnv.authenticatedContext(ownerId).storage();
    const otherStorage = testEnv.authenticatedContext(otherUserId).storage();
    const anonStorage = testEnv.unauthenticatedContext().storage();

    // 1. Owner upload WebP <= 500KB succeeds
    const validBlob = new Blob(['a'.repeat(100 * 1024)], { type: 'image/webp' });
    await assertSucceeds(
      uploadBytes(ref((ownerStorage as any)._delegate, imagePath), validBlob, {
        contentType: 'image/webp',
      })
    );

    // 2. Public read (authenticated and unauthenticated) succeeds
    await assertSucceeds(getBytes(ref((anonStorage as any)._delegate, imagePath)));
    await assertSucceeds(getBytes(ref((otherStorage as any)._delegate, imagePath)));

    // 3. Non-owner create fails
    const otherPath = `menu-images/${restaurantId}/item-1/up-2.webp`;
    await assertFails(
      uploadBytes(ref((otherStorage as any)._delegate, otherPath), validBlob, {
        contentType: 'image/webp',
      })
    );

    // 4. Over 500KB fails
    const hugeBlob = new Blob(['a'.repeat(501 * 1024)], { type: 'image/webp' });
    const hugePath = `menu-images/${restaurantId}/item-1/up-huge.webp`;
    await assertFails(
      uploadBytes(ref((ownerStorage as any)._delegate, hugePath), hugeBlob, {
        contentType: 'image/webp',
      })
    );

    // 5. Wrong MIME type fails
    const jpegBlob = new Blob(['a'.repeat(10 * 1024)], { type: 'image/jpeg' });
    const jpegPath = `menu-images/${restaurantId}/item-1/up-jpeg.webp`;
    await assertFails(
      uploadBytes(ref((ownerStorage as any)._delegate, jpegPath), jpegBlob, {
        contentType: 'image/jpeg',
      })
    );

    // 6. Non-owner delete fails
    const { deleteObject } = require('firebase/storage');
    await assertFails(deleteObject(ref((otherStorage as any)._delegate, imagePath)));

    // 7. Owner delete succeeds
    await assertSucceeds(deleteObject(ref((ownerStorage as any)._delegate, imagePath)));
  });

  test('menu-imports private upload rules for CSV and XLSX', async () => {
    const restaurantId = 'food-resto-imports';
    const ownerId = 'food-resto-owner-imports';
    const otherUserId = 'other-user-imports';

    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      await setDoc(doc(context.firestore(), 'restaurants', restaurantId), {
        ownerId,
        status: 'approved',
      });
    });

    const ownerStorage = testEnv.authenticatedContext(ownerId).storage();
    const otherStorage = testEnv.authenticatedContext(otherUserId).storage();
    const anonStorage = testEnv.unauthenticatedContext().storage();

    const csvBlob = new Blob(['name,price\nBurger,10'], { type: 'text/csv' });
    const xlsxBlob = new Blob(['mock-xlsx-data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // 1. Owner can upload CSV
    const csvPath = `menu-imports/${restaurantId}/import-1.csv`;
    await assertSucceeds(
      uploadBytes(ref((ownerStorage as any)._delegate, csvPath), csvBlob, {
        contentType: 'text/csv',
      })
    );

    // 2. Owner can upload XLSX
    const xlsxPath = `menu-imports/${restaurantId}/import-1.xlsx`;
    await assertSucceeds(
      uploadBytes(ref((ownerStorage as any)._delegate, xlsxPath), xlsxBlob, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    );

    // 3. .xls is disallowed
    const xlsBlob = new Blob(['legacy-xls'], { type: 'application/vnd.ms-excel' });
    const xlsPath = `menu-imports/${restaurantId}/import-1.xls`;
    await assertFails(
      uploadBytes(ref((ownerStorage as any)._delegate, xlsPath), xlsBlob, {
        contentType: 'application/vnd.ms-excel',
      })
    );

    // 4. Non-owner cannot upload
    await assertFails(
      uploadBytes(ref((otherStorage as any)._delegate, `menu-imports/${restaurantId}/import-2.csv`), csvBlob, {
        contentType: 'text/csv',
      })
    );

    // 5. Unauthenticated cannot upload
    await assertFails(
      uploadBytes(ref((anonStorage as any)._delegate, `menu-imports/${restaurantId}/import-3.csv`), csvBlob, {
        contentType: 'text/csv',
      })
    );

    // 6. Direct client read is forbidden (processed by Cloud Functions Admin SDK)
    await assertFails(getBytes(ref((ownerStorage as any)._delegate, csvPath)));

    // 7. Direct client delete is forbidden
    const { deleteObject } = require('firebase/storage');
    await assertFails(deleteObject(ref((ownerStorage as any)._delegate, csvPath)));
  });
});
