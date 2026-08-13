import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Restaurant } from '@/types/food-delivery';
import RestaurantSettingsClient from '../RestaurantSettingsClient';
import { FoodDeliveryService } from '@/services/food-delivery.service';

const mockPush = jest.fn();
const mockGetRestaurantById = FoodDeliveryService.getRestaurantById as jest.Mock;
const mockUpdateRestaurantOpeningHours = FoodDeliveryService.updateRestaurantOpeningHours as jest.Mock;
const mockShowError = jest.fn();
const mockShowSuccess = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
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
    updateRestaurantOpeningHours: jest.fn(),
  },
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    toasts: [],
    removeToast: jest.fn(),
    showError: mockShowError,
    showSuccess: mockShowSuccess,
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

jest.mock('@/app/food/portal/[id]/RestaurantPortalHeader', () => ({
  RestaurantPortalHeader: ({ restaurantName }: { restaurantName: string }) => (
    <div>{restaurantName}</div>
  ),
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span>{name}</span>,
}));

function makeRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
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
    stripeConnectStatus: 'active',
    createdAt: {} as Restaurant['createdAt'],
    updatedAt: {} as Restaurant['updatedAt'],
    ...overrides,
  };
}

beforeEach(() => {
  mockPush.mockClear();
  mockGetRestaurantById.mockReset();
  mockUpdateRestaurantOpeningHours.mockReset().mockResolvedValue(undefined);
  mockShowError.mockClear();
  mockShowSuccess.mockClear();
  mockGetRestaurantById.mockResolvedValue(makeRestaurant({
    openingHours: {
      monday: { open: '10:00', close: '20:00', closed: false },
      tuesday: null,
    },
  }));
});

describe('RestaurantSettingsClient', () => {
  it('renders existing hours and hides controls for a closed day', async () => {
    render(<RestaurantSettingsClient />);

    expect(await screen.findByRole('heading', { name: 'Paramètres' })).toBeInTheDocument();
    expect(screen.getByLabelText('Lundi ouverture')).toHaveValue('10:00');
    expect(screen.queryByLabelText('Mardi ouverture')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tableau de bord/i })).toHaveAttribute(
      'href',
      '/food/portal?restaurantId=restaurant-1',
    );
  });

  it('prevents saving when every day is closed', async () => {
    render(<RestaurantSettingsClient />);

    const toggles = await screen.findAllByRole('checkbox');
    toggles.forEach((toggle) => {
      if ((toggle as HTMLInputElement).checked) fireEvent.click(toggle);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les horaires' }));

    expect(mockShowError).toHaveBeenCalledWith('Au moins un jour doit être ouvert.');
    expect(mockUpdateRestaurantOpeningHours).not.toHaveBeenCalled();
  });

  it('saves valid changes and confirms success', async () => {
    render(<RestaurantSettingsClient />);
    fireEvent.change(await screen.findByLabelText('Lundi ouverture'), { target: { value: '08:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les horaires' }));

    await waitFor(() => expect(mockUpdateRestaurantOpeningHours).toHaveBeenCalled());
    expect(mockShowSuccess).toHaveBeenCalledWith('Horaires enregistrés.');
  });

  it('redirects a non-owner away from the settings page', async () => {
    mockGetRestaurantById.mockResolvedValueOnce(makeRestaurant({ ownerId: 'another-owner' }));
    render(<RestaurantSettingsClient />);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
    expect(mockShowError).toHaveBeenCalledWith('Accès non autorisé.');
  });

  it('keeps an inline error when saving fails', async () => {
    mockUpdateRestaurantOpeningHours.mockRejectedValueOnce(new Error('network'));
    render(<RestaurantSettingsClient />);
    fireEvent.change(await screen.findByLabelText('Lundi ouverture'), { target: { value: '08:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les horaires' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible d’enregistrer les horaires. Réessayez.',
    );
  });

  it('renders a recoverable error state when loading fails', async () => {
    mockGetRestaurantById.mockReset().mockRejectedValue(new Error('network'));
    render(<RestaurantSettingsClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Erreur lors du chargement des paramètres.',
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
