import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DriverPendingPage from '../page';
import { useAuth } from '@/hooks/useAuth';
import { AuthService } from '@/services';

const replace = jest.fn();
const signOut = AuthService.signOut as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/services', () => ({
  AuthService: {
    signOut: jest.fn(),
  },
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: () => null,
}));

describe('DriverPendingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signOut.mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      currentUser: { uid: 'driver-1' },
      loading: false,
      authStatus: 'authenticated',
    });
  });

  it('shows the validation message after the driver application is submitted', () => {
    render(<DriverPendingPage />);

    expect(screen.getByRole('heading', { name: 'Dossier en cours de validation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Retour à l'accueil" })).toBeInTheDocument();
  });

  it('signs out before returning to the home page', async () => {
    render(<DriverPendingPage />);

    fireEvent.click(screen.getByRole('button', { name: "Retour à l'accueil" }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith('/?from=driver-pending');
  });
});
