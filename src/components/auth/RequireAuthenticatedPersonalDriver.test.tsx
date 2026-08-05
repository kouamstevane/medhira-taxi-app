import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { RequireAuthenticatedPersonalDriver } from './RequireAuthenticatedPersonalDriver';
import { useAuth } from '@/hooks/useAuth';
import { usePathname, useRouter } from 'next/navigation';

jest.mock('@/hooks/useAuth');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}));

describe('RequireAuthenticatedPersonalDriver', () => {
  const mockReplace = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ replace: mockReplace });
    (usePathname as jest.Mock).mockReturnValue('/personal-driver/dashboard');
  });

  it('renders a loading indicator while auth is hydrating', () => {
    (useAuth as jest.Mock).mockReturnValue({
      loading: true,
      authStatus: 'loading',
      currentUser: null,
      userData: null,
    });

    render(
      <RequireAuthenticatedPersonalDriver role="client">
        <div>Protected Content</div>
      </RequireAuthenticatedPersonalDriver>
    );

    expect(screen.getByText(/Verification des accés/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects logged-out visitor to login with next param', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      loading: false,
      authStatus: 'unauthenticated',
      currentUser: null,
      userData: null,
    });

    render(
      <RequireAuthenticatedPersonalDriver role="client">
        <div>Protected Content</div>
      </RequireAuthenticatedPersonalDriver>
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/login?next=%2Fpersonal-driver%2Fdashboard'
      );
    });
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children for authenticated client user', () => {
    (useAuth as jest.Mock).mockReturnValue({
      loading: false,
      authStatus: 'authenticated',
      currentUser: { uid: 'user_123' },
      userData: { uid: 'user_123', activeRole: 'client' },
    });

    render(
      <RequireAuthenticatedPersonalDriver role="client">
        <div>Client Content</div>
      </RequireAuthenticatedPersonalDriver>
    );

    expect(screen.getByText('Client Content')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('renders children for authenticated driver user', () => {
    (useAuth as jest.Mock).mockReturnValue({
      loading: false,
      authStatus: 'authenticated',
      currentUser: { uid: 'driver_123' },
      userData: { uid: 'driver_123', activeRole: 'driver' },
    });

    render(
      <RequireAuthenticatedPersonalDriver role="driver">
        <div>Driver Content</div>
      </RequireAuthenticatedPersonalDriver>
    );

    expect(screen.getByText('Driver Content')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects unauthorized non-driver user requesting driver role', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      loading: false,
      authStatus: 'authenticated',
      currentUser: { uid: 'user_123' },
      userData: { uid: 'user_123', activeRole: 'client' },
    });

    render(
      <RequireAuthenticatedPersonalDriver role="driver">
        <div>Driver Content</div>
      </RequireAuthenticatedPersonalDriver>
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/login?next=%2Fpersonal-driver%2Fdashboard'
      );
    });
    expect(screen.queryByText('Driver Content')).not.toBeInTheDocument();
  });

  it('renders children for authenticated admin user', () => {
    (useAuth as jest.Mock).mockReturnValue({
      loading: false,
      authStatus: 'authenticated',
      currentUser: { uid: 'admin_123' },
      userData: { uid: 'admin_123', activeRole: 'admin', isAdmin: true },
    });

    render(
      <RequireAuthenticatedPersonalDriver role="admin">
        <div>Admin Content</div>
      </RequireAuthenticatedPersonalDriver>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects unauthorized non-admin user requesting admin role', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      loading: false,
      authStatus: 'authenticated',
      currentUser: { uid: 'user_123' },
      userData: { uid: 'user_123', activeRole: 'client' },
    });

    render(
      <RequireAuthenticatedPersonalDriver role="admin">
        <div>Admin Content</div>
      </RequireAuthenticatedPersonalDriver>
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/login?next=%2Fpersonal-driver%2Fdashboard'
      );
    });
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });
});
