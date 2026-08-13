import { render, screen } from '@testing-library/react';
import type { Restaurant } from '@/types/food-delivery';
import PortalClient from '../PortalClient';
import { FoodDeliveryService } from '@/services/food-delivery.service';

const mockGetRestaurantById = FoodDeliveryService.getRestaurantById as jest.Mock;
const mockGetRestaurantOrders = FoodDeliveryService.getRestaurantOrders as jest.Mock;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams('restaurantId=restaurant-1'),
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: { uid: string }) => void) => {
    callback({ uid: 'owner-1' });
    return jest.fn();
  },
}));

jest.mock('@/config/firebase', () => ({ auth: { currentUser: null }, db: {} }));

jest.mock('@/services/food-delivery.service', () => ({
  FoodDeliveryService: {
    getRestaurantById: jest.fn(),
    getRestaurantOrders: jest.fn(),
    updateRestaurantStatus: jest.fn(),
  },
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    toasts: [],
    removeToast: jest.fn(),
    showError: jest.fn(),
    showSuccess: jest.fn(),
  }),
}));

jest.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <span role="progressbar" />,
}));

jest.mock('@/components/ui/Toast', () => ({
  ToastContainer: () => null,
}));

jest.mock('@/components/ui/BottomNav', () => ({
  BottomNav: () => null,
  portalNavItems: () => [],
}));

jest.mock('@/components/restaurant/RestaurantPortalPayoutBanner', () => ({
  RestaurantPortalPayoutBanner: () => null,
}));

jest.mock('@/app/food/portal/[id]/RestaurantPortalHeader', () => ({
  RestaurantPortalHeader: ({ restaurantName }: { restaurantName: string }) => (
    <div>{restaurantName}</div>
  ),
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span>{name}</span>,
}));

function makeRestaurant(): Restaurant {
  return {
    id: 'restaurant-1',
    ownerId: 'owner-1',
    name: 'Chez Medjira',
    description: 'Restaurant partenaire',
    address: '1 rue de Medjira',
    phone: '+33123456789',
    email: 'chez@example.com',
    cuisineType: ['Africaine'],
    avgPricePerPerson: 20,
    commissionRate: 10,
    status: 'approved',
    rating: 4.5,
    totalReviews: 10,
    isOpen: true,
    openingHours: {
      monday: { open: '10:00', close: '20:00', closed: false },
      tuesday: { open: '10:00', close: '20:00', closed: false },
      wednesday: { open: '10:00', close: '20:00', closed: false },
      thursday: { open: '10:00', close: '20:00', closed: false },
      friday: { open: '10:00', close: '20:00', closed: false },
      saturday: { open: '10:00', close: '20:00', closed: false },
      sunday: { open: '10:00', close: '20:00', closed: false },
    },
    stripeConnectStatus: 'active',
    createdAt: {} as Restaurant['createdAt'],
    updatedAt: {} as Restaurant['updatedAt'],
  };
}

beforeEach(() => {
  mockGetRestaurantById.mockReset().mockResolvedValue(makeRestaurant());
  mockGetRestaurantOrders.mockReset().mockResolvedValue([]);
});

it('shows the real current-day schedule and settings link', async () => {
  render(<PortalClient />);

  expect(await screen.findByText('10:00 – 20:00')).toBeInTheDocument();
  expect(screen.getByText('Modifier les horaires')).toBeInTheDocument();
  expect(screen.queryByText('08:00 - 22:00')).not.toBeInTheDocument();
});
