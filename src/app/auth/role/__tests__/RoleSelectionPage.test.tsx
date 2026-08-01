import { render, screen } from '@testing-library/react';
import RoleSelectionPage from '@/app/auth/role/page';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace,
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    currentUser: null,
    userData: null,
    loading: false,
  }),
}));

describe('RoleSelectionPage', () => {
  it('links client registration to the passwordless phone flow', () => {
    render(<RoleSelectionPage />);

    expect(screen.getByRole('link', { name: /Client/i })).toHaveAttribute(
      'href',
      '/auth/register/phone',
    );
  });

  it('does not expose the legacy driver registration from role selection', () => {
    render(<RoleSelectionPage />);

    expect(screen.queryByRole('link', { name: /Chauffeur \/ Livreur/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Recevez des courses et gagnez de l'argent/i)).not.toBeInTheDocument();
  });

  it('offers a direct CV application link without exposing driver registration', () => {
    render(<RoleSelectionPage />);

    expect(screen.getByRole('link', { name: /Envoyer mon CV par e-mail/i })).toHaveAttribute(
      'href',
      '/auth/driver-application',
    );
  });
});
