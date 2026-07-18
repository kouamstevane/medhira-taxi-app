import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DriverProfilePage from '../page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock('firebase/auth', () => ({
  deleteUser: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'driver-1',
    },
  },
  functions: {},
}));

const mockActivateClientRole = jest.fn().mockResolvedValue({ data: { success: true } });

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => mockActivateClientRole),
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span>{name}</span>,
}));

jest.mock('@/components/ui/BottomNav', () => ({
  BottomNav: () => <nav>bottom-nav</nav>,
  driverNavItems: [],
}));

jest.mock('@/components/ui/Skeleton', () => ({
  CardSkeleton: () => <div>skeleton</div>,
}));

jest.mock('@/hooks/useDriverProfile', () => ({
  useDriverProfile: () => ({
    driver: {
      firstName: 'Ste',
      lastName: 'Jgf',
      email: 'driver@example.com',
      phone: '15245369852',
      licenseNumber: 'LIC-123',
      status: 'pending',
      isAvailable: false,
      car: {
        model: 'Toyota',
        plate: 'ABC-123',
        color: 'Noir',
      },
    },
    privateData: null,
    loading: false,
    error: null,
    editMode: false,
    setEditMode: jest.fn(),
    formData: {},
    setFormData: jest.fn(),
    setProfileImage: jest.fn(),
    isEmailVerified: true,
    stripeData: null,
    stripeLoading: false,
    stripeError: null,
    payoutToggleLoading: false,
    manualPayoutLoading: false,
    payoutSuccess: null,
    handleUpdateProfile: jest.fn(),
    toggleAvailability: jest.fn(),
    handleCreateStripeAccount: jest.fn(),
    handleToggleWeeklyPayout: jest.fn(),
    handleManualPayout: jest.fn(),
  }),
}));

const mockReloadUser = jest.fn().mockResolvedValue(undefined);

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    userData: {
      uid: 'driver-1',
      roles: {
        driver: { joinedAt: {} },
      },
      activeRole: 'driver',
    },
    reloadUser: mockReloadUser,
  }),
}));

jest.mock('@/hooks/useDocumentStatus', () => ({
  useDocumentStatus: () => ({
    documents: [
      { key: 'licenseFront', status: 'pending' },
      { key: 'carRegistration', status: 'pending' },
      { key: 'insurance', status: 'pending' },
    ],
  }),
}));

describe('DriverProfilePage', () => {
  beforeEach(() => {
    mockActivateClientRole.mockClear();
    mockReloadUser.mockClear();
  });

  it('does not render the documents summary card on the profile page', () => {
    render(<DriverProfilePage />);

    expect(screen.queryByText('Documents en vérification')).not.toBeInTheDocument();
  });

  it('shows a client activation action for driver-only accounts', async () => {
    render(<DriverProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: /activer mon espace client/i }));

    await waitFor(() => expect(mockActivateClientRole).toHaveBeenCalledTimes(1));
    expect(mockReloadUser).toHaveBeenCalledTimes(1);
  });
});
