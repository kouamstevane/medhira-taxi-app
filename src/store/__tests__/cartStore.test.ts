import { useCartStore } from '../cartStore';
import type { MenuItem, Restaurant } from '@/types/food-delivery';

const restaurant: Restaurant = {
  id: 'restaurant-1',
  ownerId: 'owner-1',
  name: 'Chez Medjira',
  description: 'Cuisine généreuse',
  address: '1 rue de la Paix',
  phone: '+33102030405',
  email: 'contact@medjira.test',
  cuisineType: ['Africaine'],
  avgPricePerPerson: 18,
  commissionRate: 12,
  status: 'approved',
  rating: 4.8,
  totalReviews: 34,
  stripeConnectStatus: 'active',
  createdAt: {} as Restaurant['createdAt'],
  updatedAt: {} as Restaurant['updatedAt'],
};

const item: MenuItem = {
  id: 'item-1',
  restaurantId: restaurant.id,
  name: 'Burger signature',
  description: 'Un classique revisité.',
  price: 12,
  category: 'Plats',
  isAvailable: true,
  createdAt: {} as MenuItem['createdAt'],
  updatedAt: {} as MenuItem['updatedAt'],
};

const secondItem: MenuItem = {
  ...item,
  id: 'item-2',
  name: 'Salade fraîcheur',
};

describe('cartStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useCartStore.setState({ items: [], restaurant: null });
  });

  it('keeps legacy items flat and stores configured selections with their checkout rules as separate cart lines', () => {
    useCartStore.getState().addItem(item, restaurant, 1);
    useCartStore.getState().addCustomizedItem(item, restaurant, {
      itemId: item.id,
      quantity: 2,
      modifierSelections: [
        { groupId: 'size', selectionType: 'single', optionIds: ['large'] },
      ],
      supplementIds: ['drink'],
      checkoutRules: { maxQuantity: 3 },
      customizationPrice: 4.5,
    });
    useCartStore.getState().addCustomizedItem(item, restaurant, {
      itemId: item.id,
      quantity: 2,
      modifierSelections: [
        { groupId: 'size', selectionType: 'single', optionIds: ['large'] },
      ],
      supplementIds: ['drink'],
      checkoutRules: { maxQuantity: 3 },
      customizationPrice: 4.5,
    });

    const state = useCartStore.getState();

    expect(state.restaurant?.id).toBe(restaurant.id);
    expect(state.items).toHaveLength(2);
    expect(state.items[0]).toEqual(expect.objectContaining({
      id: item.id,
      quantity: 1,
    }));
    expect(state.items[1]).toEqual(expect.objectContaining({
      menuItemId: item.id,
      quantity: 3,
      price: 16.5,
      customization: {
        modifierSelections: [
          { groupId: 'size', selectionType: 'single', optionIds: ['large'] },
        ],
        supplementIds: ['drink'],
        checkoutRules: { maxQuantity: 3 },
      },
    }));
  });

  it('increments the quantity when the same legacy item is added twice', () => {
    useCartStore.getState().addItem(secondItem, restaurant, 1);
    useCartStore.getState().addItem(item, restaurant, 1);
    useCartStore.getState().addItem(item, restaurant, 1);

    const state = useCartStore.getState();

    expect(state.items).toHaveLength(2);
    expect(state.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: secondItem.id,
        quantity: 1,
      }),
      expect.objectContaining({
        id: item.id,
        quantity: 2,
      }),
    ]));
    expect(state.items.find((cartItem) => cartItem.id === item.id)).toEqual(expect.objectContaining({
      id: item.id,
      quantity: 2,
    }));
  });
});
