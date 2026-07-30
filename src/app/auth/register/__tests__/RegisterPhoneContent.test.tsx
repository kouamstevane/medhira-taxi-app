import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RegisterPhoneContent from '@/app/auth/register/RegisterPhoneContent';
import { auth } from '@/config/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
  }),
}));

jest.mock('@/config/firebase', () => ({
  auth: { settings: {} },
}));

jest.mock('firebase/auth', () => ({
  AuthErrorCodes: {
    TOO_MANY_ATTEMPTS_TRY_LATER: 'auth/too-many-requests',
    INVALID_PHONE_NUMBER: 'auth/invalid-phone-number',
    NETWORK_REQUEST_FAILED: 'auth/network-request-failed',
  },
  RecaptchaVerifier: jest.fn().mockImplementation(() => ({
    clear: jest.fn(),
  })),
  signInWithPhoneNumber: jest.fn(),
}));

jest.mock('@/services/auth.service', () => ({
  confirmPhoneSignIn: jest.fn(),
  upsertPhoneClientUserDocument: jest.fn(),
}));

describe('RegisterPhoneContent passwordless flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render password fields in the phone registration flow', () => {
    render(<RegisterPhoneContent />);

    expect(screen.queryByLabelText(/^Mot de passe/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Confirmer le mot de passe/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('•••••••')).not.toBeInTheDocument();
    expect(screen.queryByText(/Inscription par email/i)).not.toBeInTheDocument();
  });

  it('uses the shared form field component styling', () => {
    render(<RegisterPhoneContent />);

    expect(screen.getByLabelText(/Nom complet/i)).toHaveClass('glass-input');
    expect(screen.getByLabelText(/Nom complet/i)).toHaveClass('autofill-dark');
    expect(screen.getByLabelText(/Nom complet/i)).toHaveClass('focus:ring-[#f29200]');
    expect(screen.getByText('Nom complet')).toHaveClass('text-[#9CA3AF]');
  });

  it('requires identity and phone before sending an SMS code', () => {
    render(<RegisterPhoneContent />);

    fireEvent.click(screen.getByRole('button', { name: /Envoyer le code/i }));

    expect(screen.getByText('Nom complet requis')).toBeInTheDocument();
    expect(screen.getByText('Numéro de téléphone requis')).toBeInTheDocument();
    expect(signInWithPhoneNumber).not.toHaveBeenCalled();
  });

  it('uses a compact identity field and an integrated phone country prefix', () => {
    render(<RegisterPhoneContent />);

    expect(screen.getByRole('form', { name: /Inscription par téléphone/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nom complet/i)).toHaveAttribute('autoComplete', 'name');
    expect(screen.queryByLabelText(/^Prénom/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Nom$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Pays$/i)).not.toBeInTheDocument();

    const phoneInput = screen.getByLabelText(/Numéro de téléphone/i);
    expect(phoneInput).toHaveAttribute('autoComplete', 'tel-national');
    expect(phoneInput).toHaveAttribute('inputMode', 'tel');

    const countryButton = screen.getByRole('button', { name: /Indicatif Canada \+1/i });
    expect(countryButton).toHaveTextContent('CA');
    expect(countryButton).toHaveTextContent('+1');
    expect(countryButton).not.toHaveTextContent('Canada');
    expect(countryButton).toHaveAttribute('aria-expanded', 'false');
    expect(countryButton).toHaveAttribute('aria-haspopup', 'listbox');
  });

  it('keeps the country list in the form flow when expanded', () => {
    render(<RegisterPhoneContent />);

    fireEvent.click(screen.getByRole('button', { name: /Indicatif Canada \+1/i }));

    expect(screen.getByRole('listbox', { name: /Pays disponibles/i })).not.toHaveClass('absolute');
  });

  it('submits the phone form from the form submit event', async () => {
    (signInWithPhoneNumber as jest.Mock).mockResolvedValue({
      verificationId: 'verification-id',
    });

    render(<RegisterPhoneContent />);

    fireEvent.change(screen.getByPlaceholderText('Jean Dupont'), {
      target: { name: 'fullName', value: 'Jean Dupont' },
    });
    fireEvent.change(screen.getByPlaceholderText('5550123456'), {
      target: { value: '5550123456' },
    });
    fireEvent.submit(screen.getByRole('form', { name: /Inscription par téléphone/i }));

    await waitFor(() => {
      expect(signInWithPhoneNumber).toHaveBeenCalledWith(
        auth,
        '+15550123456',
        expect.anything(),
      );
    });
  });

  it('sends a Firebase SMS code with the selected phone number', async () => {
    (signInWithPhoneNumber as jest.Mock).mockResolvedValue({
      verificationId: 'verification-id',
    });

    render(<RegisterPhoneContent />);

    fireEvent.change(screen.getByPlaceholderText('Jean Dupont'), {
      target: { name: 'fullName', value: 'Jean Dupont' },
    });
    fireEvent.change(screen.getByPlaceholderText('5550123456'), {
      target: { value: '5550123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le code/i }));

    await waitFor(() => {
      expect(signInWithPhoneNumber).toHaveBeenCalledWith(
        auth,
        '+15550123456',
        expect.anything(),
      );
    });
    expect(await screen.findByText('Code de vérification (6 chiffres)')).toBeInTheDocument();
  });

  it('initializes invisible reCAPTCHA on the visible submit button', async () => {
    (signInWithPhoneNumber as jest.Mock).mockResolvedValue({
      verificationId: 'verification-id',
    });

    render(<RegisterPhoneContent />);

    const submitButton = screen.getByRole('button', { name: /Envoyer le code/i });

    fireEvent.change(screen.getByPlaceholderText('Jean Dupont'), {
      target: { name: 'fullName', value: 'Jean Dupont' },
    });
    fireEvent.change(screen.getByPlaceholderText('5550123456'), {
      target: { value: '5550123456' },
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(RecaptchaVerifier).toHaveBeenCalledWith(
        auth,
        submitButton.id,
        expect.objectContaining({ size: 'invisible' }),
      );
    });
  });

  it('explains what to do when the SMS does not arrive', async () => {
    (signInWithPhoneNumber as jest.Mock).mockResolvedValue({
      verificationId: 'verification-id',
    });

    render(<RegisterPhoneContent />);

    fireEvent.change(screen.getByPlaceholderText('Jean Dupont'), {
      target: { name: 'fullName', value: 'Jean Dupont' },
    });
    fireEvent.change(screen.getByPlaceholderText('5550123456'), {
      target: { value: '5550123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le code/i }));

    expect(await screen.findByText('Demande de code envoyée à +15550123456')).toBeInTheDocument();
    expect(screen.queryByText(/Code de vérification envoyé/i)).not.toBeInTheDocument();
    expect(screen.getByText("Vous n'avez rien reçu ?")).toBeInTheDocument();
    expect(screen.getByText(/Le SMS peut prendre jusqu'à une minute/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Changer le numéro/i })).toBeInTheDocument();
  });

  it('shows developer diagnostics when a Cameroon SMS request is accepted but the code may not arrive', async () => {
    (signInWithPhoneNumber as jest.Mock).mockResolvedValue({
      verificationId: 'verification-id',
    });

    render(<RegisterPhoneContent />);

    fireEvent.change(screen.getByPlaceholderText('Jean Dupont'), {
      target: { name: 'fullName', value: 'Jean Dupont' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Indicatif Canada \+1/i }));
    fireEvent.click(screen.getByRole('option', { name: /CM \+237 Cameroun/i }));
    fireEvent.change(screen.getByPlaceholderText('655744484'), {
      target: { value: '682821031' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le code/i }));

    expect(await screen.findByText('Demande de code envoyée à +237682821031')).toBeInTheDocument();
    expect(screen.getByText(/Diagnostic développeur/i)).toBeInTheDocument();
    expect(screen.getByText(/SMS region policy/i)).toBeInTheDocument();
    expect(screen.getByText(/Marché actif : CA/i)).toBeInTheDocument();
  });

  it('surfaces Firebase internal phone auth details in development', async () => {
    (signInWithPhoneNumber as jest.Mock).mockRejectedValue({
      code: 'auth/internal-error',
      message: 'Firebase: Error (auth/internal-error).',
      customData: {
        serverResponse: JSON.stringify({
          error: {
            message: 'TOO_MANY_ATTEMPTS_TRY_LATER',
          },
        }),
      },
    });

    render(<RegisterPhoneContent />);

    fireEvent.change(screen.getByPlaceholderText('Jean Dupont'), {
      target: { name: 'fullName', value: 'Jean Dupont' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Indicatif Canada \+1/i }));
    fireEvent.click(screen.getByRole('option', { name: /CM \+237 Cameroun/i }));
    fireEvent.change(screen.getByPlaceholderText('655744484'), {
      target: { value: '693372118' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le code/i }));

    expect(await screen.findByText(/Erreur Firebase interne/i)).toBeInTheDocument();
    expect(screen.getByText(/TOO_MANY_ATTEMPTS_TRY_LATER/i)).toBeInTheDocument();
  });

  it('surfaces Firebase invalid app credential details in development', async () => {
    (signInWithPhoneNumber as jest.Mock).mockRejectedValue({
      code: 'auth/invalid-app-credential',
      message: 'Firebase: Error (auth/invalid-app-credential).',
      customData: {
        serverResponse: JSON.stringify({
          error: {
            message: 'INVALID_APP_CREDENTIAL : Recaptcha token is invalid.',
          },
        }),
      },
    });

    render(<RegisterPhoneContent />);

    fireEvent.change(screen.getByPlaceholderText('Jean Dupont'), {
      target: { name: 'fullName', value: 'Jean Dupont' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Indicatif Canada \+1/i }));
    fireEvent.click(screen.getByRole('option', { name: /CM \+237 Cameroun/i }));
    fireEvent.change(screen.getByPlaceholderText('655744484'), {
      target: { value: '693372118' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le code/i }));

    expect(await screen.findByText(/Jeton reCAPTCHA refusé/i)).toBeInTheDocument();
    expect(screen.getByText(/Recaptcha token is invalid/i)).toBeInTheDocument();
  });
});
