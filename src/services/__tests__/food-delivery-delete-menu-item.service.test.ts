import { FoodDeliveryService } from '../food-delivery.service';
import { deleteDoc, doc } from 'firebase/firestore';

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
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  updateDoc: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  deleteField: jest.fn(),
  limit: jest.fn(),
  startAfter: jest.fn(),
  documentId: jest.fn(),
  onSnapshot: jest.fn(),
  writeBatch: jest.fn(),
  Timestamp: class Timestamp {},
}));

describe('food delivery menu deletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('physically deletes the menu item document from its restaurant subcollection', async () => {
    await FoodDeliveryService.deleteMenuItem('restaurant-1', 'item-1');

    expect(doc).toHaveBeenCalledWith(
      {},
      'restaurants',
      'restaurant-1',
      'menu_items',
      'item-1',
    );
    const mockDeleteDoc = deleteDoc as jest.Mock;
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(mockDeleteDoc.mock.calls[0][0]).toEqual({
      path: expect.stringContaining('/restaurants/restaurant-1/menu_items/item-1'),
    });
  });
});
