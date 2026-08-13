import { render, screen } from '@testing-library/react';
import FoodHomePage from '@/app/food/page';

jest.mock('@/services/food-delivery.service', () => ({
  FoodDeliveryService: {
    getApprovedRestaurants: jest.fn().mockResolvedValue({ restaurants: [], lastDoc: null }),
  },
}));

jest.mock('@/components/food/RestaurantCard', () => ({
  RestaurantCard: () => null,
}));

jest.mock('@/components/ui/BottomNav', () => ({
  BottomNav: () => null,
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span data-testid={`material-icon-${name}`} />,
}));

describe('FoodHomePage order tracking entry point', () => {
  it('shows a descriptive mobile-friendly link to meal order tracking', () => {
    render(<FoodHomePage />);

    const trackingLink = screen.getByRole('link', { name: 'Suivre ma commande' });

    expect(trackingLink).toHaveAttribute('href', '/food/orders');
    expect(screen.getByTestId('material-icon-delivery_dining')).toBeInTheDocument();
  });
});
