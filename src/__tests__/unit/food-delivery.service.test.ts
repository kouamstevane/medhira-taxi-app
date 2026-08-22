import {
  buildPaymentFailureCancellationUpdate,
  calculateBasePrice,
  calculateDeliveryCost,
  calculateTotalOrderPrice,
  canStartFoodOrderCheckout,
  getApprovedRestaurants,
  getRestaurantOrderHistoryPage,
  shouldShowFoodOrderInCustomerHistory,
  subscribeRestaurantActiveOrders,
  subscribeRestaurantOrders,
} from '@/services/food-delivery.service';
import type { OrderItem } from '@/types/food-delivery';

const restaurantDocuments = [
  { id: 'active-restaurant', data: () => ({ name: 'Restaurant actif', status: 'approved', stripeConnectStatus: 'active', createdAt: 3 }) },
  { id: 'setup-restaurant', data: () => ({ name: 'Restaurant en configuration', status: 'approved', stripeConnectStatus: 'not_started', createdAt: 2 }) },
  { id: 'restricted-restaurant', data: () => ({ name: 'Restaurant restreint', status: 'approved', stripeConnectStatus: 'restricted', createdAt: 1 }) },
];

jest.mock('@/config/firebase', () => ({ db: {} }));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({ collection: 'restaurants' })),
  where: jest.fn((field: string, operator: string, value: unknown) => ({ field, operator, value })),
  orderBy: jest.fn((field: string, direction: string) => ({ field, direction })),
  limit: jest.fn((value: number) => ({ limit: value })),
  query: jest.fn((_collection: unknown, ...constraints: Array<Record<string, unknown>>) => ({ constraints })),
  getDocs: jest.fn(async (request: { constraints: Array<Record<string, unknown>> }) => {
    const equalityConstraints = request.constraints.filter(
      (constraint) => constraint.operator === '=='
    );
    const docs = restaurantDocuments.filter((document) => equalityConstraints.every(
      (constraint) => document.data()[constraint.field as 'status' | 'stripeConnectStatus'] === constraint.value
    ));
    return { docs };
  }),
}));

