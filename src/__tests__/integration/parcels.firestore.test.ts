import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Parcel Firestore rules', () => {
  let testEnv: RulesTestEnvironment;

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

  afterAll(async () => testEnv.cleanup());

  beforeEach(async () => testEnv.clearFirestore());

  const parcel = {
    parcelId: 'parcel-rules-1',
    senderId: 'sender-rules',
    receiverId: 'receiver-rules',
    driverId: 'driver-rules',
    status: 'accepted',
    description: 'Document',
    price: 20,
    driverEarnings: 14,
    platformFee: 6,
  };

  it('rejects direct client parcel creation', async () => {
    const db = testEnv.authenticatedContext('sender-rules').firestore();
    await assertFails(setDoc(doc(db, 'parcels', parcel.parcelId), parcel));
  });

  it('rejects a driver attempting to alter financial fields', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'parcels', parcel.parcelId), parcel);
    });

    const db = testEnv.authenticatedContext('driver-rules').firestore();
    await assertFails(updateDoc(doc(db, 'parcels', parcel.parcelId), {
      driverEarnings: 2000,
    }));
  });

  it('allows only the next driver status transition', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'parcels', parcel.parcelId), parcel);
    });

    const db = testEnv.authenticatedContext('driver-rules').firestore();
    await assertSucceeds(updateDoc(doc(db, 'parcels', parcel.parcelId), {
      status: 'in_transit',
    }));
    await assertFails(updateDoc(doc(db, 'parcels', parcel.parcelId), {
      status: 'completed',
    }));
  });
});
