const mockDoc = jest.fn((...args: unknown[]) => ({ args }));
const mockUpdateDoc = jest.fn().mockResolvedValue(undefined);
const mockServerTimestamp = jest.fn(() => 'server-timestamp');

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  serverTimestamp: () => mockServerTimestamp(),
  deleteField: jest.fn(),
  limit: jest.fn(),
  startAfter: jest.fn(),
  onSnapshot: jest.fn(),
  setDoc: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({ db: { name: 'test-db' } }));

import { FoodDeliveryService } from '@/services/food-delivery.service';
import type { RestaurantOpeningHours } from '@/utils/restaurant-hours';

describe('restaurant opening hours service', () => {
  beforeEach(() => {
    mockDoc.mockClear();
    mockUpdateDoc.mockClear();
    mockServerTimestamp.mockClear();
  });

  it('updates only opening hours and updatedAt', async () => {
    const openingHours = {
      monday: { open: '09:00', close: '22:00', closed: false },
      tuesday: { open: '09:00', close: '22:00', closed: false },
      wednesday: { open: '09:00', close: '22:00', closed: false },
      thursday: { open: '09:00', close: '22:00', closed: false },
      friday: { open: '09:00', close: '22:00', closed: false },
      saturday: { open: '09:00', close: '22:00', closed: false },
      sunday: { open: '09:00', close: '22:00', closed: true },
    } satisfies RestaurantOpeningHours;

    await FoodDeliveryService.updateRestaurantOpeningHours('restaurant-1', openingHours);

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      { args: [{ name: 'test-db' }, 'restaurants', 'restaurant-1'] },
      { openingHours, updatedAt: 'server-timestamp' },
    );
  });
});
