import {
  checkPersonalDriverTripsDelayUntilExhausted,
} from '../checkPersonalDriverDelay';
import { cleanupAbandonedPendingPayments } from '../expireSubscriptions';
import { unassignDriverFuturePersonalTrips } from '../../admin/unassignDriverTrips';

type StoredDoc = Record<string, unknown>;

function createMockDb(initialData: Record<string, StoredDoc> = {}) {
  const store = new Map<string, StoredDoc>(Object.entries(initialData));

  function makeQuery(colName: string, filters: Array<{ field: string; op: string; val: unknown }>) {
    const getFn = async () => {
      const docs = Array.from(store.entries())
        .filter(([k]) => k.startsWith(`${colName}/`))
        .filter(([, v]) => {
          return filters.every(({ field, op, val }) => {
            if (op === 'in' && Array.isArray(val)) {
              return val.includes(v[field]);
            }
            return v[field] === val;
          });
        })
        .map(([k, v]) => {
          const id = k.split('/')[1];
          const docRef = { id, path: k };
          return {
            id,
            data: () => v,
            ref: docRef,
          };
        });
      return { empty: docs.length === 0, docs };
    };

    return {
      where: (field: string, op: string, val: unknown) => makeQuery(colName, [...filters, { field, op, val }]),
      limit: () => ({ get: getFn }),
      get: getFn,
    };
  }

  const db = {
    collection: (colName: string) => ({
      doc: (docId?: string) => {
        const id = docId || `generated_${Math.random().toString(36).substring(2, 9)}`;
        const path = `${colName}/${id}`;
        return {
          id,
          path,
          ref: { id, path },
          get: async () => ({
            exists: store.has(path),
            id,
            data: () => store.get(path),
            ref: { id, path },
          }),
        };
      },
      where: (field: string, op: string, val: unknown) => makeQuery(colName, [{ field, op, val }]),
      add: async (data: StoredDoc) => {
        const id = `notif_${Math.random().toString(36).substring(2, 9)}`;
        store.set(`${colName}/${id}`, data);
        return { id };
      },
    }),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        update: (refObj: { path?: string; ref?: { path: string } }, data: StoredDoc) => {
          const path = refObj.path || refObj.ref?.path;
          if (!path) return;
          ops.push(() => {
            const curr = store.get(path) || {};
            store.set(path, { ...curr, ...data });
          });
        },
        set: (refObj: { path?: string; ref?: { path: string } }, data: StoredDoc) => {
          const path = refObj.path || refObj.ref?.path;
          if (!path) return;
          ops.push(() => {
            store.set(path, data);
          });
        },
        delete: (refObj: { path?: string; ref?: { path: string } }, data: StoredDoc) => {
          const path = refObj.path || refObj.ref?.path;
          if (!path) return;
          ops.push(() => {
            store.delete(path);
          });
        },
        commit: async () => {
          ops.forEach((fn) => fn());
        },
      };
    },
    runTransaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const txOps: Array<() => void> = [];
      const tx = {
        get: async (refObj: { path?: string; ref?: { path: string } }) => {
          const path = refObj.path || refObj.ref?.path || '';
          return {
            exists: store.has(path),
            data: () => store.get(path),
            ref: refObj,
          };
        },
        update: (refObj: { path?: string; ref?: { path: string } }, data: StoredDoc) => {
          const path = refObj.path || refObj.ref?.path;
          if (!path) return;
          txOps.push(() => {
            const curr = store.get(path) || {};
            store.set(path, { ...curr, ...data });
          });
        },
        delete: (refObj: { path?: string; ref?: { path: string } }) => {
          const path = refObj.path || refObj.ref?.path;
          if (!path) return;
          txOps.push(() => {
            store.delete(path);
          });
        },
      };
      const res = await cb(tx);
      txOps.forEach((fn) => fn());
      return res;
    },
  };

  return { db, store };
}

