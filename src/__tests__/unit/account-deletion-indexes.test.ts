import fs from 'node:fs';
import path from 'node:path';

type FirestoreIndex = {
  collectionGroup: string;
  queryScope: string;
  fields: Array<{ fieldPath: string }>;
};

type FirestoreFieldOverride = {
  collectionGroup: string;
  fieldPath: string;
  indexes: Array<{ queryScope: string }>;
};

describe('account deletion Firestore indexes', () => {
  it('defines collection-group indexes for deletion queries', () => {
    const indexesPath = path.resolve(process.cwd(), 'firestore.indexes.json');
    const config = JSON.parse(fs.readFileSync(indexesPath, 'utf8')) as {
      indexes: FirestoreIndex[];
      fieldOverrides: FirestoreFieldOverride[];
    };

    expect(config.fieldOverrides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collectionGroup: 'messages',
          fieldPath: 'senderId',
          indexes: expect.arrayContaining([expect.objectContaining({ queryScope: 'COLLECTION_GROUP' })]),
        }),
        expect.objectContaining({
          collectionGroup: 'candidates',
          fieldPath: 'candidateId',
          indexes: expect.arrayContaining([expect.objectContaining({ queryScope: 'COLLECTION_GROUP' })]),
        }),
      ]),
    );
  });
});
