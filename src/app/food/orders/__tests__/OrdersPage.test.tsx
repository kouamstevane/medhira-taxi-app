import { render, screen, waitFor } from '@testing-library/react';
import OrdersHistoryPage from '../page';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import { useAuth } from '@/hooks/useAuth';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/services/food-delivery.service', () => ({
  FoodDeliveryService: {
    getUserFoodOrders: jest.fn(),
  },
}));

jest.mock('@/components/ui/BottomNav', () => ({
  BottomNav: () => null,
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

describe('OrdersHistoryPage NetworkErrorView integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      currentUser: { uid: 'user-123' },
    });
  });

  it('renders NetworkErrorView when network error occurs and no orders are present', async () => {
    (FoodDeliveryService.getUserFoodOrders as jest.Mock).mockRejectedValueOnce(
      new Error('Failed to fetch (offline)')
    );

    render(<OrdersHistoryPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/impossible de charger l'historique de vos commandes/i)
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument();
  });
});
