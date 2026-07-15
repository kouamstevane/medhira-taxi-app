import { render, screen, fireEvent } from '@testing-library/react';
import { RoleSwitcher } from '../RoleSwitcher';
import type { UserData } from '@/types/user';
import type { ActiveRole } from '@/types/user';
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
  getDashboardRouteFor: (role: string, _ctx?: unknown) => {
    const routes: Record<string, string> = {
      client: '/dashboard',
      driver: '/driver/dashboard',
      restaurant: '/restaurant/dashboard',
    };
    return routes[role] ?? '/dashboard';
  },
}));

let mockUserData: UserData | null = null;
let mockStatuses: EffectiveRoleStatuses = { driver: null, restaurant: null };
let mockHasActiveRide = false;

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    currentUser: { uid: 'uid1' },
    userData: mockUserData,
    loading: false,
  }),
}));

jest.mock('@/hooks/useEffectiveRoleStatus', () => ({
  useEffectiveRoleStatus: () => mockStatuses,
}));

jest.mock('@/hooks/useActiveRideGuard', () => ({
  useActiveRideGuard: () => ({ hasActiveRide: mockHasActiveRide, loading: false }),
}));

function makeUserData(roles: { driver?: boolean; restaurant?: boolean }, activeRole: ActiveRole): UserData {
  return {
    uid: 'uid1',
    email: 'test@test.com',
    emailVerified: true,
    firstName: 'Test',
    lastName: 'User',
    roles: {
      client: { enabled: true, joinedAt: {} as any },
      driver: roles.driver ? { joinedAt: {} as any } : undefined,
      restaurant: roles.restaurant ? { restaurantId: 'rest1', joinedAt: {} as any } : undefined,
    },
    activeRole,
    createdAt: {} as any,
    updatedAt: {} as any,
  } as UserData;
}

beforeEach(() => {
  mockReplace.mockClear();
  mockSetActiveRole.mockClear();
  mockHasActiveRide = false;
  mockStatuses = { driver: null, restaurant: null };
});

describe('RoleSwitcher', () => {
  it('renders null when user has only one role (client only)', () => {
    mockUserData = makeUserData({}, 'client');
    const { container } = render(<RoleSwitcher />);
    expect(container.innerHTML).toBe('');
  });

  it('renders null when userData is null', () => {
    mockUserData = null;
    const { container } = render(<RoleSwitcher />);
    expect(container.innerHTML).toBe('');
  });

  it('shows a compact accessible icon for the active role', () => {
    mockUserData = makeUserData({ driver: true }, 'driver');
    mockStatuses = {
      driver: { status: 'approved', loading: false },
      restaurant: null,
    };
    render(<RoleSwitcher />);

    const button = screen.getByRole('button', {
      name: "Changer d'espace, espace actuel : Chauffeur",
    });

    expect(button).toHaveClass('size-11');
    expect(screen.getByTestId('icon-local_taxi')).toBeInTheDocument();
    expect(button).not.toHaveTextContent('Mode');
    expect(button).not.toHaveTextContent('Chauffeur');
  });

  it('opens dropdown with role items on click', () => {
    mockUserData = makeUserData({ driver: true }, 'driver');
    mockStatuses = {
      driver: { status: 'approved', loading: false },
      restaurant: null,
    };
    render(<RoleSwitcher />);
    expect(screen.queryByTestId('role-dropdown')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('role-switcher-btn'));
    expect(screen.getByTestId('role-dropdown')).toBeInTheDocument();
    expect(screen.getByTestId('role-item-client')).toBeInTheDocument();
    expect(screen.getByTestId('role-item-driver')).toBeInTheDocument();
  });

  it('shows "Configurez vos paiements" badge for approved restaurant with not_started Stripe', () => {
    mockUserData = makeUserData({ restaurant: true }, 'restaurant');
    mockStatuses = {
      driver: null,
      restaurant: {
        status: 'approved',
        stripeConnectStatus: 'not_started',
        restaurantId: 'rest1',
        loading: false,
      },
    };
    render(<RoleSwitcher />);
    fireEvent.click(screen.getByTestId('role-switcher-btn'));
    expect(screen.getByText('Configurez vos paiements')).toBeInTheDocument();
  });

  it('shows "Suspendu" badge for suspended restaurant', () => {
    mockUserData = makeUserData({ restaurant: true }, 'restaurant');
    mockStatuses = {
      driver: null,
      restaurant: {
        status: 'suspended',
        stripeConnectStatus: 'active',
        restaurantId: 'rest1',
        loading: false,
      },
    };
    render(<RoleSwitcher />);
    fireEvent.click(screen.getByTestId('role-switcher-btn'));
    expect(screen.getByText('Suspendu')).toBeInTheDocument();
  });

  it('disables client and restaurant items when driver has active ride', () => {
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
    fireEvent.click(screen.getByTestId('role-switcher-btn'));
    const clientItem = screen.getByTestId('role-item-client');
    const restaurantItem = screen.getByTestId('role-item-restaurant');
    expect(clientItem).toBeDisabled();
    expect(restaurantItem).toBeDisabled();
  });

  it('switches role on item click and navigates', async () => {
    mockUserData = makeUserData({ driver: true }, 'client');
    mockStatuses = {
      driver: { status: 'approved', loading: false },
      restaurant: null,
    };
    render(<RoleSwitcher />);
    fireEvent.click(screen.getByTestId('role-switcher-btn'));
    fireEvent.click(screen.getByTestId('role-item-driver'));
    expect(mockSetActiveRole).toHaveBeenCalledWith(mockUserData, 'driver');
    await screen.findByTestId('role-switcher-btn');
    expect(mockReplace).toHaveBeenCalledWith('/driver/dashboard');
  });

  it('closes dropdown on outside click', () => {
    mockUserData = makeUserData({ driver: true }, 'driver');
    mockStatuses = {
      driver: { status: 'approved', loading: false },
      restaurant: null,
    };
    render(
      <div>
        <div data-testid="outside" />
        <RoleSwitcher />
      </div>,
    );
    fireEvent.click(screen.getByTestId('role-switcher-btn'));
    expect(screen.getByTestId('role-dropdown')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('role-dropdown')).not.toBeInTheDocument();
  });
});
