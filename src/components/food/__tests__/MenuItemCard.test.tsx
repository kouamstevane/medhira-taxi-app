import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MenuItemCard } from '../MenuItemCard';
import { useCartStore } from '@/store/cartStore';
import type { MenuItem, Restaurant } from '@/types/food-delivery';

jest.mock('@/store/cartStore', () => ({
  useCartStore: jest.fn(),
}));

jest.mock('@/components/food/MenuItemImage', () => ({
  MenuItemImage: ({ alt }: { alt: string }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} />;
  },
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: () => <span aria-hidden="true" />,
}));

jest.mock('@/components/food/CustomerMenuItemDetails', () => ({
  CustomerMenuItemDetails: ({
    isOpen,
    item,
    onClose,
    onAddToCart,
  }: {
    isOpen: boolean;
    item: MenuItem;
    onClose: () => void;
    onAddToCart?: (payload: {
      itemId: string;
      quantity: number;
      modifierSelections: Array<{
        groupId: string;
        selectionType: 'single' | 'multiple';
        optionIds: string[];
      }>;
      supplementIds: string[];
      checkoutRules?: {
        allowZeroQuantity?: boolean;
        maxQuantity?: number;
      };
    }) => void;
  }) => {
    if (!isOpen) return null;

    return (
      <div>
        <p>Détails de {item.name}</p>
        <button
          type="button"
          onClick={() =>
            onAddToCart?.({
              itemId: item.id,
              quantity: 2,
              modifierSelections: [],
              supplementIds: [],
              customizationPrice: 0,
            })
          }
        >
          Ajouter en héritage
        </button>
        <button
          type="button"
          onClick={() =>
            onAddToCart?.({
              itemId: item.id,
              quantity: 1,
              modifierSelections: [
                { groupId: 'size', selectionType: 'single', optionIds: ['large'] },
              ],
              supplementIds: ['drink'],
              checkoutRules: { maxQuantity: 3 },
              customizationPrice: 4.5,
            })
          }
        >
          Ajouter personnalisé
        </button>
        <button type="button" onClick={onClose}>
          Fermer
        </button>
      </div>
    );
  },
}));

const mockUseCartStore = useCartStore as unknown as jest.Mock;

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

describe('MenuItemCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the customer details flow and forwards customized selections into the cart path', async () => {
    const user = userEvent.setup();
    const addItem = jest.fn();
    const addCustomizedItem = jest.fn();

    mockUseCartStore.mockReturnValue({
      items: [],
      addItem,
      addCustomizedItem,
      updateQuantity: jest.fn(),
    });

    render(<MenuItemCard item={item} restaurant={restaurant} />);

    await user.click(screen.getByRole('button', { name: 'Ajouter Burger signature au panier' }));
    expect(screen.getByText('Détails de Burger signature')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ajouter personnalisé' }));

    expect(addCustomizedItem).toHaveBeenCalledWith(item, restaurant, {
      itemId: item.id,
      quantity: 1,
      modifierSelections: [
        { groupId: 'size', selectionType: 'single', optionIds: ['large'] },
      ],
      supplementIds: ['drink'],
      checkoutRules: { maxQuantity: 3 },
      customizationPrice: 4.5,
    });
    expect(addItem).not.toHaveBeenCalled();
    expect(screen.queryByText('Détails de Burger signature')).not.toBeInTheDocument();
  });

  it('falls back to the legacy add path for items without V2 metadata', async () => {
    const user = userEvent.setup();
    const addItem = jest.fn();
    const addCustomizedItem = jest.fn();

    mockUseCartStore.mockReturnValue({
      items: [],
      addItem,
      addCustomizedItem,
      updateQuantity: jest.fn(),
    });

    render(<MenuItemCard item={item} restaurant={restaurant} />);

    await user.click(screen.getByRole('button', { name: 'Ajouter Burger signature au panier' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter en héritage' }));

    expect(addItem).toHaveBeenCalledWith(item, restaurant, 2);
    expect(addCustomizedItem).not.toHaveBeenCalled();
    expect(screen.queryByText('Détails de Burger signature')).not.toBeInTheDocument();
  });
});
