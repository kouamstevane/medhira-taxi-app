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

console.warn = () => undefined;
console.error = () => undefined;

describe('Personal driver Firestore rules', () => {
  let testEnv: RulesTestEnvironment;

  const clientId = 'personal-driver-client';
  const otherClientId = 'personal-driver-other-client';
  const adminId = 'personal-driver-admin';
  const driverId = 'personal-driver-driver';
  const subscriptionId = 'personal-driver-subscription';
  const tripId = 'personal-driver-trip';

  const subscription = {
    userId: clientId,
    status: 'pending_validation',
    createdAt: '2026-07-24T10:00:00.000Z',
  };

  const trip = {
    subscriptionId,
    userId: clientId,
    assignedDriverId: driverId,
    status: 'assigned',
    statusHistory: [],
    scheduledAt: '2026-07-25T10:00:00.000Z',
    updatedAt: '2026-07-24T10:00:00.000Z',
    driverLocation: { latitude: 4.05, longitude: 9.7 },
  };

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
      await setDoc(doc(db, 'admins', adminId), { uid: adminId });
      await setDoc(doc(db, 'personal_driver_subscriptions', subscriptionId), subscription);
      await setDoc(doc(db, 'personal_driver_trips', tripId), trip);
    });
  });

  test('client can read their own subscription and trip', async () => {
    const db = testEnv.authenticatedContext(clientId).firestore();

    await assertSucceeds(getDoc(doc(db, 'personal_driver_subscriptions', subscriptionId)));
    await assertSucceeds(getDoc(doc(db, 'personal_driver_trips', tripId)));
  });

  test('client cannot read another client subscription', async () => {
    const db = testEnv.authenticatedContext(otherClientId).firestore();

    await assertFails(getDoc(doc(db, 'personal_driver_subscriptions', subscriptionId)));
  });

  test('admin can read and update subscriptions and trips', async () => {
    const db = testEnv.authenticatedContext(adminId).firestore();

    await assertSucceeds(getDoc(doc(db, 'personal_driver_subscriptions', subscriptionId)));
    await assertSucceeds(updateDoc(doc(db, 'personal_driver_subscriptions', subscriptionId), {
      status: 'active',
    }));
    await assertSucceeds(getDoc(doc(db, 'personal_driver_trips', tripId)));
    await assertSucceeds(updateDoc(doc(db, 'personal_driver_trips', tripId), {
      assignedDriverId: 'replacement-driver',
    }));
  });

  test('assigned driver can read their assigned trip', async () => {
    const db = testEnv.authenticatedContext(driverId).firestore();

    await assertSucceeds(getDoc(doc(db, 'personal_driver_trips', tripId)));
  });

  test('assigned driver can update only operational trip fields', async () => {
    const db = testEnv.authenticatedContext(driverId).firestore();

    await assertSucceeds(updateDoc(doc(db, 'personal_driver_trips', tripId), {
      status: 'en_route',
      statusHistory: [{ status: 'en_route' }],
      updatedAt: '2026-07-24T10:05:00.000Z',
      driverLocation: { latitude: 4.06, longitude: 9.71 },
    }));
    await assertFails(updateDoc(doc(db, 'personal_driver_trips', tripId), {
      assignedDriverId: 'replacement-driver',
    }));
  });

  test('unauthenticated users cannot read or write personal driver data', async () => {
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, 'personal_driver_subscriptions', subscriptionId)));
    await assertFails(getDoc(doc(db, 'personal_driver_trips', tripId)));
    await assertFails(setDoc(doc(db, 'personal_driver_subscriptions', 'new-subscription'), subscription));
    await assertFails(updateDoc(doc(db, 'personal_driver_trips', tripId), { status: 'en_route' }));
  });
});
