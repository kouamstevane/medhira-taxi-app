import { render, screen, waitFor } from '@testing-library/react';
import RestaurantDashboardPage from './page';

const mockReplace = jest.fn();
const mockUnsubscribe = jest.fn();
let snapshotCallback: ((snapshot: { exists: () => boolean; id: string; data: () => Record<string, unknown> }) => void) | null = null;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    currentUser: { uid: 'user-1' },
    userData: { roles: { restaurant: { restaurantId: 'restaurant-1' } } },
    loading: false,
  }),
}));

jest.mock('@/config/firebase', () => ({ db: {} }));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...args: unknown[]) => args),
  onSnapshot: jest.fn((_reference: unknown, callback: typeof snapshotCallback) => {
    snapshotCallback = callback;
    return mockUnsubscribe;
  }),
}));

jest.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <div role="status">Chargement...</div>,
}));

describe('RestaurantDashboardPage', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockUnsubscribe.mockReset();
    snapshotCallback = null;
  });

  it('keeps the transition screen visible while redirecting an approved restaurant', async () => {
    render(<RestaurantDashboardPage />);

    expect(screen.queryByText('Portail Restaurateur')).not.toBeInTheDocument();

    await waitFor(() => expect(snapshotCallback).not.toBeNull());
    snapshotCallback?.({
      exists: () => true,
      id: 'restaurant-1',
      data: () => ({ status: 'approved' }),
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/food/portal?restaurantId=restaurant-1');
    });
    expect(screen.queryByText('Portail Restaurateur')).not.toBeInTheDocument();
  });
});
