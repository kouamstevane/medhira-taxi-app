jest.mock('firebase/app', () => ({
  getApps: jest.fn(() => [{}]),
  getApp: jest.fn(() => ({})),
}));

jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  limit: jest.fn(),
  startAfter: jest.fn(),
  onSnapshot: jest.fn(),
  setDoc: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({
  db: {},
}));

import { httpsCallable } from 'firebase/functions';
import { FoodDeliveryService } from '@/services/food-delivery.service';

describe('FoodDeliveryService.createFoodOrder', () => {
  test('returns server-verified totals without charging the wallet immediately', async () => {
    const createCallable = jest.fn().mockResolvedValue({
      data: {
        orderId: 'food_123',
        basePrice: 30,
        deliveryCost: 9,
        totalOrderPrice: 39,
        deliveryDistance: 5,
      },
    });
    (httpsCallable as jest.Mock).mockReturnValue(createCallable);

    const result = await FoodDeliveryService.createFoodOrder({
      userId: 'client_1',
      restaurantId: 'restaurant_1',
      orderItems: [
        { menuItemId: 'item_1', itemName: 'Plat', itemPrice: 30, itemQuantity: 1 },
      ],
      deliveryDistance: 1,
      isWeekend: true,
      deliveryAddress: '123 Rue Test',
      paymentMethod: 'wallet',
    });

    expect(result).toEqual({
      orderId: 'food_123',
      basePrice: 30,
      deliveryCost: 9,
      totalOrderPrice: 39,
      deliveryDistance: 5,
    });
    expect(httpsCallable).toHaveBeenCalledTimes(1);
  });

  test('sends a card payment method and populated delivery options to the callable', async () => {
    const createCallable = jest.fn().mockResolvedValue({
      data: {
        orderId: 'food_card_123',
        basePrice: 30,
        deliveryCost: 9,
        totalOrderPrice: 39,
        deliveryDistance: 5,
      },
    });
    (httpsCallable as jest.Mock).mockReturnValue(createCallable);

    await FoodDeliveryService.createFoodOrder({
      userId: 'client_1',
      restaurantId: 'restaurant_1',
      orderItems: [{ menuItemId: 'item_1', itemName: 'Plat', itemPrice: 30, itemQuantity: 1 }],
      deliveryDistance: 5,
      isWeekend: true,
      deliveryAddress: '123 Rue Test, Edmonton',
      deliveryPreference: 'meet_at_door',
      deliveryInstructions: 'Porte gauche',
      paymentMethod: 'card',
    });

    expect(createCallable).toHaveBeenCalledWith({
      restaurantId: 'restaurant_1',
      orderItems: [{ menuItemId: 'item_1', itemName: 'Plat', itemPrice: 30, itemQuantity: 1 }],
      isWeekend: true,
      deliveryAddress: '123 Rue Test, Edmonton',
      deliveryPreference: 'meet_at_door',
      deliveryInstructions: 'Porte gauche',
      paymentMethod: 'card',
    });
  });

  test('does not send empty or undefined optional fields', async () => {
    const createCallable = jest.fn().mockResolvedValue({
      data: {
        orderId: 'food_clean_123',
        basePrice: 30,
        deliveryCost: 9,
        totalOrderPrice: 39,
        deliveryDistance: 5,
      },
    });
    (httpsCallable as jest.Mock).mockReturnValue(createCallable);

    await FoodDeliveryService.createFoodOrder({
      userId: 'client_1',
      restaurantId: 'restaurant_1',
      orderItems: [{ menuItemId: 'item_1', itemName: 'Plat', itemPrice: 30, itemQuantity: 1 }],
      deliveryDistance: 5,
      isWeekend: false,
      deliveryAddress: '123 Rue Test, Edmonton',
      deliveryInstructions: '   ',
      customerPhone: '',
      clientNeighbourhood: '   ',
      cityId: undefined,
      paymentMethod: 'card',
    });

    expect(createCallable).toHaveBeenCalledWith({
      restaurantId: 'restaurant_1',
      orderItems: [{ menuItemId: 'item_1', itemName: 'Plat', itemPrice: 30, itemQuantity: 1 }],
      isWeekend: false,
      deliveryAddress: '123 Rue Test, Edmonton',
      paymentMethod: 'card',
    });
  });
});
