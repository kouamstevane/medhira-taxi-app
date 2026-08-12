import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RoleSwitcher } from '../RoleSwitcher';
import type { ActiveRole, UserData } from '@/types/user';
import type { EffectiveRoleStatuses } from '@/hooks/useEffectiveRoleStatus';

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name, className }: { name: string; className?: string }) => (
    <span data-testid={`icon-${name}`} className={className}>
      {name}
    </span>
  ),
}));

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockSetActiveRole = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/roles.service', () => ({
  setActiveRole: (...args: unknown[]) => mockSetActiveRole(...args),
  getDashboardRouteFor: (role: string) => ({
    client: '/dashboard',
    driver: '/driver/dashboard',
    restaurant: '/restaurant/dashboard',
  }[role] ?? '/dashboard'),
}));

const mockActivateClientRole = jest.fn().mockResolvedValue({ data: { success: true } });
const mockHttpsCallable = jest.fn(() => mockActivateClientRole);
jest.mock('firebase/functions', () => ({
  httpsCallable: (...args: unknown[]) => mockHttpsCallable(...args),
}));

const mockReloadUser = jest.fn().mockResolvedValue(undefined);
let mockUserData: UserData | null = null;
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    currentUser: { uid: 'uid1' },
    userData: mockUserData,
    loading: false,
    reloadUser: mockReloadUser,
  }),
}));

let mockStatuses: EffectiveRoleStatuses = { driver: null, restaurant: null };
let mockHasActiveRide = false;
jest.mock('@/hooks/useEffectiveRoleStatus', () => ({
  useEffectiveRoleStatus: () => mockStatuses,
}));
jest.mock('@/hooks/useActiveRideGuard', () => ({
  useActiveRideGuard: () => ({ hasActiveRide: mockHasActiveRide, loading: false }),
}));

function makeUserData(
  roles: { client?: boolean; driver?: boolean; restaurant?: boolean },
  activeRole: ActiveRole,
): UserData {
  return {
    uid: 'uid1',
    email: 'test@test.com',
    emailVerified: true,
    firstName: 'Test',
    lastName: 'User',
    roles: {
      client: roles.client === false ? undefined : { enabled: true, joinedAt: {} as any },
      driver: roles.driver ? { joinedAt: {} as any } : undefined,
      restaurant: roles.restaurant ? { restaurantId: 'rest1', joinedAt: {} as any } : undefined,
    },
    activeRole,
    createdAt: {} as any,
    updatedAt: {} as any,
  } as UserData;
}

beforeEach(() => {
  mockUserData = null;
  mockStatuses = { driver: null, restaurant: null };
  mockHasActiveRide = false;
  mockReplace.mockClear();
  mockSetActiveRole.mockClear();
  mockReloadUser.mockClear();
  mockActivateClientRole.mockClear();
  mockHttpsCallable.mockClear();
});

describe('RoleSwitcher', () => {
  it('renders null when user has only one role', () => {
    mockUserData = makeUserData({}, 'client');

    const { container } = render(<RoleSwitcher />);

    expect(container.innerHTML).toBe('');
  });

  it('renders one connected icon toggle for the available roles', () => {
    mockUserData = makeUserData({ driver: true, restaurant: true }, 'restaurant');
    mockStatuses = {
      driver: { status: 'approved', loading: false },
      restaurant: {
        status: 'approved',
        stripeConnectStatus: 'active',
        restaurantId: 'rest1',
        loading: false,
      },
    };

    render(<RoleSwitcher />);

    expect(screen.getByRole('group', { name: 'Changer d’espace' })).toBeInTheDocument();
    expect(screen.getByTestId('role-toggle-client')).toBeInTheDocument();
    expect(screen.getByTestId('role-toggle-driver')).toBeInTheDocument();
    expect(screen.getByTestId('role-toggle-restaurant')).toBeInTheDocument();
    expect(screen.queryByTestId('role-dropdown')).not.toBeInTheDocument();
    expect(screen.getByTestId('role-toggle-restaurant')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('role-toggle-restaurant')).not.toHaveTextContent('Restaurateur');
  });

  it('persists a role, reloads the auth profile, then replaces the route', async () => {
    mockUserData = makeUserData({ driver: true }, 'client');
    mockStatuses = {
      driver: { status: 'approved', loading: false },
      restaurant: null,
    };

    render(<RoleSwitcher />);
    fireEvent.click(screen.getByTestId('role-toggle-driver'));

    await waitFor(() => expect(mockSetActiveRole).toHaveBeenCalledWith(mockUserData, 'driver'));
    expect(mockReloadUser).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/driver/dashboard');
    expect(mockReloadUser.mock.invocationCallOrder[0]).toBeLessThan(mockReplace.mock.invocationCallOrder[0]);
  });

  it('activates the client role from the toggle when it is missing', async () => {
    mockUserData = makeUserData({ client: false, driver: true }, 'driver');
    mockStatuses = {
      driver: { status: 'approved', loading: false },
      restaurant: null,
    };

    render(<RoleSwitcher allowClientActivation />);
    fireEvent.click(screen.getByTestId('role-toggle-client'));

    await waitFor(() => expect(mockActivateClientRole).toHaveBeenCalledTimes(1));
    expect(mockSetActiveRole).toHaveBeenCalledWith(mockUserData, 'client');
    expect(mockReloadUser).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });

  it('does not navigate when reloading the auth profile fails', async () => {
    mockUserData = makeUserData({ driver: true }, 'client');
    mockStatuses = {
      driver: { status: 'approved', loading: false },
      restaurant: null,
    };
    mockReloadUser.mockRejectedValueOnce(new Error('Profil indisponible'));

    render(<RoleSwitcher />);
    fireEvent.click(screen.getByTestId('role-toggle-driver'));

    expect(await screen.findByText('Profil indisponible')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('disables roles outside the driver space during an active ride', () => {
    mockUserData = makeUserData({ driver: true, restaurant: true }, 'driver');
    mockStatuses = {
      driver: { status: 'approved', loading: false },
      restaurant: {
        status: 'approved',
        stripeConnectStatus: 'active',
        restaurantId: 'rest1',
        loading: false,
      },
    };
    mockHasActiveRide = true;

    render(<RoleSwitcher />);

    expect(screen.getByTestId('role-toggle-client')).toBeDisabled();
    expect(screen.getByTestId('role-toggle-restaurant')).toBeDisabled();
  });

  it('shows Client as an activation segment for a professional account without it', () => {
    mockUserData = makeUserData({ client: false, driver: true }, 'driver');
    mockStatuses = {
      driver: { status: 'approved', loading: false },
      restaurant: null,
    };

    render(<RoleSwitcher allowClientActivation />);

    expect(screen.getByTestId('role-toggle-client')).toHaveAttribute(
      'aria-label',
      'Activer l’espace client',
    );
  });
});
