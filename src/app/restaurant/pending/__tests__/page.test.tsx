import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RestaurantPendingPage from '../page';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { AuthService } from '@/services';

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();
let mockAuthState: Record<string, unknown>;
const signOut = AuthService.signOut as jest.Mock;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/config/firebase', () => ({ db: {} }));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  onSnapshot: jest.fn(),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/services', () => ({
  AuthService: {
    signOut: jest.fn(),
  },
}));

jest.mock('@/components/ui/LoadingSpinner', () => ({ LoadingSpinner: () => <span /> }));
jest.mock('@/components/ui/MaterialIcon', () => ({ MaterialIcon: () => <span /> }));
jest.mock('@/components/restaurant/RestaurantClientActivation', () => ({
  RestaurantClientActivation: () => <button type="button">Activer l&apos;espace client</button>,
}));

const mockUseAuth = useAuth as jest.Mock;
const mockOnSnapshot = onSnapshot as jest.Mock;

describe('RestaurantPendingPage', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    signOut.mockReset();
    signOut.mockResolvedValue(undefined);
    mockSearchParams = new URLSearchParams('id=restaurant-1');
    mockAuthState = {
      currentUser: { uid: 'user-1' },
      userData: { roles: { restaurant: { restaurantId: 'restaurant-1' } } },
      loading: false,
      authStatus: 'authenticated',
    };
    mockUseAuth.mockImplementation(() => mockAuthState);
    mockOnSnapshot.mockImplementation((_ref, callback) => {
      callback({
        exists: () => true,
        data: () => ({ status: 'pending_approval' }),
      });
      return jest.fn();
    });
  });

  it('does not offer client space activation while the application is pending', async () => {
    render(<RestaurantPendingPage />);

    expect(await screen.findByText('Dossier en cours de validation')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Activer l'espace client" })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Retour à l'accueil" })).toBeInTheDocument();
  });

  it('keeps an authenticated user on the pending page while user data is refreshing', async () => {
    mockUseAuth.mockReturnValue({
      currentUser: { uid: 'user-1' },
      userData: null,
      loading: false,
      authStatus: 'authenticated',
    });

    render(<RestaurantPendingPage />);

    expect(await screen.findByText('Dossier en cours de validation')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalledWith('/login');
  });

  it('signs out before returning to the home page', async () => {
    render(<RestaurantPendingPage />);

    fireEvent.click(await screen.findByRole('button', { name: "Retour à l'accueil" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith('/?from=restaurant-pending');
  });

  it('does not redirect to login when the intentional sign-out updates auth state', async () => {
    const view = render(<RestaurantPendingPage />);
    signOut.mockImplementation(async () => {
      mockAuthState = {
        currentUser: null,
        userData: null,
        loading: false,
        authStatus: 'unauthenticated',
      };
      view.rerender(<RestaurantPendingPage />);
    });

    fireEvent.click(await screen.findByRole('button', { name: "Retour à l'accueil" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/?from=restaurant-pending'));
    expect(mockReplace).not.toHaveBeenCalledWith('/login');
  });
});