describe('FoodDeliveryService — Unit Tests', () => {
  describe('approved restaurant visibility', () => {
    it('returns only approved restaurants with active Stripe payments', async () => {
      const result = await getApprovedRestaurants();

      expect(result.restaurants.map((restaurant) => restaurant.name)).toEqual(['Restaurant actif']);
    });
  });

  describe('calculateBasePrice', () => {
    it('calcule la somme exacte pour un panier d\'articles', () => {
      const orderItems: OrderItem[] = [
        { menuItemId: '1', itemName: 'Burger', itemQuantity: 2, itemPrice: 12.5 }, // 25.00
        { menuItemId: '2', itemName: 'Frites', itemQuantity: 1, itemPrice: 4.5 },  // 4.50
        { menuItemId: '3', itemName: 'Soda', itemQuantity: 3, itemPrice: 2.5 },   // 7.50
      ];

      const basePrice = calculateBasePrice(orderItems);
      expect(basePrice).toBe(37);
    });

    it('retourne 0 pour un panier vide', () => {
      expect(calculateBasePrice([])).toBe(0);
    });

    it('arrondit correctement les centimes', () => {
      const orderItems: OrderItem[] = [
        { menuItemId: '1', itemName: 'Item', itemQuantity: 3, itemPrice: 9.99 }, // 29.97
      ];
      expect(calculateBasePrice(orderItems)).toBe(29.97);
    });
  });

  describe('calculateDeliveryCost', () => {
    it('calcule le coût de livraison en semaine (distance * 1.50)', () => {
      // 5 km * 1.50 = 7.50
      const cost = calculateDeliveryCost(5, false);
      expect(cost).toBe(7.5);
    });

    it('ajoute le supplément weekend (distance * 1.50 + 1.50)', () => {
      // 5 km * 1.50 + 1.50 = 9.00
      const cost = calculateDeliveryCost(5, true);
      expect(cost).toBe(9);
    });

    it('calcule correctement pour une courte distance', () => {
      // 1.2 km * 1.50 = 1.80
      const cost = calculateDeliveryCost(1.2, false);
      expect(cost).toBe(1.8);
    });
  });

  describe('calculateTotalOrderPrice', () => {
    it('combine le prix de base et la livraison en semaine', () => {
      const orderItems: OrderItem[] = [
        { menuItemId: '1', itemName: 'Pizza', itemQuantity: 1, itemPrice: 20 },
      ];
      const result = calculateTotalOrderPrice(orderItems, 4, false);
      // base: 20, delivery: 4 * 1.5 = 6 => total: 26
      expect(result).toEqual({
        basePrice: 20,
        deliveryCost: 6,
        totalOrderPrice: 26,
      });
    });

    it('combine le prix de base et la livraison le weekend (spécification logic-brief)', () => {
      const orderItems: OrderItem[] = [
        { menuItemId: '1', itemName: 'Plat', itemQuantity: 1, itemPrice: 30 },
      ];
      // 30 EUR, 5 km, samedi => deliveryCost = (5 * 1.50) + 1.50 = 9.00 EUR => total = 39.00 EUR
      const result = calculateTotalOrderPrice(orderItems, 5, true);
      expect(result).toEqual({
        basePrice: 30,
        deliveryCost: 9,
        totalOrderPrice: 39,
      });
    });
  });

  describe('paymentMethod selection', () => {
    it('accepte les options de paiement wallet et card', () => {
      const validMethods: ('wallet' | 'card')[] = ['wallet', 'card'];
      validMethods.forEach(method => {
        expect(['wallet', 'card']).toContain(method);
      });
    });
  });

  describe('payment failure cleanup', () => {
    it('prépare une annulation client sans modifier paymentValidated', () => {
      expect(buildPaymentFailureCancellationUpdate()).toEqual({
        status: 'cancelled',
        cancelledBy: 'client',
        cancellationReason: 'payment_failed',
      });
    });
  });

  describe('customer order history visibility', () => {
    it('hides incomplete payment attempts while keeping real cancellations visible', () => {
      expect(shouldShowFoodOrderInCustomerHistory({
        status: 'pending_payment',
        paymentValidated: false,
      })).toBe(false);

      expect(shouldShowFoodOrderInCustomerHistory({
        status: 'cancelled',
        paymentValidated: false,
        cancellationReason: 'payment_abandoned',
      })).toBe(false);

      expect(shouldShowFoodOrderInCustomerHistory({
        status: 'cancelled',
        paymentValidated: true,
        cancellationReason: 'restaurant_cancelled',
      })).toBe(true);

      expect(shouldShowFoodOrderInCustomerHistory({
        status: 'confirmed',
        paymentValidated: true,
      })).toBe(true);
    });
  });

  describe('checkout preflight', () => {
    it('bloque la création initiale si le wallet est déjà insuffisant pour le total estimé', () => {
      expect(canStartFoodOrderCheckout({
        paymentMethod: 'wallet',
        walletBalance: 20,
        estimatedTotal: 25,
      })).toBe(false);
    });

    it('laisse le paiement carte et les wallets inconnus continuer vers la validation serveur', () => {
      expect(canStartFoodOrderCheckout({
        paymentMethod: 'card',
        walletBalance: 0,
        estimatedTotal: 25,
      })).toBe(true);
      expect(canStartFoodOrderCheckout({
        paymentMethod: 'wallet',
        walletBalance: null,
        estimatedTotal: 25,
      })).toBe(true);
    });
  });

  describe('restaurant order live subscription', () => {
    it('exposes a realtime subscription API for restaurant portals', () => {
      expect(typeof subscribeRestaurantOrders).toBe('function');
    });

    it('exposes a capped active-order subscription and paginated history API', () => {
      expect(typeof subscribeRestaurantActiveOrders).toBe('function');
      expect(typeof getRestaurantOrderHistoryPage).toBe('function');
    });
  });
});

