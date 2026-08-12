import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { httpsCallable } from 'firebase/functions';
import { secureStorage } from '@/services/secureStorage.service';
import LoginPage from '@/app/login/page';

const replace = jest.fn();
const mockCallable = jest.fn();
const mockHttpsCallable = httpsCallable as jest.Mock;
const mockClearLegacyDriverProgress = secureStorage.clearLegacyDriverProgress as jest.Mock;
let authState: { authStatus: string; userData: Record<string, unknown> | null } = {
  authStatus: 'unauthenticated',
  userData: null,
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace,
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

jest.mock('@/config/firebase', () => ({
  auth: {
    currentUser: { uid: 'draft-uid', getIdToken: jest.fn() },
    authStateReady: jest.fn(),
  },
  db: {},
  functions: {},
}));

jest.mock('firebase/auth', () => ({
  AuthErrorCodes: {
    TOO_MANY_ATTEMPTS_TRY_LATER: 'auth/too-many-requests',
    INVALID_EMAIL: 'auth/invalid-email',
    USER_DELETED: 'auth/user-not-found',
    INVALID_PASSWORD: 'auth/invalid-password',
    NETWORK_REQUEST_FAILED: 'auth/network-request-failed',
  },
  signOut: jest.fn(),
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(),
}));

jest.mock('@/services/secureStorage.service', () => ({
  secureStorage: {
    removeItem: jest.fn(),
    clearLegacyDriverProgress: jest.fn(),
  },
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteField: jest.fn(() => 'DELETE_FIELD'),
  serverTimestamp: jest.fn(() => 'TIMESTAMP'),
}));

jest.mock('@/services', () => ({
  AuthService: {
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
  },
}));

jest.mock('@/services/auth.service', () => ({
  startTwilioPhoneVerification: jest.fn(),
  verifyTwilioPhoneCodeAndSignIn: jest.fn(),
}));

const mockUpdateDoc = require('firebase/firestore').updateDoc as jest.Mock;
const mockGetDoc = require('firebase/firestore').getDoc as jest.Mock;
const mockAuthServiceSignOut = require('@/services').AuthService.signOut as jest.Mock;
const mockAuthServiceSignInWithGoogle = require('@/services').AuthService.signInWithGoogle as jest.Mock;
const mockAuth = require('@/config/firebase').auth as {
  authStateReady: jest.Mock;
  currentUser: { getIdToken: jest.Mock };
};
const mockRemoveItem = secureStorage.removeItem as jest.Mock;

describe('LoginPage phone authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthServiceSignOut.mockResolvedValue(undefined);
    mockAuthServiceSignInWithGoogle.mockReset();
    mockAuth.authStateReady.mockResolvedValue(undefined);
    mockAuth.currentUser.getIdToken.mockResolvedValue('token');
    mockHttpsCallable.mockReturnValue(mockCallable);
    mockCallable.mockResolvedValue({ data: { success: true } });
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => authState.userData });
    authState = { authStatus: 'unauthenticated', userData: null };
  });

  it('uses Twilio phone authentication instead of email and password while keeping Google sign-in', () => {
    render(<LoginPage />);

    expect(screen.getByText('Connexion par téléphone')).toBeInTheDocument();
    expect(screen.getByLabelText(/Numéro de téléphone/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Envoyer le code/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continuer avec Google/i })).toBeInTheDocument();

    expect(screen.queryByPlaceholderText('Votre email')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Mot de passe')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mot de passe oublié/i)).not.toBeInTheDocument();
  });

  describe('driver onboarding decision flow', () => {
    beforeEach(() => {
      authState = {
        authStatus: 'authenticated',
        userData: {
          accountState: 'driver_onboarding',
          activeRole: 'driver_onboarding',
          roles: {},
        },
      };
    });

    it('shows the three actions instead of redirecting automatically', async () => {
      render(<LoginPage />);

      expect(await screen.findByRole('button', { name: 'Reprendre l’inscription' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Plus tard' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Abandonner cette inscription' })).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
    });

    it('resumes the registration without signing out', async () => {
      render(<LoginPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Reprendre l’inscription' }));

      expect(replace).toHaveBeenCalledWith('/driver/register');
      expect(mockAuthServiceSignOut).not.toHaveBeenCalled();
    });

    it('signs out and redirects to the landing page when postponed', async () => {
      render(<LoginPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Plus tard' }));

      await waitFor(() => expect(mockAuthServiceSignOut).toHaveBeenCalled());
      expect(replace).toHaveBeenCalledWith('/');
      expect(mockCallable).not.toHaveBeenCalled();
    });

    it('deletes the account and local progress after confirmed abandonment', async () => {
      render(<LoginPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Abandonner cette inscription' }));
      expect(mockCallable).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’abandon' }));

      await waitFor(() => expect(mockHttpsCallable).toHaveBeenCalledWith({}, 'requestAccountDeletion'));
      expect(mockCallable).toHaveBeenCalledWith({ confirm: 'DELETE_MY_ACCOUNT' });
      expect(mockClearLegacyDriverProgress).toHaveBeenCalled();
      expect(mockAuthServiceSignOut).toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith('/');
    });

    it('preserves the account and local progress when deletion fails', async () => {
      mockCallable.mockRejectedValueOnce(new Error('Erreur de suppression'));
      render(<LoginPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Abandonner cette inscription' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’abandon' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Erreur de suppression');
      expect(mockRemoveItem).not.toHaveBeenCalled();
      expect(mockAuthServiceSignOut).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalledWith('/');
    });

    it('does not leave the flow when the deletion report is incomplete', async () => {
      mockCallable.mockResolvedValueOnce({ data: { success: false } });
      render(<LoginPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Abandonner cette inscription' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’abandon' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('La suppression du compte n’a pas pu être terminée. Réessayez.');
      expect(mockRemoveItem).not.toHaveBeenCalled();
      expect(mockAuthServiceSignOut).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalledWith('/');
    });
  });

  describe('restaurant onboarding decision flow', () => {
    beforeEach(() => {
      authState = {
        authStatus: 'authenticated',
        userData: {
          activeRole: 'client',
          roles: { client: { enabled: true } },
          onboarding: {
            restaurant: {
              status: 'draft',
              currentStep: 2,
            },
          },
        },
      };
    });

    it('shows the three actions instead of routing to the client dashboard', async () => {
      render(<LoginPage />);

      expect(await screen.findByRole('heading', { name: 'Inscription restaurateur en cours' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reprendre l’inscription' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Plus tard' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Abandonner cette inscription' })).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
    });

    it('resumes the restaurant registration', async () => {
      render(<LoginPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Reprendre l’inscription' }));

      expect(replace).toHaveBeenCalledWith('/restaurant/register?resume=restaurant');
    });

    it('abandons the restaurant draft without requesting full account deletion', async () => {
      render(<LoginPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Abandonner cette inscription' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’abandon' }));

      await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalled());
      expect(mockCallable).not.toHaveBeenCalled();
      expect(mockAuthServiceSignOut).toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith('/');
    });

    it('deletes a roleless restaurant account and its data', async () => {
      authState = {
        authStatus: 'authenticated',
        userData: {
          activeRole: 'restaurant_onboarding',
          accountState: 'restaurant_onboarding',
          roles: {},
          onboarding: {
            restaurant: {
              status: 'draft',
              currentStep: 2,
            },
          },
        },
      };

      render(<LoginPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Abandonner cette inscription' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’abandon' }));

      await waitFor(() => expect(mockCallable).toHaveBeenCalled());
      expect(mockUpdateDoc).not.toHaveBeenCalled();
      expect(mockAuthServiceSignOut).toHaveBeenCalled();
    });
  });

  it('signs out an authenticated user before allowing an account switch', async () => {
    authState = {
      authStatus: 'authenticated',
      userData: {
        activeRole: 'restaurant',
        roles: { restaurant: { restaurantId: 'restaurant-1' } },
      },
    };

    render(<LoginPage />);

    expect(await screen.findByText('Connexion par téléphone')).toBeInTheDocument();
    await waitFor(() => expect(mockAuthServiceSignOut).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
  });

  it('waits for the Firebase session before loading an approved restaurant profile', async () => {
    const restaurantUser = {
      uid: 'restaurant-user',
      roles: { restaurant: { restaurantId: 'restaurant-1' } },
      activeRole: 'restaurant',
    };

    mockAuthServiceSignInWithGoogle.mockResolvedValue({ uid: restaurantUser.uid });
    mockGetDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => restaurantUser })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ status: 'approved', stripeConnectStatus: 'not_started' }),
      });

    const { rerender } = render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /Continuer avec Google/i }));
    authState = { authStatus: 'authenticated', userData: restaurantUser };
    rerender(<LoginPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/restaurant/dashboard'));
    expect(mockAuth.authStateReady).toHaveBeenCalled();
    expect(mockAuth.currentUser.getIdToken).toHaveBeenCalledWith(true);
    expect(mockAuthServiceSignOut).not.toHaveBeenCalled();
  });

  it('clears the login state when the authenticated profile document is missing', async () => {
    mockAuthServiceSignInWithGoogle.mockResolvedValue({ uid: 'orphan-user' });
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => undefined });

    render(<LoginPage />);
    const googleButton = screen.getByRole('button', { name: /Continuer avec Google/i });

    fireEvent.click(googleButton);

    await waitFor(() => expect(screen.getByText(/session est incomplète/i)).toBeInTheDocument());
    expect(googleButton).not.toBeDisabled();
  });
});
