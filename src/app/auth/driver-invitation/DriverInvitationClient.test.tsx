import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DriverInvitationClient from './DriverInvitationClient';
import { httpsCallable } from 'firebase/functions';
import {
  createAuthAccount,
  createDriverOnboardingAccount,
  signInWithGoogleForDriver,
} from '@/services/auth.service';

const replace = jest.fn();
const showError = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({
  auth: { signOut: jest.fn().mockResolvedValue(undefined) },
  functions: {},
}));

jest.mock('@/services/auth.service', () => ({
  createAuthAccount: jest.fn(),
  createDriverOnboardingAccount: jest.fn(),
  signInWithGoogleForDriver: jest.fn(),
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: () => null,
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showError }),
}));

describe('DriverInvitationClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.pushState({}, '', '/auth/driver-invitation?invitationId=invite-123');
    (httpsCallable as jest.Mock).mockImplementation((_functions: unknown, name: string) => {
      if (name === 'validateDriverInvitation') {
        return jest.fn().mockResolvedValue({ data: { success: true, role: 'chauffeur' } });
      }
      return jest.fn().mockResolvedValue({ data: { success: true } });
    });
    (createDriverOnboardingAccount as jest.Mock).mockResolvedValue({ uid: 'driver-1' });
  });

  afterEach(() => {
    window.history.pushState({}, '', '/auth/driver-invitation');
  });

  it('explains that an application is required without an invitation id', () => {
    window.history.pushState({}, '', '/auth/driver-invitation');

    render(<DriverInvitationClient />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Vous devez d’abord déposer votre candidature en cliquant sur « Vous souhaitez devenir chauffeur / livreur »',
    );
    expect(screen.queryByLabelText(/Code reçu par email/i)).not.toBeInTheDocument();
  });

  it('requires the invitation code before calling the validator', async () => {
    render(<DriverInvitationClient />);

    fireEvent.change(screen.getByLabelText(/Adresse email autorisée/i), {
      target: { value: 'driver@example.com' },
    });
    fireEvent.submit(screen.getByTestId('driver-invitation-code-form'));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith('Saisissez le code reçu par e-mail.');
    });
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it('sends invitation validation failures through the shared toast', async () => {
    (httpsCallable as jest.Mock).mockImplementation((_functions: unknown, name: string) => {
      if (name === 'validateDriverInvitation') {
        return jest.fn().mockRejectedValue({ code: 'functions/permission-denied' });
      }
      return jest.fn().mockResolvedValue({ data: { success: true } });
    });

    render(<DriverInvitationClient />);
    fireEvent.change(screen.getByLabelText(/Adresse email autorisée/i), {
      target: { value: 'driver@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Code reçu par email/i), {
      target: { value: 'AB12CD34' },
    });
    fireEvent.submit(screen.getByTestId('driver-invitation-code-form'));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith('L’adresse email ou le code ne correspond pas à l’invitation.');
    });
  });

  it('uses the shared input field styling for invitation fields', () => {
    render(<DriverInvitationClient />);

    for (const label of [/Adresse email autorisée/i, /Code reçu par email/i]) {
      expect(screen.getByLabelText(label)).toHaveClass(
        'autofill-dark',
        'h-14',
        'focus:ring-2',
        'focus:border-[#f29200]',
      );
    }
  });

  it('creates the invitation account as a driver onboarding account', async () => {
    render(<DriverInvitationClient />);

    fireEvent.change(screen.getByLabelText(/Adresse email autorisée/i), {
      target: { value: 'driver@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Code reçu par email/i), {
      target: { value: 'AB12CD34' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Vérifier mon invitation/i }));

    await screen.findByRole('button', { name: /Créer avec email et mot de passe/i });
    fireEvent.change(screen.getByLabelText(/Mot de passe/i), {
      target: { value: 'password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Créer avec email et mot de passe/i }));

    await waitFor(() => {
      expect(createDriverOnboardingAccount).toHaveBeenCalledWith('driver@example.com', 'password-123');
    });
    expect(createAuthAccount).not.toHaveBeenCalled();
  });

  it('rejects a Google account whose email differs from the invitation', async () => {
    (signInWithGoogleForDriver as jest.Mock).mockResolvedValue({ email: 'other@example.com' });

    render(<DriverInvitationClient />);
    expect(screen.queryByLabelText(/Identifiant de l’invitation/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Adresse email autorisée/i), {
      target: { value: 'driver@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Code reçu par email/i), {
      target: { value: 'AB12CD34' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Vérifier mon invitation/i }));

    await screen.findByRole('button', { name: /Continuer avec Google/i });
    fireEvent.click(screen.getByRole('button', { name: /Continuer avec Google/i }));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        'Cette adresse Google ne correspond pas à l’adresse email de l’invitation.',
      );
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it('completes a matching Google invitation and opens driver registration', async () => {
    (signInWithGoogleForDriver as jest.Mock).mockResolvedValue({ email: 'driver@example.com' });

    render(<DriverInvitationClient />);
    expect(screen.queryByLabelText(/Identifiant de l’invitation/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Adresse email autorisée/i), {
      target: { value: 'driver@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Code reçu par email/i), {
      target: { value: 'AB12CD34' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Vérifier mon invitation/i }));
    await screen.findByRole('button', { name: /Continuer avec Google/i });
    fireEvent.click(screen.getByRole('button', { name: /Continuer avec Google/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/driver/register'));
  });
});
