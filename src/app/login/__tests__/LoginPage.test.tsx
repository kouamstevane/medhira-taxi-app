import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { secureStorage } from '@/services/secureStorage.service';
import LoginPage from '@/app/login/page';

const replace = jest.fn();
const mockCallable = jest.fn();
const mockSignOut = signOut as jest.Mock;
const mockHttpsCallable = httpsCallable as jest.Mock;
const mockRemoveItem = secureStorage.removeItem as jest.Mock;
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
  auth: { currentUser: { uid: 'draft-uid' } },
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
  secureStorage: { removeItem: jest.fn() },
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

jest.mock('@/services', () => ({
  AuthService: {
    signInWithGoogle: jest.fn(),
  },
}));

jest.mock('@/services/auth.service', () => ({
  startTwilioPhoneVerification: jest.fn(),
  verifyTwilioPhoneCodeAndSignIn: jest.fn(),
}));

describe('LoginPage phone authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHttpsCallable.mockReturnValue(mockCallable);
    mockCallable.mockResolvedValue({ data: { success: true } });
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
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('signs out and redirects to the landing page when postponed', async () => {
      render(<LoginPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Plus tard' }));

      await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
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
      expect(mockRemoveItem).toHaveBeenCalledWith('driver_registration_progress');
      expect(mockSignOut).toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith('/');
    });

    it('preserves the account and local progress when deletion fails', async () => {
      mockCallable.mockRejectedValueOnce(new Error('Erreur de suppression'));
      render(<LoginPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Abandonner cette inscription' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’abandon' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Erreur de suppression');
      expect(mockRemoveItem).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalledWith('/');
    });

    it('does not leave the flow when the deletion report is incomplete', async () => {
      mockCallable.mockResolvedValueOnce({ data: { success: false } });
      render(<LoginPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Abandonner cette inscription' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’abandon' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('La suppression du compte n’a pas pu être terminée. Réessayez.');
      expect(mockRemoveItem).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalledWith('/');
    });
  });
});
