import { render, screen } from '@testing-library/react';
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
  it('does not render the documents summary card on the profile page', () => {
    render(<DriverProfilePage />);

    expect(screen.queryByText('Documents en vérification')).not.toBeInTheDocument();
  });
});
