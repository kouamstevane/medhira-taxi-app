import {
  getCustomerRestaurantMenuCategories,
  getCustomerRestaurantMenuPage,
} from '../food-delivery.service';
import { getDocs, limit, orderBy, query, startAfter, where, documentId } from 'firebase/firestore';

jest.mock('@/config/firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({ id: 'mock-id' })),
  getDocs: jest.fn(),
  getCountFromServer: jest.fn(),
  query: jest.fn((...args) => ({ args })),
  where: jest.fn((...args) => ({ args })),
  orderBy: jest.fn((...args) => ({ args })),
  documentId: jest.fn(() => '__name__'),
  limit: jest.fn((count) => ({ count })),
  startAfter: jest.fn((cursor) => ({ cursor })),
  updateDoc: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  deleteField: jest.fn(),
  writeBatch: jest.fn(() => ({ update: jest.fn(), commit: jest.fn(() => Promise.resolve()) })),
}));

describe('customer restaurant menu service', () => {
  const restaurantId = 'resto-customer-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loads the first customer page with available items ordered by category and documentId', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce({
      docs: [
        {
          id: 'item-1',
          data: () => ({ name: 'Pizza Margherita', category: 'Pizzas', price: 10, isAvailable: true }),
        },
      ],
    });

    await getCustomerRestaurantMenuPage({ restaurantId });

    expect(where).toHaveBeenCalledWith('isAvailable', '==', true);
    expect(orderBy).toHaveBeenCalledWith('category', 'asc');
    expect(documentId).toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith(24);
    expect(startAfter).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalled();
  });

  test('applies search, category and cursor constraints for a filtered customer page', async () => {
    const cursor = { id: 'item-24' } as any;

    (getDocs as jest.Mock).mockResolvedValueOnce({
      docs: [
        {
          id: 'item-25',
          data: () => ({ name: 'Pizza Royale', category: 'Pizzas', price: 14, isAvailable: true }),
        },
      ],
    });

    await getCustomerRestaurantMenuPage({
      restaurantId,
      search: 'Pizza',
      category: 'Pizzas',
      cursor,
      pageSize: 12,
    });

    expect(where).toHaveBeenCalledWith('isAvailable', '==', true);
    expect(where).toHaveBeenCalledWith('searchPrefixes', 'array-contains', 'pizza');
    expect(where).toHaveBeenCalledWith('category', '==', 'Pizzas');
    expect(startAfter).toHaveBeenCalledWith(cursor);
    expect(limit).toHaveBeenCalledWith(12);
  });

  test('reduces available menu categories into counts', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce({
      docs: [
        { id: 'item-1', data: () => ({ category: 'Pizzas', isAvailable: true }) },
        { id: 'item-2', data: () => ({ category: ' Pizzas ', isAvailable: true }) },
      ],
    });

    await expect(getCustomerRestaurantMenuCategories(restaurantId)).resolves.toEqual([
      { name: 'Pizzas', availableCount: 2 },
    ]);
  });
});
