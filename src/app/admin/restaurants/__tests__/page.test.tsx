import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockGetPendingRestaurants = jest.fn();
const mockCallable = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock('firebase/firestore', () => ({
  Timestamp: class Timestamp {},
  collection: jest.fn(() => ({})),
  getDocs: jest.fn(),
  limit: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => mockCallable),
}));

jest.mock('@/config/firebase', () => ({
  auth: { currentUser: { uid: 'admin-1' } },
  db: {},
  functions: {},
}));

jest.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: jest.fn(() => true),
}));

jest.mock('@/services/food-delivery.service', () => ({
  FoodDeliveryService: {
    getPendingRestaurants: mockGetPendingRestaurants,
  },
}));

jest.mock('@/components/admin/AdminHeader', () => ({
  __esModule: true,
  default: () => <div />,
}));

jest.mock('@/components/ui/BottomNav', () => ({
  BottomNav: () => <div />,
  adminNavItems: [],
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span aria-hidden="true">{name}</span>,
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: { alt?: string }) => <span role="img" aria-label={alt} />,
}));

jest.mock('react-hot-toast', () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

const restaurant = {
  id: 'restaurant-1',
  ownerId: 'owner-1',
  name: 'Restaurant A',
  status: 'approved',
  commissionRate: 15,
  cuisineType: ['Française'],
  avgPricePerPerson: 25,
  address: '1 rue du Test',
  phone: '555-0100',
  createdAt: new Date('2026-01-01'),
  openingHours: {},
} as never;

describe('AdminRestaurantsPage commission editor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPendingRestaurants.mockResolvedValue([restaurant]);
    mockCallable.mockResolvedValue({ data: { success: true, commissionRate: 10 } });
  });

  it('renders restaurant statuses as a compact segmented control', async () => {
    const { default: AdminRestaurantsPage } = await import('../page');
    render(<AdminRestaurantsPage />);

    const tablist = screen.getByRole('tablist', { name: 'Filtres restaurants' });

    expect(tablist).toBeInTheDocument();
    expect(tablist).toHaveClass('bg-[#151a26]');
    expect(tablist).toHaveClass('border-white/10');
    expect(screen.getByRole('tab', { name: 'En attente' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Actifs' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Refusés' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tous' })).toBeInTheDocument();
  });

  it('allows an administrator to save a restaurant commission rate', async () => {
    const { default: AdminRestaurantsPage } = await import('../page');
    render(<AdminRestaurantsPage />);

    fireEvent.click(await screen.findByText('Restaurant A'));
    fireEvent.change(await screen.findByLabelText('Taux de commission du restaurant'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la commission' }));

    await waitFor(() => expect(mockCallable).toHaveBeenCalledWith({
      action: 'set_commission_rate',
      restaurantId: 'restaurant-1',
      commissionRate: 10,
    }));
    expect(mockToastSuccess).toHaveBeenCalledWith('Commission mise à jour.');
  });

  it('rejects a commission rate above 100 percent before calling the server', async () => {
    const { default: AdminRestaurantsPage } = await import('../page');
    render(<AdminRestaurantsPage />);

    fireEvent.click(await screen.findByText('Restaurant A'));
    fireEvent.change(await screen.findByLabelText('Taux de commission du restaurant'), {
      target: { value: '101' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la commission' }));

    expect(mockCallable).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith('Le taux de commission doit être compris entre 0 et 100 %.');
  });
});
