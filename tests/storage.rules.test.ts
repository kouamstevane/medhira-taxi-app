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
});
