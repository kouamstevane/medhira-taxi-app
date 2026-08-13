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

describe('Restaurant opening hours Firestore rules', () => {
  let testEnv: RulesTestEnvironment;
  const ownerId = 'restaurant-hours-owner';
  const restaurantId = 'restaurant-hours';

  const validOpeningHours = {
    monday: { open: '09:00', close: '22:00', closed: false },
    tuesday: { open: '09:00', close: '22:00', closed: false },
    wednesday: { open: '09:00', close: '22:00', closed: false },
    thursday: { open: '09:00', close: '22:00', closed: false },
    friday: { open: '09:00', close: '22:00', closed: false },
    saturday: { open: '09:00', close: '22:00', closed: false },
    sunday: { open: '09:00', close: '22:00', closed: true },
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

  it('allows an owner to save a complete valid schedule', async () => {
    const db = testEnv.authenticatedContext(ownerId).firestore();

    await assertSucceeds(updateDoc(doc(db, 'restaurants', restaurantId), {
      openingHours: validOpeningHours,
      updatedAt: '2026-08-13T00:00:00.000Z',
    }));
  });

  it('rejects an inverted opening interval', async () => {
    const db = testEnv.authenticatedContext(ownerId).firestore();

    await assertFails(updateDoc(doc(db, 'restaurants', restaurantId), {
      openingHours: {
        ...validOpeningHours,
        monday: { open: '22:00', close: '09:00', closed: false },
      },
      updatedAt: '2026-08-13T00:00:00.000Z',
    }));
  });

  it('rejects an opening hour with an invalid shape', async () => {
    const db = testEnv.authenticatedContext(ownerId).firestore();

    await assertFails(updateDoc(doc(db, 'restaurants', restaurantId), {
      openingHours: {
        ...validOpeningHours,
        monday: { open: '09:00', close: '22:00' },
      },
      updatedAt: '2026-08-13T00:00:00.000Z',
    }));
  });

  it('rejects a schedule with every day closed', async () => {
    const db = testEnv.authenticatedContext(ownerId).firestore();
    const closedOpeningHours = Object.fromEntries(
      Object.entries(validOpeningHours).map(([day, value]) => [day, { ...value, closed: true }]),
    );

    await assertFails(updateDoc(doc(db, 'restaurants', restaurantId), {
      openingHours: closedOpeningHours,
      updatedAt: '2026-08-13T00:00:00.000Z',
    }));
  });
});
