import { readFileSync } from 'fs';
import path from 'path';

type FirestoreIndex = {
  collectionGroup: string;
  fields: Array<{
    fieldPath: string;
    order?: string;
    arrayConfig?: string;
  }>;
};

const indexes = JSON.parse(
  readFileSync(path.join(process.cwd(), 'firestore.indexes.json'), 'utf8'),
) as { indexes: FirestoreIndex[] };

const hasIndex = (
  collectionGroup: string,
  fields: Array<{ fieldPath: string; order?: string; arrayConfig?: string }>,
) =>
  indexes.indexes.some((index) =>
    index.collectionGroup === collectionGroup &&
    index.fields.length === fields.length &&
    fields.every((field, position) => {
      const actual = index.fields[position];
      return actual?.fieldPath === field.fieldPath &&
        actual.order === field.order &&
        actual.arrayConfig === field.arrayConfig;
    }),
  );

describe('firestore composite indexes for food restoration', () => {
  it('supports approved restaurant cuisine filtering with Stripe status and pagination', () => {
    expect(hasIndex('restaurants', [
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'stripeConnectStatus', order: 'ASCENDING' },
      { fieldPath: 'cuisineType', arrayConfig: 'CONTAINS' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ])).toBe(true);
  });

  it('supports restaurant order feeds without a status filter', () => {
    expect(hasIndex('food_orders', [
      { fieldPath: 'restaurantId', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ])).toBe(true);
  });

  it('supports approved restaurant price filtering with Stripe status and deterministic pagination', () => {
    expect(hasIndex('restaurants', [
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'stripeConnectStatus', order: 'ASCENDING' },
      { fieldPath: 'avgPricePerPerson', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ])).toBe(true);

    expect(hasIndex('restaurants', [
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'stripeConnectStatus', order: 'ASCENDING' },
      { fieldPath: 'cuisineType', arrayConfig: 'CONTAINS' },
      { fieldPath: 'avgPricePerPerson', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ])).toBe(true);

  });
});

describe('firestore composite indexes for Personal Driver', () => {
  it('supports explicit subscription state views and ordered expiry scans', () => {
    expect(hasIndex('personal_driver_subscriptions', [
      { fieldPath: 'userId', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ])).toBe(true);
    expect(hasIndex('personal_driver_subscriptions', [
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'periodEndAtUtc', order: 'ASCENDING' },
    ])).toBe(true);
  });

  it.each(['subscriptionId', 'assignedDriverId', 'userId'])(
    'orders %s trip feeds by scheduledAtIso',
    (ownerField) => {
      expect(hasIndex('personal_driver_trips', [
        { fieldPath: ownerField, order: 'ASCENDING' },
        { fieldPath: 'scheduledAtIso', order: 'ASCENDING' },
      ])).toBe(true);
    },
  );

  it('does not retain Personal Driver trip indexes on the legacy scheduledAt field', () => {
    expect(indexes.indexes.some((index) =>
      index.collectionGroup === 'personal_driver_trips'
      && index.fields.some((field) => field.fieldPath === 'scheduledAt'),
    )).toBe(false);
  });
});
