import { render, screen, fireEvent } from '@testing-library/react';
import type { MenuItem, Restaurant } from '@/types/food-delivery';
import { RestaurantMenuList } from '../RestaurantMenuList';

jest.mock('@/components/food/MenuItemCard', () => ({
  MenuItemCard: ({ item }: { item: MenuItem }) => (
    <article data-testid="menu-item-card">{item.name}</article>
  ),
}));

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
  totalReviews: 3,
  isOpen: true,
  stripeConnectStatus: 'active',
  createdAt: {} as Restaurant['createdAt'],
  updatedAt: {} as Restaurant['updatedAt'],
};

const items: MenuItem[] = [
  {
    id: 'item-1',
    restaurantId: restaurant.id,
    name: 'Poulet braisé',
    description: 'Servi avec alloco.',
    price: 4500,
    category: 'Plats',
    isAvailable: true,
    createdAt: {} as MenuItem['createdAt'],
    updatedAt: {} as MenuItem['updatedAt'],
  },
  {
    id: 'item-2',
    restaurantId: restaurant.id,
    name: 'Mousse au chocolat',
    description: 'Dessert maison.',
    price: 1800,
    category: 'Desserts',
    isAvailable: true,
    createdAt: {} as MenuItem['createdAt'],
    updatedAt: {} as MenuItem['updatedAt'],
  },
];

describe('RestaurantMenuList', () => {
  it('renders menu items, skeletons, loading more, empty state, error and pagination controls', () => {
    const onLoadMore = jest.fn();
    const onRetry = jest.fn();

    const { rerender } = render(
      <RestaurantMenuList
        restaurant={restaurant}
        items={[]}
        search=""
        category={null}
        isLoading
        isLoadingMore={false}
        error={null}
        hasMore={false}
        onLoadMore={onLoadMore}
        onRetry={onRetry}
      />,
    );

    expect(screen.getAllByTestId('menu-item-skeleton')).toHaveLength(6);

    rerender(
      <RestaurantMenuList
        restaurant={restaurant}
        items={items}
        search=""
        category={null}
        isLoading={false}
        isLoadingMore={false}
        error={null}
        hasMore
        onLoadMore={onLoadMore}
        onRetry={onRetry}
      />,
    );

    expect(screen.getAllByTestId('menu-item-card')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Afficher plus de plats' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Afficher plus de plats' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <RestaurantMenuList
        restaurant={restaurant}
        items={items}
        search=""
        category={null}
        isLoading={false}
        isLoadingMore
        error={null}
        hasMore={false}
        onLoadMore={onLoadMore}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Chargement de plats supplémentaires…')).toBeInTheDocument();

    rerender(
      <RestaurantMenuList
        restaurant={restaurant}
        items={[]}
        search="pizza"
        category="Plats"
        isLoading={false}
        isLoadingMore={false}
        error={null}
        hasMore={false}
        onLoadMore={onLoadMore}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Aucun plat ne correspond à votre recherche.')).toBeInTheDocument();

    rerender(
      <RestaurantMenuList
        restaurant={restaurant}
        items={[]}
        search=""
        category={null}
        isLoading={false}
        isLoadingMore={false}
        error="Impossible de charger le menu."
        hasMore={false}
        onLoadMore={onLoadMore}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
