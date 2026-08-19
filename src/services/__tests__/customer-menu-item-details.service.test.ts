import { getCustomerMenuItemDetails } from '../food-delivery.service';
import type { CustomerMenuItemDetails } from '@/types/food-delivery';
import { doc, getDoc, getDocs } from 'firebase/firestore';

jest.mock('@/config/firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn((...args) => ({ args })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  getCountFromServer: jest.fn(),
  query: jest.fn((...args) => ({ args })),
  where: jest.fn((...args) => ({ args })),
  orderBy: jest.fn((...args) => ({ args })),
  updateDoc: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(),
  deleteField: jest.fn(),
  limit: jest.fn((count) => ({ count })),
  startAfter: jest.fn((cursor) => ({ cursor })),
  documentId: jest.fn(() => '__name__'),
  onSnapshot: jest.fn(),
  writeBatch: jest.fn(() => ({ update: jest.fn(), commit: jest.fn(() => Promise.resolve()) })),
  Timestamp: { fromDate: jest.fn((value) => value) },
}));

describe('customer menu item details service', () => {
  const restaurantId = 'resto-details-1';
  const itemId = 'item-details-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('deserializes legacy menu items with empty V2 detail collections', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce({
      exists: () => true,
      id: itemId,
      data: () => ({
        description: 'Classic legacy item',
        imageUrl: 'https://cdn.example.com/legacy-item.png',
      }),
    });

    const result: CustomerMenuItemDetails | null = await getCustomerMenuItemDetails(restaurantId, itemId);

    expect(result).toEqual({
      itemId,
      description: 'Classic legacy item',
      imageUrl: 'https://cdn.example.com/legacy-item.png',
      modifierGroups: [],
      supplements: [],
      allergens: [],
      checkoutRules: {},
    });
    expect(result?.nutrition).toBeUndefined();
  });

  test('returns only available modifier options and supplements while preserving defaults and sparse nutrition', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce({
      exists: () => true,
      id: itemId,
      data: () => ({
        description: 'Build your bowl',
        modifierGroups: [
          {
            id: 'size',
            label: 'Size',
            selectionType: 'single',
            required: true,
            minSelections: 1,
            maxSelections: 1,
            options: [
              { id: 'regular', label: 'Regular', priceDelta: 0, isDefault: true, isAvailable: true },
              { id: 'large', label: 'Large', priceDelta: 4, isAvailable: false },
            ],
          },
          {
            id: 'extras',
            label: 'Extras',
            selectionType: 'multiple',
            required: false,
            minSelections: 0,
            maxSelections: 2,
            options: [
              { id: 'avocado', label: 'Avocado', priceDelta: 2.5, isAvailable: true },
              { id: 'bacon', label: 'Bacon', priceDelta: 3, isAvailable: false },
            ],
          },
        ],
        supplements: [
          { id: 'drink', label: 'Soft drink', price: 2, isAvailable: true },
          { id: 'dessert', label: 'Brownie', price: 4, isAvailable: false },
        ],
        allergens: [
          { code: 'GLUTEN', label: 'Gluten' },
          { code: 'MILK', label: 'Milk' },
        ],
        nutrition: {
          calories: 640,
          proteinGrams: 28,
        },
        checkoutRules: {
          allowZeroQuantity: false,
          maxQuantity: 4,
        },
      }),
    });

    const result = await getCustomerMenuItemDetails(restaurantId, itemId);

    expect(result).toEqual({
      itemId,
      description: 'Build your bowl',
      modifierGroups: [
        {
          id: 'size',
          label: 'Size',
          selectionType: 'single',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          options: [
            { id: 'regular', label: 'Regular', priceDelta: 0, isDefault: true, isAvailable: true },
          ],
        },
        {
          id: 'extras',
          label: 'Extras',
          selectionType: 'multiple',
          required: false,
          minSelections: 0,
          maxSelections: 2,
          options: [
            { id: 'avocado', label: 'Avocado', priceDelta: 2.5, isAvailable: true },
          ],
        },
      ],
      supplements: [
        { id: 'drink', label: 'Soft drink', price: 2, isAvailable: true },
      ],
      allergens: [
        { code: 'GLUTEN', label: 'Gluten' },
        { code: 'MILK', label: 'Milk' },
      ],
      nutrition: {
        calories: 640,
        proteinGrams: 28,
      },
      checkoutRules: {
        allowZeroQuantity: false,
        maxQuantity: 4,
      },
    });
    expect(result?.nutrition).not.toHaveProperty('carbsGrams');
    expect(result?.nutrition).not.toHaveProperty('fatGrams');
    expect(result?.nutrition).not.toHaveProperty('saltGrams');
  });

  test('reads checkout rules from a dedicated item detail lookup', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce({
      exists: () => true,
      id: itemId,
      data: () => ({
        checkoutRules: {
          allowZeroQuantity: true,
          maxQuantity: 8,
        },
      }),
    });

    const result = await getCustomerMenuItemDetails(restaurantId, itemId);

    expect(result?.checkoutRules).toEqual({
      allowZeroQuantity: true,
      maxQuantity: 8,
    });
    expect(doc).toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });
});
