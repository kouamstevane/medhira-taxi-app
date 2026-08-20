import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RestaurantMenuList } from '../RestaurantMenuList';
import { useCartStore } from '@/store/cartStore';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import type { CustomerMenuItemDetails, MenuItem, Restaurant } from '@/types/food-delivery';

jest.mock('@/services/food-delivery.service', () => ({
  FoodDeliveryService: {
    getCustomerMenuItemDetails: jest.fn(),
  },
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: () => <span aria-hidden="true" />,
}));

const mockedGetCustomerMenuItemDetails = FoodDeliveryService.getCustomerMenuItemDetails as jest.Mock;

const restaurant: Restaurant = {
  id: 'restaurant-1',
  ownerId: 'owner-1',
  name: 'Chez Medjira',
  description: 'Cuisine généreuse',
  address: 'Douala',
  phone: '+237600000000',
  email: 'contact@medjira.test',
  cuisineType: ['Africaine'],
  avgPricePerPerson: 12,
  commissionRate: 10,
  status: 'approved',
  rating: 4.5,
  totalReviews: 20,
  isOpen: true,
  stripeConnectStatus: 'active',
  createdAt: {} as Restaurant['createdAt'],
  updatedAt: {} as Restaurant['updatedAt'],
};

const richItem: MenuItem = {
  id: 'item-rich',
  restaurantId: restaurant.id,
  name: 'Burger signature',
  description: 'Burger maison',
  price: 10,
  category: 'Burgers',
  isAvailable: true,
  createdAt: {} as MenuItem['createdAt'],
  updatedAt: {} as MenuItem['updatedAt'],
};

const legacyItem: MenuItem = {
  id: 'item-legacy',
  restaurantId: restaurant.id,
  name: 'Frites maison',
  description: 'Frites croustillantes',
  price: 4,
  category: 'Accompagnements',
  isAvailable: true,
  createdAt: {} as MenuItem['createdAt'],
  updatedAt: {} as MenuItem['updatedAt'],
};

const richDetails: CustomerMenuItemDetails = {
  itemId: richItem.id,
  description: 'Burger personnalisable',
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
        { id: 'large', label: 'Grande', priceDelta: 2, isAvailable: true },
      ],
    },
  ],
  supplements: [
    { id: 'drink', label: 'Boisson', price: 2, isAvailable: true },
  ],
  allergens: [],
  nutrition: { calories: 640 },
  checkoutRules: { maxQuantity: 3 },
};

describe('customer menu V2 integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCartStore.getState().clearCart();
    mockedGetCustomerMenuItemDetails.mockImplementation(async (_restaurantId: string, itemId: string) => {
      if (itemId === richItem.id) return richDetails;
      if (itemId === legacyItem.id) {
        return {
          itemId: legacyItem.id,
          modifierGroups: [],
          supplements: [],
          allergens: [],
          checkoutRules: {},
        } satisfies CustomerMenuItemDetails;
      }
      return null;
    });
  });

  it('carries a rich menu item from the restaurant list through customization into the cart', async () => {
    const user = userEvent.setup();

    render(
      <RestaurantMenuList
        restaurant={restaurant}
        items={[richItem]}
        search=""
        category={null}
        isLoading={false}
        isLoadingMore={false}
        error={null}
        hasMore={false}
        onLoadMore={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ajouter Burger signature au panier' }));

    const detailsDialog = await screen.findByRole('region', { name: 'Détails de Burger signature' });
    expect(within(detailsDialog).getByRole('heading', { name: 'Burger signature' })).toBeInTheDocument();
    expect(within(detailsDialog).getByText('640 kcal')).toBeInTheDocument();
    expect(mockedGetCustomerMenuItemDetails).toHaveBeenCalledWith(restaurant.id, richItem.id);

    await user.click(within(detailsDialog).getByRole('radio', { name: 'Grande' }));
    await user.click(within(detailsDialog).getByRole('checkbox', { name: 'Boisson' }));
    await user.click(within(detailsDialog).getByRole('button', { name: 'Ajouter au panier' }));

    await waitFor(() => {
      expect(useCartStore.getState().items).toHaveLength(1);
    });

    const [cartItem] = useCartStore.getState().items;
    expect(cartItem.menuItemId).toBe(richItem.id);
    expect(cartItem.quantity).toBe(1);
    expect(cartItem.price).toBe(14);
    expect(cartItem.customization).toEqual({
      modifierSelections: [
        { groupId: 'size', selectionType: 'single', optionIds: ['large'] },
      ],
      supplementIds: ['drink'],
      checkoutRules: { maxQuantity: 3 },
    });
    expect(screen.queryByRole('region', { name: 'Détails de Burger signature' })).not.toBeInTheDocument();
  });

  it('keeps the legacy quick-add path functional when an item has no V2 choices', async () => {
    const user = userEvent.setup();

    render(
      <RestaurantMenuList
        restaurant={restaurant}
        items={[legacyItem]}
        search=""
        category={null}
        isLoading={false}
        isLoadingMore={false}
        error={null}
        hasMore={false}
        onLoadMore={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ajouter Frites maison au panier' }));
    const detailsDialog = await screen.findByRole('region', { name: 'Détails de Frites maison' });
    expect(within(detailsDialog).getByRole('heading', { name: 'Frites maison' })).toBeInTheDocument();
    await user.click(within(detailsDialog).getByRole('button', { name: 'Ajouter au panier' }));

    await waitFor(() => {
      expect(useCartStore.getState().items).toHaveLength(1);
    });

    const [cartItem] = useCartStore.getState().items;
    expect(cartItem.id).toBe(legacyItem.id);
    expect(cartItem.menuItemId).toBe(legacyItem.id);
    expect(cartItem.quantity).toBe(1);
    expect(cartItem.customization).toBeUndefined();
  });
});
