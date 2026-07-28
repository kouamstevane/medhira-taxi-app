import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Realtime Database delivery tracking rules', () => {
  let testEnv: RulesTestEnvironment;
  const orderId = 'tracking-order';

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'medjira-taxi-test',
      database: {
        rules: readFileSync(join(__dirname, '../database.rules.json'), 'utf8'),
        host: '127.0.0.1',
        port: 9010,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearDatabase();
  });

  test('only delivery participants can read and only assigned driver can write delivery tracking', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref(`delivery_tracking/${orderId}`).set({
        driverId: 'driver',
        participants: {
          driver: true,
          client: true,
        },
      });
    });

    const driverDb = testEnv.authenticatedContext('driver').database();
    const clientDb = testEnv.authenticatedContext('client').database();
    const otherDb = testEnv.authenticatedContext('other-user').database();
    const adminDb = testEnv.authenticatedContext('admin-user', { role: 'admin' }).database();

    await assertSucceeds(driverDb.ref(`delivery_tracking/${orderId}/location`).set({
      lat: 45,
      lng: -73,
      heading: 90,
      speed: 12,
      updatedAt: Date.now(),
    }));

    await assertSucceeds(driverDb.ref(`delivery_tracking/${orderId}/location`).get());
    await assertSucceeds(clientDb.ref(`delivery_tracking/${orderId}/location`).get());
    await assertSucceeds(adminDb.ref(`delivery_tracking/${orderId}/location`).get());
    await assertFails(otherDb.ref(`delivery_tracking/${orderId}/location`).get());
    await assertFails(clientDb.ref(`delivery_tracking/${orderId}/location`).set({
      lat: 45,
      lng: -73,
      heading: 90,
      speed: 12,
      updatedAt: Date.now(),
    }));
    await assertFails(otherDb.ref(`delivery_tracking/${orderId}/location`).set({
      lat: 45,
      lng: -73,
      heading: 90,
      speed: 12,
      updatedAt: Date.now(),
    }));
  });
});
