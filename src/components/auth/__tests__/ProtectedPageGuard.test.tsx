import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { ProtectedPageGuard } from '../ProtectedPageGuard';

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name, className }: { name: string; className?: string }) => (
    <span data-testid={`icon-${name}`} className={className}>
      {name}
    </span>
  ),
}));

const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

const mockRedirectWithFallback = jest.fn<null, [unknown, string]>(() => null);
jest.mock('@/utils/navigation', () => ({
  redirectWithFallback: (router: unknown, url: string) => mockRedirectWithFallback(router, url),
}));

const mockReloadUser = jest.fn().mockResolvedValue(undefined);
let mockAuthStatus: 'loading' | 'authenticated' | 'unauthenticated' | 'degraded' = 'loading';
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    currentUser: mockAuthStatus === 'authenticated' ? { uid: 'u1' } : null,
    authStatus: mockAuthStatus,
    loading: mockAuthStatus === 'loading',
    userData: mockAuthStatus === 'authenticated' ? { uid: 'u1' } : null,
    reloadUser: mockReloadUser,
  }),
}));

describe('ProtectedPageGuard', () => {
  beforeEach(() => {
    mockAuthStatus = 'loading';
    mockRouter.push.mockReset();
    mockRedirectWithFallback.mockReset();
    mockReloadUser.mockClear();
  });

  it('shows a loading state while auth is unresolved', () => {
    render(
      <ProtectedPageGuard>
        <div>Secret dashboard</div>
      </ProtectedPageGuard>,
    );

    expect(screen.getByText('Chargement...')).toBeInTheDocument();
    expect(screen.queryByText('Secret dashboard')).not.toBeInTheDocument();
    expect(mockRedirectWithFallback).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated users without rendering protected content', async () => {
    mockAuthStatus = 'unauthenticated';

    render(
      <ProtectedPageGuard redirectTo="/login">
        <div>Secret dashboard</div>
      </ProtectedPageGuard>,
    );

    expect(screen.getByText('Redirection...')).toBeInTheDocument();
    expect(screen.queryByText('Secret dashboard')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockRedirectWithFallback).toHaveBeenCalledWith(mockRouter, '/login');
    });
  });

  it('renders children for authenticated users', () => {
    mockAuthStatus = 'authenticated';

    render(
      <ProtectedPageGuard>
        <div>Secret dashboard</div>
      </ProtectedPageGuard>,
    );

    expect(screen.getByText('Secret dashboard')).toBeInTheDocument();
    expect(mockRedirectWithFallback).not.toHaveBeenCalled();
  });

  it('displays NetworkErrorView after 13 seconds timeout when stuck loading', () => {
    jest.useFakeTimers();
    mockAuthStatus = 'loading';

    render(
      <ProtectedPageGuard>
        <div>Secret dashboard</div>
      </ProtectedPageGuard>,
    );

    expect(screen.getByText('Chargement...')).toBeInTheDocument();

    // Fast-forward 13 seconds
    act(() => {
      jest.advanceTimersByTime(13000);
    });

    expect(screen.getByText('Vous êtes hors ligne')).toBeInTheDocument();
    expect(screen.getByText('Veuillez vérifier votre connexion internet et réessayer.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument();

    jest.useRealTimers();
  });

  it('retries when clicking the retry button in NetworkErrorView', async () => {
    jest.useFakeTimers();
    mockAuthStatus = 'loading';

    render(
      <ProtectedPageGuard>
        <div>Secret dashboard</div>
      </ProtectedPageGuard>,
    );

    act(() => {
      jest.advanceTimersByTime(13000);
    });

    const retryButton = screen.getByRole('button', { name: /réessayer/i });
    await act(async () => {
      fireEvent.click(retryButton);
    });

    expect(mockReloadUser).toHaveBeenCalled();
    // After retry, it resets timeout and shows loading state again
    expect(screen.getByText('Chargement...')).toBeInTheDocument();

    jest.useRealTimers();
  });
});
