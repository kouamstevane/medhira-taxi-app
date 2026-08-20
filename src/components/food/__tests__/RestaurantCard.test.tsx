import { render, screen } from '@testing-library/react';
import { RestaurantCard } from '../RestaurantCard';
import type { Restaurant } from '@/types/food-delivery';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <a {...props}>{children}</a>
  ),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ fill, alt = '', ...props }: { fill?: boolean; alt?: string; [key: string]: unknown }) => (
    <span aria-label={alt} data-fill={fill ? 'true' : undefined} {...props} />
  ),
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: () => <span aria-hidden="true" />,
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

describe('RestaurantCard', () => {
  it('uses a static-compatible restaurant route for mobile builds', () => {
    render(<RestaurantCard restaurant={restaurant} />);

    expect(screen.getByRole('link', { name: /chez medjira/i })).toHaveAttribute(
      'href',
      '/food/restaurant?id=restaurant-123',
    );
  });

  it('prefers the modern cover image over the legacy image URL', () => {
    render(<RestaurantCard restaurant={{ ...restaurant, imageUrl: 'https://legacy.test/image.webp', coverImageUrl: 'https://cdn.test/cover.webp' }} />);

    expect(screen.getByLabelText('Chez Medjira')).toHaveAttribute('src', 'https://cdn.test/cover.webp');
  });
});
