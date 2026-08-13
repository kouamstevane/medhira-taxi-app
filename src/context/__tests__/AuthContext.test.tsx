import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  auth: {
    get currentUser() {
      return mockUser;
    },
  },
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

let reloadPromise: Promise<void> | undefined;

function ReloadConsumer() {
  return (
    <AuthContext.Consumer>
      {(value) => (
        <div>
          <span data-testid="reload-auth-status">{value?.authStatus}</span>
          <button type="button" onClick={() => { reloadPromise = value?.reloadUser(); }}>
            Recharger
          </button>
        </div>
      )}
    </AuthContext.Consumer>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    mockGetDoc.mockClear();
    mockUser.getIdToken.mockReset();
    mockUser.getIdToken.mockResolvedValue('token');
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

  it('keeps the Firebase session when token refresh fails because of the network', async () => {
    mockUser.getIdToken.mockRejectedValue({
      code: 'auth/network-request-failed',
      message: 'Firebase: Error (auth/network-request-failed).',
    });

    render(
      <AuthProvider>
        <PaymentMethodConsumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('degraded')).toBeInTheDocument());
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it('retries profile synchronization when the browser comes back online', async () => {
    const networkError = {
      code: 'auth/network-request-failed',
      message: 'Firebase: Error (auth/network-request-failed).',
    };
    mockUser.getIdToken
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce('token');

    render(
      <AuthProvider>
        <PaymentMethodConsumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('degraded')).toBeInTheDocument());
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument());
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
  });

  it('rejects reloadUser when the user document cannot be resolved', async () => {
    reloadPromise = undefined;
    render(
      <AuthProvider>
        <ReloadConsumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(mockGetDoc).toHaveBeenCalled());
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    fireEvent.click(screen.getByRole('button', { name: 'Recharger' }));
    await expect(reloadPromise).rejects.toThrow('Impossible de recharger le profil utilisateur.');
    await waitFor(() => expect(screen.getByTestId('reload-auth-status')).toHaveTextContent('unauthenticated'));
    expect(mockUser.reload).toHaveBeenCalledTimes(1);
  });
});
