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
