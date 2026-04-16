import { useCartStore, CartItem } from '@/store/cartStore';
import { MenuItem, Restaurant } from '@/types/food-delivery';

const menuItem1: MenuItem = {
  id: 'item-1',
  restaurantId: 'resto-1',
  name: 'Pizza Margherita',
  price: 12.5,
  description: 'Tomate, mozzarella',
  category: 'pizzas',
  isAvailable: true,
  createdAt: {} as MenuItem['createdAt'],
  updatedAt: {} as MenuItem['updatedAt'],
};

const menuItem2: MenuItem = {
  id: 'item-2',
  restaurantId: 'resto-1',
  name: 'Burger Classic',
  price: 9.99,
  description: 'Boeuf, salade, tomate',
  category: 'burgers',
  isAvailable: true,
  createdAt: {} as MenuItem['createdAt'],
  updatedAt: {} as MenuItem['updatedAt'],
};

const menuItem3: MenuItem = {
  id: 'item-3',
  restaurantId: 'resto-1',
  name: 'Salade Cesar',
  price: 8.5,
  category: 'salades',
  isAvailable: true,
  createdAt: {} as MenuItem['createdAt'],
  updatedAt: {} as MenuItem['updatedAt'],
};

const restaurant1: Restaurant = {
  id: 'resto-1',
  ownerId: 'owner-1',
  name: 'Pizzeria Roma',
  description: 'Authentique cuisine italienne',
  address: '123 Rue Principale',
  phone: '+15551234567',
  email: 'info@roma.com',
  cuisineType: ['Italienne'],
  avgPricePerPerson: 15,
  commissionRate: 0.15,
  status: 'approved',
  rating: 4.5,
  totalReviews: 120,
  isOpen: true,
  createdAt: {} as Restaurant['createdAt'],
  updatedAt: {} as Restaurant['updatedAt'],
};

const restaurant2: Restaurant = {
  id: 'resto-2',
  ownerId: 'owner-2',
  name: 'Burger Palace',
  description: 'Burgers artisanaux',
  address: '456 Avenue Centrale',
  phone: '+15559876543',
  email: 'info@burger.com',
  cuisineType: ['Americaine'],
  avgPricePerPerson: 12,
  commissionRate: 0.12,
  status: 'approved',
  rating: 4.2,
  totalReviews: 80,
  isOpen: true,
  createdAt: {} as Restaurant['createdAt'],
  updatedAt: {} as Restaurant['updatedAt'],
};

beforeEach(() => {
  useCartStore.getState().clearCart();
});

describe('cartStore', () => {
  describe('addItem', () => {
    it('ajoute un premier article et définit le restaurant', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].id).toBe('item-1');
      expect(state.items[0].quantity).toBe(1);
      expect(state.restaurant).not.toBeNull();
      expect(state.restaurant?.id).toBe('resto-1');
    });

    it('incrémente la quantité si le même article est ajouté', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem1, restaurant1);

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].quantity).toBe(2);
    });

    it('vide le panier et recommence si un article d\'un autre restaurant est ajouté', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem2, restaurant2);

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].id).toBe('item-2');
      expect(state.items[0].quantity).toBe(1);
      expect(state.restaurant?.id).toBe('resto-2');
    });

    it('ajoute un article différent du même restaurant', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem2, restaurant1);

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(2);
      expect(state.items[0].quantity).toBe(1);
      expect(state.items[1].quantity).toBe(1);
      expect(state.restaurant?.id).toBe('resto-1');
    });

    it('ajoute trois articles différents du même restaurant', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem2, restaurant1);
      useCartStore.getState().addItem(menuItem3, restaurant1);

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(3);
    });
  });

  describe('removeItem', () => {
    it('retire un article spécifique du panier', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem2, restaurant1);

      useCartStore.getState().removeItem('item-1');

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].id).toBe('item-2');
    });

    it('met le restaurant à null si le panier est vidé', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);

      useCartStore.getState().removeItem('item-1');

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(0);
      expect(state.restaurant).toBeNull();
    });

    it('ne fait rien si l\'article n\'existe pas', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);

      useCartStore.getState().removeItem('item-inexistant');

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
    });

    it('conserve le restaurant s\'il reste des articles', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem2, restaurant1);

      useCartStore.getState().removeItem('item-1');

      expect(useCartStore.getState().restaurant?.id).toBe('resto-1');
    });
  });

  describe('updateQuantity', () => {
    it('met à jour la quantité d\'un article', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);

      useCartStore.getState().updateQuantity('item-1', 5);

      const state = useCartStore.getState();
      expect(state.items[0].quantity).toBe(5);
    });

    it('retire l\'article si la quantité est 0', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);

      useCartStore.getState().updateQuantity('item-1', 0);

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(0);
      expect(state.restaurant).toBeNull();
    });

    it('retire l\'article si la quantité est négative', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);

      useCartStore.getState().updateQuantity('item-1', -3);

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(0);
    });

    it('ne modifie pas les autres articles lors de la mise à jour', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem2, restaurant1);

      useCartStore.getState().updateQuantity('item-1', 10);

      const state = useCartStore.getState();
      expect(state.items[0].quantity).toBe(10);
      expect(state.items[1].quantity).toBe(1);
    });
  });

  describe('clearCart', () => {
    it('vide le panier et supprime le restaurant', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem2, restaurant1);

      useCartStore.getState().clearCart();

      const state = useCartStore.getState();
      expect(state.items).toEqual([]);
      expect(state.restaurant).toBeNull();
    });

    it('fonctionne sur un panier déjà vide', () => {
      useCartStore.getState().clearCart();

      const state = useCartStore.getState();
      expect(state.items).toEqual([]);
      expect(state.restaurant).toBeNull();
    });
  });

  describe('getTotalItems', () => {
    it('retourne 0 pour un panier vide', () => {
      expect(useCartStore.getState().getTotalItems()).toBe(0);
    });

    it('retourne la somme des quantités de tous les articles', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem2, restaurant1);

      expect(useCartStore.getState().getTotalItems()).toBe(3);
    });

    it('retourne le bon total après mise à jour de quantité', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().updateQuantity('item-1', 4);

      expect(useCartStore.getState().getTotalItems()).toBe(4);
    });

    it('retourne le bon total après suppression d\'un article', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem2, restaurant1);
      useCartStore.getState().removeItem('item-1');

      expect(useCartStore.getState().getTotalItems()).toBe(1);
    });
  });

  describe('getSubtotal', () => {
    it('retourne 0 pour un panier vide', () => {
      expect(useCartStore.getState().getSubtotal()).toBe(0);
    });

    it('calcule le sous-total correctement avec un seul article', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().updateQuantity('item-1', 2);

      expect(useCartStore.getState().getSubtotal()).toBe(25);
    });

    it('calcule le sous-total correctement avec plusieurs articles', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem2, restaurant1);

      const expected = 12.5 * 2 + 9.99;
      expect(useCartStore.getState().getSubtotal()).toBeCloseTo(expected, 2);
    });

    it('recalcule après suppression d\'un article', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem2, restaurant1);
      useCartStore.getState().removeItem('item-1');

      expect(useCartStore.getState().getSubtotal()).toBe(9.99);
    });

    it('recalcule après mise à jour de quantité', () => {
      useCartStore.getState().addItem(menuItem1, restaurant1);
      useCartStore.getState().addItem(menuItem2, restaurant1);
      useCartStore.getState().updateQuantity('item-2', 3);

      const expected = 12.5 + 9.99 * 3;
      expect(useCartStore.getState().getSubtotal()).toBeCloseTo(expected, 2);
    });
  });
});
