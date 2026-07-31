import { render, screen } from '@testing-library/react';
import LoginPage from '@/app/login/page';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace,
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    authStatus: 'unauthenticated',
    userData: null,
  }),
}));

jest.mock('@/config/firebase', () => ({
  auth: {},
  db: {},
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
});
