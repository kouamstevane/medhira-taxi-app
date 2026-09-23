import {
  bulkDeleteMenuItems,
  bulkUpdateMenuItemAvailability,
  getRestaurantMenuItemsMatchingQuery,
} from '../food-delivery.service';
import {
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';

jest.mock('@/config/firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn((...args) => ({ path: args.join('/') })),
  deleteDoc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  getCountFromServer: jest.fn(),
  query: jest.fn((...args) => ({ args })),
  where: jest.fn((...args) => ({ args })),
  orderBy: jest.fn((...args) => ({ args })),
  limit: jest.fn((value) => ({ value })),
  startAfter: jest.fn((value) => ({ value })),
  documentId: jest.fn(() => '__name__'),
  updateDoc: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  deleteField: jest.fn(),
  onSnapshot: jest.fn(),
  writeBatch: jest.fn(() => ({
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(() => Promise.resolve()),
  })),
  Timestamp: class Timestamp {},
}));

describe('bulk restaurant menu operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads every menu item matching the active catalog filters', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce({
      docs: [
        { id: 'item-1', data: () => ({ name: 'Pizza', category: 'Plats', isAvailable: true }) },
        { id: 'item-2', data: () => ({ name: 'Pizza veggie', category: 'Plats', isAvailable: true }) },
      ],
    });

    await expect(getRestaurantMenuItemsMatchingQuery('restaurant-1', {
      search: 'pizza',
      category: 'Plats',
      availability: 'available',
      sort: 'name',
      pageSize: 50,
    })).resolves.toEqual([
      { id: 'item-1', name: 'Pizza', category: 'Plats', isAvailable: true },
      { id: 'item-2', name: 'Pizza veggie', category: 'Plats', isAvailable: true },
    ]);

    expect(where).toHaveBeenCalledWith('searchPrefixes', 'array-contains', 'pizza');
    expect(where).toHaveBeenCalledWith('category', '==', 'Plats');
    expect(where).toHaveBeenCalledWith('isAvailable', '==', true);
    expect(query).toHaveBeenCalled();
  });

  it('commits availability updates in batches of 500', async () => {
    const itemIds = Array.from({ length: 501 }, (_, index) => `item-${index}`);
    const mockWriteBatch = writeBatch as jest.Mock;

    await bulkUpdateMenuItemAvailability('restaurant-1', itemIds, false);

    expect(writeBatch).toHaveBeenCalledTimes(2);
    expect(mockWriteBatch.mock.results[0].value.update).toHaveBeenCalledTimes(500);
    expect(mockWriteBatch.mock.results[1].value.update).toHaveBeenCalledTimes(1);
    expect(mockWriteBatch.mock.results[0].value.commit).toHaveBeenCalledTimes(1);
    expect(mockWriteBatch.mock.results[1].value.commit).toHaveBeenCalledTimes(1);
  });

  it('physically deletes selected menu items in batches of 500', async () => {
    const itemIds = Array.from({ length: 501 }, (_, index) => `item-${index}`);
    const mockWriteBatch = writeBatch as jest.Mock;

    await bulkDeleteMenuItems('restaurant-1', itemIds);

    expect(writeBatch).toHaveBeenCalledTimes(2);
    expect(mockWriteBatch.mock.results[0].value.delete).toHaveBeenCalledTimes(500);
    expect(mockWriteBatch.mock.results[1].value.delete).toHaveBeenCalledTimes(1);
    expect(mockWriteBatch.mock.results[0].value.commit).toHaveBeenCalledTimes(1);
    expect(mockWriteBatch.mock.results[1].value.commit).toHaveBeenCalledTimes(1);
  });
});
