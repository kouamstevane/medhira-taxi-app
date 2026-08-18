import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MenuManagementClient from '../MenuManagementClient';
import { onAuthStateChanged } from 'firebase/auth';
import { FoodDeliveryService } from '@/services/food-delivery.service';

const push = jest.fn();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/food/portal/menu/',
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
    getRestaurantMenuPaginated: jest.fn(),
    deleteMenuItem: jest.fn(),
  },
}));

jest.mock('@/components/food/BulkCsvImportModal', () => ({
  BulkCsvImportModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="csv-modal">CSV Modal</div> : null),
}));

jest.mock('@/components/food/StoreConnectorModal', () => ({
  StoreConnectorModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="store-modal">Store Modal</div> : null),
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
const mockGetRestaurantMenuPaginated = FoodDeliveryService.getRestaurantMenuPaginated as jest.Mock;
const mockDeleteMenuItem = FoodDeliveryService.deleteMenuItem as jest.Mock;

describe('MenuManagementClient', () => {
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
    mockGetRestaurantMenuPaginated.mockResolvedValue({
      items: [
        { id: '1', name: 'Burger Maison', category: 'Burgers Gourmet', price: 15, isAvailable: true },
        { id: '2', name: 'Tiramisu', category: 'Desserts Italiens', price: 6, isAvailable: true },
      ],
      lastDoc: null,
      hasMore: false,
      totalCount: 2,
      availableCount: 2,
    });
    mockDeleteMenuItem.mockResolvedValue(undefined);
  });

  it('does not redirect an authenticated restaurant owner to login and loads paginated items', async () => {
    render(<MenuManagementClient />);

    await waitFor(() => expect(mockGetRestaurantById).toHaveBeenCalledWith('restaurant-1'));
    await waitFor(() => expect(mockGetRestaurantMenuPaginated).toHaveBeenCalledWith(
      'restaurant-1',
      expect.objectContaining({ pageSize: 50, cursor: null }),
    ));

    expect(push).not.toHaveBeenCalledWith('/login');
    expect(replace).not.toHaveBeenCalledWith('/login');
  });

  it('renders the import catalogue button while the store connector remains hidden', async () => {
    const { getByText } = render(<MenuManagementClient />);

    await waitFor(() => {
      expect(getByText(/Importer catalogue/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Connecter boutique/i })).not.toBeInTheDocument();
  });

  it('uses a Lucide icon for the import action', async () => {
    render(<MenuManagementClient />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Importer catalogue/i }).querySelector('[data-testid="LucideIcon-icon"]')).toBeTruthy();
    });
  });

  it('requires confirmation before deleting a menu item', async () => {
    render(<MenuManagementClient />);

    const deleteButton = await screen.findByRole('button', { name: 'Supprimer Burger Maison' });
    fireEvent.click(deleteButton);

    expect(screen.getByRole('dialog', { name: 'Supprimer un plat ?' })).toBeInTheDocument();
    expect(mockDeleteMenuItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog', { name: 'Supprimer un plat ?' })).not.toBeInTheDocument();

    fireEvent.click(deleteButton);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    await waitFor(() => expect(mockDeleteMenuItem).toHaveBeenCalledWith('restaurant-1', '1'));
  });
});