describe('checkPersonalDriverDelay & resilience fixes', () => {
  const now = new Date('2026-08-06T10:00:00.000Z');

  it('triggers driverDelayAlert at H+10 min delay without unassigning driver', async () => {
    const scheduled12MinAgo = new Date('2026-08-06T09:48:00.000Z').toISOString();
    const { db, store } = createMockDb({
      'personal_driver_trips/trip_10min': {
        userId: 'client_1',
        assignedDriverId: 'driver_1',
        status: 'driver_assigned',
        scheduledAtIso: scheduled12MinAgo,
        driverDelayAlert: false,
      },
    });

    const result = await checkPersonalDriverTripsDelayUntilExhausted(db as never, now);

    expect(result.alertsSent).toBe(1);
    expect(result.unassignedCount).toBe(0);

    const tripData = store.get('personal_driver_trips/trip_10min');
    expect(tripData?.driverDelayAlert).toBe(true);
    expect(tripData?.status).toBe('driver_assigned');
    expect(tripData?.assignedDriverId).toBe('driver_1');
  });

  it('unassigns driver and sends urgent alert at H+30 min delay (No-Show)', async () => {
    const scheduled35MinAgo = new Date('2026-08-06T09:25:00.000Z').toISOString();
    const { db, store } = createMockDb({
      'personal_driver_trips/trip_30min': {
        userId: 'client_2',
        assignedDriverId: 'driver_2',
        status: 'driver_assigned',
        scheduledAtIso: scheduled35MinAgo,
        driverDelayAlert: true,
      },
      'drivers/driver_2': {
        activePersonalDriverTripId: 'trip_30min',
      },
    });

    const result = await checkPersonalDriverTripsDelayUntilExhausted(db as never, now);

    expect(result.unassignedCount).toBe(1);

    const tripData = store.get('personal_driver_trips/trip_30min');
    expect(tripData?.status).toBe('scheduled');
    expect(tripData?.assignedDriverId).toBeNull();
    expect(tripData?.previousAssignedDriverId).toBe('driver_2');

    const driverData = store.get('drivers/driver_2');
    expect(driverData?.activePersonalDriverTripId).toBeNull();
  });

  it('cleans up abandoned pending_payment subscriptions older than 2 hours', async () => {
    const created3HoursAgo = new Date('2026-08-06T07:00:00.000Z');
    const { db, store } = createMockDb({
      'personal_driver_subscriptions/sub_abandoned': {
        userId: 'client_3',
        periodStartDate: '2026-08-10',
        status: 'pending_payment',
        paymentStatus: 'pending',
        createdAt: { toDate: () => created3HoursAgo },
      },
      'personal_driver_subscription_locks/lock_3': {
        subscriptionId: 'sub_abandoned',
        state: 'pending_payment',
      },
    });

    const cleanedCount = await cleanupAbandonedPendingPayments(db as never, now);

    expect(cleanedCount).toBe(1);
    const subData = store.get('personal_driver_subscriptions/sub_abandoned');
    expect(subData?.status).toBe('payment_failed');
    expect(subData?.paymentStatus).toBe('failed');
  });

  it('unassigns future trips when driver is suspended or deactivated', async () => {
    const { db, store } = createMockDb({
      'personal_driver_trips/trip_future_1': {
        assignedDriverId: 'driver_suspended',
        status: 'driver_assigned',
      },
      'personal_driver_trips/trip_future_2': {
        assignedDriverId: 'driver_suspended',
        status: 'scheduled',
      },
      'drivers/driver_suspended': {
        activePersonalDriverTripId: 'trip_future_1',
        isAvailable: true,
      },
    });

    const unassignedCount = await unassignDriverFuturePersonalTrips(
      db as never,
      'driver_suspended',
      'admin_1',
      'Conducteur suspendu pour indiscipline',
    );

    expect(unassignedCount).toBe(2);

    const trip1 = store.get('personal_driver_trips/trip_future_1');
    expect(trip1?.assignedDriverId).toBeNull();
    expect(trip1?.status).toBe('scheduled');

    const driverData = store.get('drivers/driver_suspended');
    expect(driverData?.activePersonalDriverTripId).toBeNull();
    expect(driverData?.isAvailable).toBe(false);
  });
});
