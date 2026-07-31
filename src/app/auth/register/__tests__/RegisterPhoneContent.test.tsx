import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RegisterPhoneContent from '@/app/auth/register/RegisterPhoneContent';
import {
  startTwilioPhoneVerification,
  verifyTwilioPhoneCodeAndSignIn,
} from '@/services/auth.service';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
  }),
}));

jest.mock('firebase/auth', () => ({
  AuthErrorCodes: {
    TOO_MANY_ATTEMPTS_TRY_LATER: 'auth/too-many-requests',
    INVALID_PHONE_NUMBER: 'auth/invalid-phone-number',
    NETWORK_REQUEST_FAILED: 'auth/network-request-failed',
  },
}));

jest.mock('@/services/auth.service', () => ({
  startTwilioPhoneVerification: jest.fn(),
  verifyTwilioPhoneCodeAndSignIn: jest.fn(),
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
    expect(startTwilioPhoneVerification).not.toHaveBeenCalled();
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
    (startTwilioPhoneVerification as jest.Mock).mockResolvedValue({
      success: true,
      phoneNumber: '+15550123456',
      maskedPhone: '+1******3456',
      resendAfterSec: 60,
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
      expect(startTwilioPhoneVerification).toHaveBeenCalledWith('+15550123456');
    });
  });

  it('sends a Twilio SMS code with the selected phone number', async () => {
    (startTwilioPhoneVerification as jest.Mock).mockResolvedValue({
      success: true,
      phoneNumber: '+15550123456',
      maskedPhone: '+1******3456',
      resendAfterSec: 60,
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
      expect(startTwilioPhoneVerification).toHaveBeenCalledWith('+15550123456');
    });
    expect(await screen.findByText('Code de vérification (6 chiffres)')).toBeInTheDocument();
  });

  it('accepts a single name before sending a Twilio SMS code', async () => {
    (startTwilioPhoneVerification as jest.Mock).mockResolvedValue({
      success: true,
      phoneNumber: '+237682821031',
      maskedPhone: '+237*****1031',
      resendAfterSec: 60,
    });

    render(<RegisterPhoneContent />);

    fireEvent.change(screen.getByPlaceholderText('Jean Dupont'), {
      target: { name: 'fullName', value: 'kameni' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Indicatif Canada \+1/i }));
    fireEvent.click(screen.getByRole('option', { name: /CM \+237 Cameroun/i }));
    fireEvent.change(screen.getByPlaceholderText('655744484'), {
      target: { value: '682821031' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le code/i }));

    await waitFor(() => {
      expect(startTwilioPhoneVerification).toHaveBeenCalledWith('+237682821031');
    });
    expect(screen.queryByText('Entrez votre nom et prénom')).not.toBeInTheDocument();
  });

  it('explains what to do when the SMS does not arrive', async () => {
    (startTwilioPhoneVerification as jest.Mock).mockResolvedValue({
      success: true,
      phoneNumber: '+15550123456',
      maskedPhone: '+1******3456',
      resendAfterSec: 60,
    });

    render(<RegisterPhoneContent />);

    fireEvent.change(screen.getByPlaceholderText('Jean Dupont'), {
      target: { name: 'fullName', value: 'Jean Dupont' },
    });
    fireEvent.change(screen.getByPlaceholderText('5550123456'), {
      target: { value: '5550123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le code/i }));

    expect(await screen.findByText('Demande de code envoyée à +1******3456')).toBeInTheDocument();
    expect(screen.queryByText(/Code de vérification envoyé/i)).not.toBeInTheDocument();
    expect(screen.getByText("Vous n'avez rien reçu ?")).toBeInTheDocument();
    expect(screen.getByText(/Le SMS peut prendre jusqu'à une minute/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Changer le numéro/i })).toBeInTheDocument();
  });

  it('does not show Firebase SMS diagnostics after a Twilio request is accepted', async () => {
    (startTwilioPhoneVerification as jest.Mock).mockResolvedValue({
      success: true,
      phoneNumber: '+237682821031',
      maskedPhone: '+237*****1031',
      resendAfterSec: 60,
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

    expect(await screen.findByText('Demande de code envoyée à +237*****1031')).toBeInTheDocument();
    expect(screen.queryByText(/Diagnostic développeur/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/SMS region policy/i)).not.toBeInTheDocument();
  });

  it('surfaces Twilio start verification errors', async () => {
    (startTwilioPhoneVerification as jest.Mock).mockRejectedValue({
      code: 'functions/resource-exhausted',
      message: 'Trop de codes envoyés. Réessayez plus tard.',
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

    expect(await screen.findByText(/Trop de codes envoyés/i)).toBeInTheDocument();
  });

  it('explains when the Twilio callable is not deployed or configured', async () => {
    (startTwilioPhoneVerification as jest.Mock).mockRejectedValue({
      code: 'functions/internal',
      message: 'internal',
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

    expect(await screen.findByText(/service SMS est temporairement indisponible/i)).toBeInTheDocument();
  });

  it('verifies the Twilio code and routes the client to payment setup', async () => {
    (startTwilioPhoneVerification as jest.Mock).mockResolvedValue({
      success: true,
      phoneNumber: '+237682821031',
      maskedPhone: '+237*****1031',
      resendAfterSec: 60,
    });
    (verifyTwilioPhoneCodeAndSignIn as jest.Mock).mockResolvedValue({
      uid: 'client_phone_123',
      isNewUser: true,
      user: {
        uid: 'client_phone_123',
      },
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

    await screen.findByText('Code de vérification (6 chiffres)');
    fireEvent.change(screen.getByPlaceholderText('123456'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Créer mon compte/i }));

    await waitFor(() => {
      expect(verifyTwilioPhoneCodeAndSignIn).toHaveBeenCalledWith({
        phoneNumber: '+237682821031',
        code: '123456',
        profile: {
          firstName: 'Jean',
          lastName: 'Dupont',
          country: 'CM',
        },
      });
      expect(push).toHaveBeenCalledWith('/auth/setup-payment');
    });
  });
});
