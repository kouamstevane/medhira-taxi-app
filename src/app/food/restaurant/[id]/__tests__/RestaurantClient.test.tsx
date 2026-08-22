import { render, screen, waitFor } from '@testing-library/react';
import RestaurantClient from '../RestaurantClient';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { useCustomerRestaurantMenuQuery } from '@/hooks/useCustomerRestaurantMenuQuery';
import { isRestaurantOpenAt } from '@/utils/restaurant-hours';
import type { MenuItem, Restaurant } from '@/types/food-delivery';

const mockBack = jest.fn();

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} />;
  },
}));

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'restaurant-123' }),
  useRouter: () => ({ back: mockBack }),
  useSearchParams: () => new URLSearchParams(''),
}));

jest.mock('@/services/food-delivery.service', () => ({
  FoodDeliveryService: {
    getRestaurantById: jest.fn(),
    getRestaurantMenu: jest.fn(),
  },
}));

jest.mock('@/hooks/useCustomerRestaurantMenuQuery', () => ({
  useCustomerRestaurantMenuQuery: jest.fn(),
}));

jest.mock('@/utils/restaurant-hours', () => ({
  isRestaurantOpenAt: jest.fn(),
}));

jest.mock('@/components/food/CartDrawer', () => ({
  CartDrawer: () => <div data-testid="cart-drawer">cart drawer</div>,
}));

jest.mock('@/components/ui/BottomNav', () => ({
  BottomNav: () => <nav aria-label="Navigation du bas">bottom nav</nav>,
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span data-testid={`material-icon-${name}`} />,
}));

jest.mock('@/components/food/RestaurantMenuNavigation', () => ({
  RestaurantMenuNavigation: ({
    search,
    categories,
    onSearchChange,
    onCategoryChange,
  }: {
    search: string;
    categories: Array<{ name: string; availableCount: number }>;
    onSearchChange: (value: string) => void;
    onCategoryChange: (value: string | null) => void;
  }) => (
    <section aria-label="Navigation du menu">
      <label htmlFor="restaurant-menu-search">Rechercher un plat</label>
      <input
        id="restaurant-menu-search"
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <div aria-label="Catégories">
        <button type="button" onClick={() => onCategoryChange(null)}>
          Tout
        </button>
        {categories.map((item) => (
          <button key={item.name} type="button" onClick={() => onCategoryChange(item.name)}>
            {item.name} {item.availableCount}
          </button>
        ))}
      </div>
    </section>
  ),
}));

jest.mock('@/components/food/RestaurantMenuList', () => ({
  RestaurantMenuList: ({
    items,
  }: {
    items: MenuItem[];
  }) => (
    <section aria-label="Plats du menu">
      {items.map((item) => (
        <button key={item.id} type="button" aria-label={`Ajouter ${item.name} au panier`}>
          Ajouter
        </button>
      ))}
    </section>
  ),
}));

const mockedGetRestaurantById = FoodDeliveryService.getRestaurantById as jest.Mock;
const mockedGetRestaurantMenu = FoodDeliveryService.getRestaurantMenu as jest.Mock;
const mockedUseCustomerRestaurantMenuQuery = useCustomerRestaurantMenuQuery as jest.Mock;
const mockedIsRestaurantOpenAt = isRestaurantOpenAt as jest.Mock;

const restaurant: Restaurant = {
  id: 'restaurant-123',
  ownerId: 'owner-123',
  name: 'Chez Medjira',
  description: 'Cuisine familiale et généreuse.',
  address: '1 rue de la Paix',
  phone: '0600000000',
  email: 'contact@medjira.test',
  cuisineType: ['Africaine'],
  avgPricePerPerson: 12,
  commissionRate: 10,
  status: 'approved',
  rating: 4.5,
  totalReviews: 32,
  isOpen: true,
  stripeConnectStatus: 'active',
  createdAt: {} as Restaurant['createdAt'],
  updatedAt: {} as Restaurant['updatedAt'],
};

const items: MenuItem[] = [
  {
    id: 'menu-1',
    restaurantId: restaurant.id,
    name: 'Burger Maison',
    description: 'Steak grillé et sauce maison.',
    price: 4500,
    category: 'Plats',
    isAvailable: true,
    createdAt: {} as MenuItem['createdAt'],
    updatedAt: {} as MenuItem['updatedAt'],
  },
];

describe('RestaurantClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetRestaurantById.mockResolvedValue(restaurant);
    mockedUseCustomerRestaurantMenuQuery.mockReturnValue({
      items,
      categories: [{ name: 'Plats', availableCount: 1 }],
      search: '',
      category: null,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      hasMore: false,
      setSearch: jest.fn(),
      setCategory: jest.fn(),
      loadMore: jest.fn(),
      retry: jest.fn(),
      clearFilters: jest.fn(),
    });
  });

  it('renders restaurant metadata with the paginated menu navigation and quick-add flow', async () => {
    mockedIsRestaurantOpenAt.mockReturnValue(true);

    render(<RestaurantClient />);

    expect(await screen.findByRole('heading', { name: 'Chez Medjira' })).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedUseCustomerRestaurantMenuQuery).toHaveBeenCalledWith('restaurant-123');
    });

    expect(mockedGetRestaurantMenu).not.toHaveBeenCalled();
    expect(screen.getByRole('searchbox', { name: 'Rechercher un plat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plats 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter Burger Maison au panier' })).toBeInTheDocument();
    expect(screen.getByTestId('cart-drawer')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navigation du bas' })).toBeInTheDocument();
  });

  it('shows the closed message without exposing quick-add or the cart drawer', async () => {
    mockedIsRestaurantOpenAt.mockReturnValue(false);

    render(<RestaurantClient />);

    expect(await screen.findByRole('heading', { name: 'Chez Medjira' })).toBeInTheDocument();

    expect(screen.getByText('Ce restaurant est actuellement fermé.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter Burger Maison au panier' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('cart-drawer')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navigation du bas' })).toBeInTheDocument();
  });

  it('does not expose a restaurant whose Stripe account is not active through a direct URL', async () => {
    mockedGetRestaurantById.mockResolvedValue({
      ...restaurant,
      stripeConnectStatus: 'restricted',
    });

    render(<RestaurantClient />);

    expect(await screen.findByRole('heading', { name: 'Restaurant indisponible' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chez Medjira' })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: 'Rechercher un plat' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('cart-drawer')).not.toBeInTheDocument();
    expect(mockedUseCustomerRestaurantMenuQuery).toHaveBeenLastCalledWith('');
  });
});
