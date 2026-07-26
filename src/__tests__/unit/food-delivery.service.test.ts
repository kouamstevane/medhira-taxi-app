import {
  calculateBasePrice,
  calculateDeliveryCost,
  calculateTotalOrderPrice,
} from '@/services/food-delivery.service';
import type { OrderItem } from '@/types/food-delivery';

describe('FoodDeliveryService — Unit Tests', () => {
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
});
