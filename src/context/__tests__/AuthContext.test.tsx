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
          <span data-testid="roles">
            {Object.keys(value?.userData?.roles ?? {}).join(',')}
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

  it('does not create a client role for a professional document without roles', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        firstName: 'Pro',
        lastName: 'User',
        activeRole: 'restaurant_onboarding',
        accountState: 'restaurant_onboarding',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    });

    render(
      <AuthProvider>
        <PaymentMethodConsumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument());
    expect(screen.getByTestId('roles')).not.toHaveTextContent('client');
  });

  it('retries a transient Firestore read before marking the session unauthenticated', async () => {
    mockGetDoc
      .mockRejectedValueOnce({ code: 'unavailable', message: 'temporary outage' })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          firstName: 'Dome',
          lastName: 'Client',
          roles: { client: { enabled: true, joinedAt: Timestamp.now() } },
          activeRole: 'client',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        }),
      });

    render(
      <AuthProvider>
        <PaymentMethodConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('authenticated')).toBeInTheDocument();
    });
    expect(mockUser.getIdToken).toHaveBeenCalledWith(true);
  });
});
