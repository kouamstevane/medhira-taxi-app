import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

const replace = jest.fn();
let homeSearchParams = new URLSearchParams();
let authState: { currentUser: Record<string, unknown> | null; loading: boolean; userData: Record<string, unknown> | null } = {
  currentUser: null,
  loading: false,
  userData: null,
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => homeSearchParams,
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

jest.mock('@/components/auth/DriverOnboardingDecisionGate', () => ({
  DriverOnboardingDecisionGate: () => <div data-testid="driver-onboarding-decision" />,
}));

jest.mock('@/services/roles.service', () => ({
  getRouteForAuthenticatedProfile: jest.fn(() => '/driver/register'),
}));

jest.mock('@/utils/navigation', () => ({
  redirectWithFallback: jest.fn(() => undefined),
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: () => null,
}));

describe('HomePage driver onboarding entry point', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    homeSearchParams = new URLSearchParams();
    authState = {
      currentUser: { uid: 'draft-uid' },
      loading: false,
      userData: {
        accountState: 'driver_onboarding',
        activeRole: 'driver_onboarding',
        roles: {},
      },
    };
  });

  it('shows the onboarding decision instead of redirecting to registration on app launch', () => {
    render(<HomePage />);

    expect(screen.getByTestId('driver-onboarding-decision')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows the same decision entry point for a restaurant draft', () => {
    authState = {
      currentUser: { uid: 'restaurant-draft-uid' },
      loading: false,
      userData: {
        activeRole: 'client',
        roles: { client: { enabled: true } },
        draftRestaurant: {
          currentStep: 3,
          data: { name: 'Chez A' },
        },
      },
    };

    render(<HomePage />);

    expect(screen.getByTestId('driver-onboarding-decision')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders the public home when returning from restaurant validation', () => {
    homeSearchParams = new URLSearchParams('from=restaurant-pending');

    render(<HomePage />);

    expect(screen.getByRole('heading', { name: 'Votre taxi & livraison en 1 clic' })).toBeInTheDocument();
    expect(screen.queryByTestId('driver-onboarding-decision')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders the public home when returning from driver validation', () => {
    homeSearchParams = new URLSearchParams('from=driver-pending');

    render(<HomePage />);

    expect(screen.getByRole('heading', { name: 'Votre taxi & livraison en 1 clic' })).toBeInTheDocument();
    expect(screen.queryByTestId('driver-onboarding-decision')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
