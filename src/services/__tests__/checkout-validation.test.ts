import type {
  CustomerMenuCustomizationPayload,
  CustomerMenuItemDetails,
  MenuItem,
  Restaurant,
} from '@/types/food-delivery';
import { buildCheckoutOrderItems, validateCustomerMenuCustomization } from '../checkout.service';
import { useCartStore } from '@/store/cartStore';

const details: CustomerMenuItemDetails = {
  itemId: 'item-1',
  modifierGroups: [
    {
      id: 'size',
      label: 'Taille',
      selectionType: 'single',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { id: 'regular', label: 'Normale', priceDelta: 0, isAvailable: true },
        { id: 'large', label: 'Grande', priceDelta: 3, isAvailable: true },
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
        { id: 'cheese', label: 'Fromage', priceDelta: 1, isAvailable: true },
        { id: 'bacon', label: 'Bacon', priceDelta: 2, isAvailable: true },
        { id: 'avocado', label: 'Avocat', priceDelta: 2, isAvailable: true },
      ],
    },
  ],
  supplements: [
    { id: 'drink', label: 'Boisson', price: 2, isAvailable: true },
    { id: 'sold-out-sauce', label: 'Sauce', price: 1, isAvailable: false },
  ],
  allergens: [],
  checkoutRules: { maxQuantity: 3 },
};

const payload = (overrides: Partial<CustomerMenuCustomizationPayload> = {}): CustomerMenuCustomizationPayload => ({
  itemId: 'item-1',
  quantity: 1,
  modifierSelections: [{ groupId: 'size', selectionType: 'single', optionIds: ['regular'] }],
  supplementIds: [],
  customizationPrice: 0,
  ...overrides,
});

const item: MenuItem = {
  id: 'item-1',
  restaurantId: 'restaurant-1',
  name: 'Burger maison',
  description: 'Burger frais',
  price: 10,
  category: 'Burgers',
  isAvailable: true,
  createdAt: {} as MenuItem['createdAt'],
  updatedAt: {} as MenuItem['updatedAt'],
};

const restaurant: Restaurant = {
  id: 'restaurant-1',
  ownerId: 'owner-1',
  name: 'Chez Medjira',
  description: 'Restaurant test',
  address: 'Douala',
  phone: '+237600000000',
  email: 'restaurant@example.com',
  cuisineType: ['Burgers'],
  avgPricePerPerson: 12,
  commissionRate: 10,
  status: 'approved',
  rating: 4.5,
  totalReviews: 20,
  stripeConnectStatus: 'active',
  createdAt: {} as Restaurant['createdAt'],
  updatedAt: {} as Restaurant['updatedAt'],
};

describe('customer menu checkout validation', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
  });

  it('rejects a required modifier group when it has no selection', () => {
    const result = validateCustomerMenuCustomization(details, payload({ modifierSelections: [] }));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'required_modifier_group' }),
    ]));
  });

  it('rejects multiple selections for a single-select group', () => {
    const result = validateCustomerMenuCustomization(details, payload({
      modifierSelections: [{ groupId: 'size', selectionType: 'single', optionIds: ['regular', 'large'] }],
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'single_selection_limit' }),
    ]));
  });

  it('rejects selections beyond a multiple-select group maximum', () => {
    const result = validateCustomerMenuCustomization(details, payload({
      modifierSelections: [
        { groupId: 'size', selectionType: 'single', optionIds: ['regular'] },
        { groupId: 'extras', selectionType: 'multiple', optionIds: ['cheese', 'bacon', 'avocado'] },
      ],
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'modifier_selection_limit' }),
    ]));
  });

  it('rejects unavailable supplements before checkout', () => {
    const result = validateCustomerMenuCustomization(details, payload({ supplementIds: ['sold-out-sauce'] }));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unavailable_supplement' }),
    ]));
  });

  it('keeps different customizations as separate cart lines', () => {
    useCartStore.getState().addCustomizedItem(item, restaurant, payload({
      modifierSelections: [{ groupId: 'size', selectionType: 'single', optionIds: ['regular'] }],
    }));
    useCartStore.getState().addCustomizedItem(item, restaurant, payload({
      modifierSelections: [{ groupId: 'size', selectionType: 'single', optionIds: ['large'] }],
      customizationPrice: 3,
    }));

    const items = useCartStore.getState().items;

    expect(items).toHaveLength(2);
    expect(new Set(items.map((cartItem) => cartItem.id)).size).toBe(2);
    expect(items.map((cartItem) => cartItem.customization?.modifierSelections)).toEqual(expect.arrayContaining([
      [{ groupId: 'size', selectionType: 'single', optionIds: ['regular'] }],
      [{ groupId: 'size', selectionType: 'single', optionIds: ['large'] }],
    ]));
  });

  it('builds checkout lines from the base menu id and preserves custom selections', () => {
    const [line] = buildCheckoutOrderItems([{
      ...item,
      menuItemId: item.id,
      quantity: 2,
      customization: {
        modifierSelections: [{ groupId: 'size', selectionType: 'single', optionIds: ['large'] }],
        supplementIds: ['drink'],
      },
    }]);

    expect(line).toEqual({
      menuItemId: 'item-1',
      itemName: 'Burger maison',
      itemQuantity: 2,
      itemPrice: 10,
      customization: {
        modifierSelections: [{ groupId: 'size', selectionType: 'single', optionIds: ['large'] }],
        supplementIds: ['drink'],
      },
    });
  });
});
