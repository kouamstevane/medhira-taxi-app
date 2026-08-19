import { render, screen } from '@testing-library/react';
import { CustomerMenuItemDetails } from '../CustomerMenuItemDetails';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import type { CustomerMenuItemDetails as CustomerMenuItemDetailsData, MenuItem, Restaurant } from '@/types/food-delivery';

jest.mock('@/services/food-delivery.service', () => ({
  FoodDeliveryService: {
    getCustomerMenuItemDetails: jest.fn(),
  },
}));

const mockGetCustomerMenuItemDetails = FoodDeliveryService.getCustomerMenuItemDetails as jest.Mock;

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

const details: CustomerMenuItemDetailsData = {
  itemId: item.id,
  description: 'Pain brioché, steak grillé et sauce maison.',
  imageUrl: 'https://cdn.example.com/burger-signature.jpg',
  modifierGroups: [
    {
      id: 'size',
      label: 'Taille',
      selectionType: 'single',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { id: 'regular', label: 'Classique', priceDelta: 0, isAvailable: true },
        { id: 'large', label: 'Grand', priceDelta: 2, isAvailable: true },
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
        { id: 'cheese', label: 'Fromage', priceDelta: 1.5, isAvailable: true },
      ],
    },
  ],
  supplements: [
    { id: 'drink', label: 'Boisson fraîche', price: 2.5, isAvailable: true },
  ],
  allergens: [
    { code: 'GLUTEN', label: 'Gluten' },
    { code: 'MILK', label: 'Lait' },
  ],
  nutrition: {
    calories: 640,
    proteinGrams: 28,
    carbsGrams: 52,
    saltGrams: 1.2,
  },
  checkoutRules: {
    maxQuantity: 4,
  },
};

describe('CustomerMenuItemDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the description, image, allergens, nutrition, modifier groups, and supplements in the details surface', async () => {
    mockGetCustomerMenuItemDetails.mockResolvedValue(details);

    render(
      <CustomerMenuItemDetails
        item={item}
        restaurant={restaurant}
        isOpen
        onClose={jest.fn()}
        onAddToCart={jest.fn()}
      />,
    );

    expect(await screen.findByText('Pain brioché, steak grillé et sauce maison.')).toBeInTheDocument();
    expect(screen.getByAltText('Burger signature')).toBeInTheDocument();
    expect(screen.getByText('Gluten')).toBeInTheDocument();
    expect(screen.getByText('Lait')).toBeInTheDocument();
    expect(screen.getByText('640 kcal')).toBeInTheDocument();
    expect(screen.getByText('28 g protéines')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Personnalisation' })).toBeInTheDocument();
    expect(screen.getByText('Taille')).toBeInTheDocument();
    expect(screen.getByText('Extras')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Suppléments' })).toBeInTheDocument();
    expect(screen.getByText('Boisson fraîche')).toBeInTheDocument();
    expect(mockGetCustomerMenuItemDetails).toHaveBeenCalledWith(restaurant.id, item.id);
  });
});
