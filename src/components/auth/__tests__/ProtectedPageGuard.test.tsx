import { render, screen, waitFor } from '@testing-library/react';
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

let mockAuthStatus: 'loading' | 'authenticated' | 'unauthenticated' = 'loading';
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    currentUser: mockAuthStatus === 'authenticated' ? { uid: 'u1' } : null,
    authStatus: mockAuthStatus,
    loading: mockAuthStatus === 'loading',
    userData: mockAuthStatus === 'authenticated' ? { uid: 'u1' } : null,
  }),
}));

describe('ProtectedPageGuard', () => {
  beforeEach(() => {
    mockAuthStatus = 'loading';
    mockRouter.push.mockReset();
    mockRedirectWithFallback.mockReset();
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
});
