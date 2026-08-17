import { getRestaurantMenuPaginated } from '../food-delivery.service';
import { getDocs, query, limit, startAfter, orderBy, collection, documentId } from 'firebase/firestore';

jest.mock('@/config/firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({ id: 'mock-id' })),
  getDocs: jest.fn(),
  query: jest.fn((...args) => ({ args })),
  where: jest.fn(),
  orderBy: jest.fn((field, dir) => ({ field, dir })),
  documentId: jest.fn(() => '__name__'),
  limit: jest.fn((count) => ({ limit: count })),
  startAfter: jest.fn((cursor) => ({ startAfter: cursor })),
  updateDoc: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  deleteField: jest.fn(),
}));

describe('food-menu-pagination service', () => {
  const restaurantId = 'resto-pagination-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loads first page with default limit 50 ordered by category and documentId', async () => {
    const mockDocs = Array.from({ length: 50 }, (_, i) => ({
      id: `item-${i + 1}`,
      data: () => ({ name: `Plat ${i + 1}`, category: 'Plats', price: 10 }),
    }));

    (getDocs as jest.Mock).mockResolvedValueOnce({
      docs: mockDocs,
    });

    const result = await getRestaurantMenuPaginated(restaurantId, 50, null);

    expect(result.items.length).toBe(50);
    expect(result.hasMore).toBe(true);
    expect(result.lastDoc?.id).toBe('item-50');
    expect(orderBy).toHaveBeenCalledWith('category', 'asc');
    expect(documentId).toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith(50);
  });

  test('loads next page with startAfter cursor and marks hasMore false when fewer items returned', async () => {
    const mockDocs = [
      { id: 'item-51', data: () => ({ name: 'Plat 51', category: 'Desserts', price: 6 }) },
      { id: 'item-52', data: () => ({ name: 'Plat 52', category: 'Desserts', price: 7 }) },
    ];

    (getDocs as jest.Mock).mockResolvedValueOnce({
      docs: mockDocs,
    });

    const mockCursor = { id: 'item-50' } as any;
    const result = await getRestaurantMenuPaginated(restaurantId, 50, mockCursor);

    expect(result.items.length).toBe(2);
    expect(result.hasMore).toBe(false);
    expect(result.lastDoc?.id).toBe('item-52');
    expect(startAfter).toHaveBeenCalledWith(mockCursor);
  });

  test('bounds pageSize between 1 and 100', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce({ docs: [] });
    await getRestaurantMenuPaginated(restaurantId, 250);
    expect(limit).toHaveBeenCalledWith(100);

    (getDocs as jest.Mock).mockResolvedValueOnce({ docs: [] });
    await getRestaurantMenuPaginated(restaurantId, -10);
    expect(limit).toHaveBeenCalledWith(1);
  });
});
