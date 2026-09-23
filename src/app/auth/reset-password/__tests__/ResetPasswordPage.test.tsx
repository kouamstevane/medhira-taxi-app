import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { sendPasswordResetEmail } from 'firebase/auth';
import ResetPasswordPage from '../page';

jest.mock('firebase/auth', () => ({
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { email?: string }) => {
      const translations: Record<string, string> = {
        'auth.emailSentSuccess': 'Email envoyé !',
        'auth.checkYourInbox': 'Vérifiez votre boîte email',
        'auth.helpWithPassword': 'Pas de problème, nous allons vous aider',
        'auth.enterEmailInstruction': 'Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.',
        'auth.email': 'Adresse e-mail',
        'auth.emailPlaceholder': 'votre@email.com',
        'auth.resetPasswordAction': 'Réinitialiser le mot de passe',
        'auth.validEmailPrompt': 'Veuillez entrer une adresse email valide',
        'auth.noAccountFound': 'Aucun compte associé à cet email',
        'auth.resetLinkSentTo': `Un email a été envoyé à ${params?.email ?? ''}`,
        'common.loading': 'Chargement...',
        'auth.profileSettings': 'Paramètres',
        'common.errorOccurred': 'Une erreur est survenue',
      };

      return translations[key] ?? key;
    },
  }),
}));

describe('ResetPasswordPage', () => {
  const mockedSendPasswordResetEmail = jest.mocked(sendPasswordResetEmail);

  beforeEach(() => {
    mockedSendPasswordResetEmail.mockReset();
  });

  it('rejects an invalid email without calling Firebase', () => {
    render(<ResetPasswordPage />);

    expect(screen.getByRole('link', { name: 'Paramètres' })).toHaveAttribute('href', '/profil');
    fireEvent.submit(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }).closest('form')!);

    expect(screen.getByText('Veuillez entrer une adresse email valide')).toBeInTheDocument();
    expect(mockedSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('sends a reset email with the login redirect and shows the success state', async () => {
    mockedSendPasswordResetEmail.mockResolvedValue(undefined);
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: 'client@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }));

    await waitFor(() => expect(mockedSendPasswordResetEmail).toHaveBeenCalledWith(
      expect.anything(),
      'client@example.com',
      {
        url: `${window.location.origin}/login`,
        handleCodeInApp: false,
      },
    ));

    expect(await screen.findByText('Email envoyé !')).toBeInTheDocument();
    expect(screen.getByText('Un email a été envoyé à client@example.com')).toBeInTheDocument();
  });

  it('shows a specific message when Firebase cannot find the account', async () => {
    const error = Object.assign(new Error('User not found'), { code: 'auth/user-not-found' });
    mockedSendPasswordResetEmail.mockRejectedValue(error);
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: 'unknown@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' }));

    expect(await screen.findByText('Aucun compte associé à cet email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réinitialiser le mot de passe' })).toBeEnabled();
  });
});
