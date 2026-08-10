import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

const replace = jest.fn();
let authState: { currentUser: Record<string, unknown> | null; loading: boolean; userData: Record<string, unknown> | null } = {
  currentUser: null,
  loading: false,
  userData: null,
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
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
});
