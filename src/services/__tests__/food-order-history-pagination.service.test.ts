import { getRestaurantOrderHistoryPage } from '../food-delivery.service';
import { getDocs, limit, orderBy, startAfter, where } from 'firebase/firestore';

jest.mock('@/config/firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({ id: 'mock-id' })),
  getDocs: jest.fn(),
  Timestamp: {
    fromDate: jest.fn((date: Date) => ({ date })),
  },
  query: jest.fn((...args) => ({ args })),
  where: jest.fn((field, operator, value) => ({ field, operator, value })),
  orderBy: jest.fn((field, direction) => ({ field, direction })),
  limit: jest.fn((count) => ({ count })),
  startAfter: jest.fn((cursor) => ({ cursor })),
  onSnapshot: jest.fn(),
  updateDoc: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  deleteField: jest.fn(),
}));

describe('food order history pagination service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loads a capped first page ordered by newest history order', async () => {
    const mockDocs = Array.from({ length: 25 }, (_, index) => ({
      id: `order-${index + 1}`,
      data: () => ({ status: 'delivered', createdAt: { seconds: index } }),
    }));
    (getDocs as jest.Mock).mockResolvedValueOnce({ docs: mockDocs });

    const result = await getRestaurantOrderHistoryPage('restaurant-1', {
      dateKey: '2026-08-14',
    });

    expect(result.orders).toHaveLength(25);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor?.id).toBe('order-25');
    expect(where).toHaveBeenCalledWith('restaurantId', '==', 'restaurant-1');
    expect(where).toHaveBeenCalledWith('status', 'in', [
      'delivered',
      'no_driver_available',
      'cancelled',
      'cancelled_by_restaurant',
    ]);
    expect(where).toHaveBeenCalledWith('createdAt', '>=', expect.objectContaining({
      date: new Date(2026, 7, 14),
    }));
    expect(where).toHaveBeenCalledWith('createdAt', '<', expect.objectContaining({
      date: new Date(2026, 7, 15),
    }));
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(limit).toHaveBeenCalledWith(25);
  });

  test('uses the previous cursor for the next page and stops when exhausted', async () => {
    const cursor = { id: 'order-25' } as never;
    const mockDocs = [
      { id: 'order-26', data: () => ({ status: 'cancelled' }) },
      { id: 'order-27', data: () => ({ status: 'delivered' }) },
    ];
    (getDocs as jest.Mock).mockResolvedValueOnce({ docs: mockDocs });

    const result = await getRestaurantOrderHistoryPage('restaurant-1', {
      dateKey: '2026-08-14',
      cursor,
      pageSize: 25,
    });

    expect(result.orders.map((order) => order.id)).toEqual(['order-26', 'order-27']);
    expect(result.hasMore).toBe(false);
    expect(startAfter).toHaveBeenCalledWith(cursor);
  });

  test('bounds the requested page size to protect the query', async () => {
    (getDocs as jest.Mock).mockResolvedValue({ docs: [] });

    await getRestaurantOrderHistoryPage('restaurant-1', { dateKey: '2026-08-14', pageSize: 250 });
    expect(limit).toHaveBeenCalledWith(50);

    await getRestaurantOrderHistoryPage('restaurant-1', { dateKey: '2026-08-14', pageSize: -10 });
    expect(limit).toHaveBeenCalledWith(1);
  });
});
