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
});
