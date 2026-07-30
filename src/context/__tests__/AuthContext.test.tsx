import { render, screen, waitFor } from '@testing-library/react';
import { Timestamp } from 'firebase/firestore';
import { AuthContext, AuthProvider } from '../AuthContext';

const mockUser = {
  uid: 'user-1',
  email: 'client@medjira.test',
  phoneNumber: '+33123456789',
  emailVerified: true,
  photoURL: null,
  getIdToken: jest.fn().mockResolvedValue('token'),
  reload: jest.fn().mockResolvedValue(undefined),
};

const mockGetDoc = jest.fn();

jest.mock('@/config/firebase', () => ({
  auth: {},
  db: {},
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, callback) => {
    void callback(mockUser);
    return jest.fn();
  }),
}));

jest.mock('firebase/firestore', () => {
  const actual = jest.requireActual('firebase/firestore');
  return {
    ...actual,
    doc: jest.fn(() => ({ path: 'users/user-1' })),
    getDoc: (...args: unknown[]) => mockGetDoc(...args),
  };
});

function PaymentMethodConsumer() {
  return (
    <AuthContext.Consumer>
      {(value) => (
        <div>
          <span>{value?.authStatus}</span>
          <span data-testid="default-payment-method">
            {value?.userData?.defaultPaymentMethodId ?? 'missing'}
          </span>
        </div>
      )}
    </AuthContext.Consumer>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        firstName: 'Dome',
        lastName: 'Client',
        roles: { client: { enabled: true, joinedAt: Timestamp.now() } },
        activeRole: 'client',
        defaultPaymentMethodId: 'pm_saved_123',
        stripeCustomerId: 'cus_saved_123',
        setupIntentId: 'seti_saved_123',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    });
  });

  it('preserves Stripe payment fields from the user document', async () => {
    render(
      <AuthProvider>
        <PaymentMethodConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('authenticated')).toBeInTheDocument();
    });

    expect(screen.getByTestId('default-payment-method')).toHaveTextContent('pm_saved_123');
  });
});
