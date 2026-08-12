import { render, waitFor } from '@testing-library/react';
import MenuManagementClient from '../MenuManagementClient';
import { onAuthStateChanged } from 'firebase/auth';
import { FoodDeliveryService } from '@/services/food-delivery.service';

const push = jest.fn();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams('restaurantId=restaurant-1'),
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({
  auth: {},
}));

jest.mock('@/services/food-delivery.service', () => ({
  FoodDeliveryService: {
    getRestaurantById: jest.fn(),
    getRestaurantMenuFull: jest.fn(),
  },
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    showError: jest.fn(),
    showSuccess: jest.fn(),
    toasts: [],
    removeToast: jest.fn(),
  }),
}));

jest.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <div>loading</div>,
}));

jest.mock('@/components/ui/Toast', () => ({
  ToastContainer: () => null,
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: () => null,
}));

jest.mock('@/components/ui/BottomNav', () => ({
  BottomNav: () => null,
  portalNavItems: () => [],
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: () => null,
}));

const mockOnAuthStateChanged = onAuthStateChanged as jest.Mock;
const mockGetRestaurantById = FoodDeliveryService.getRestaurantById as jest.Mock;
const mockGetRestaurantMenuFull = FoodDeliveryService.getRestaurantMenuFull as jest.Mock;

describe('MenuManagementClient authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnAuthStateChanged.mockImplementation(
      (_auth: unknown, callback: (user: { uid: string } | null) => void) => {
        void callback({ uid: 'owner-1' });
        return jest.fn();
      },
    );
    mockGetRestaurantById.mockResolvedValue({
      id: 'restaurant-1',
      ownerId: 'owner-1',
      name: 'Restaurant test',
    });
    mockGetRestaurantMenuFull.mockResolvedValue([]);
  });

  it('does not redirect an authenticated restaurant owner to login', async () => {
    render(<MenuManagementClient />);

    await waitFor(() => expect(mockGetRestaurantById).toHaveBeenCalledWith('restaurant-1'));

    expect(push).not.toHaveBeenCalledWith('/login');
    expect(replace).not.toHaveBeenCalledWith('/login');
  });
});
