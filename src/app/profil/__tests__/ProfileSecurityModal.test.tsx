import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileSecurityModal } from '../ProfileSecurityModal';
import { sendPasswordResetEmail, sendEmailVerification } from 'firebase/auth';

jest.mock('firebase/auth', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendEmailVerification: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({
  auth: { currentUser: { email: 'test@example.com', emailVerified: true } },
}));

const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
  }),
}));

const mockCurrentUser = {
  email: 'test@example.com',
  emailVerified: true,
  providerData: [{ providerId: 'password' }],
};

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    currentUser: mockCurrentUser,
  }),
}));

describe('ProfileSecurityModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (sendPasswordResetEmail as jest.Mock).mockResolvedValue(undefined);
    (sendEmailVerification as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ProfileSecurityModal {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders security information with connected email and password management', () => {
    render(<ProfileSecurityModal {...defaultProps} />);

    expect(screen.getByRole('heading', { name: /Sécurité et connexion/i })).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Gestion du mot de passe/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Envoyer le lien de réinitialisation/i })).toBeInTheDocument();
  });

  it('sends password reset email on button click and displays confirmation', async () => {
    render(<ProfileSecurityModal {...defaultProps} />);

    const sendBtn = screen.getByRole('button', { name: /Envoyer le lien de réinitialisation/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        expect.objectContaining({ handleCodeInApp: false })
      );
      expect(mockShowSuccess).toHaveBeenCalled();
    });
  });

  it('calls onClose when close button is clicked', () => {
    render(<ProfileSecurityModal {...defaultProps} />);

    const closeBtn = screen.getByRole('button', { name: /Fermer/i });
    fireEvent.click(closeBtn);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
