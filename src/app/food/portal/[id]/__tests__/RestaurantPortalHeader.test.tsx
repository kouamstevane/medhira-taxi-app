import { render, screen } from '@testing-library/react';
import { RestaurantPortalHeader } from '../RestaurantPortalHeader';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('@/components/role/RoleSwitcher', () => ({
  RoleSwitcher: ({ allowClientActivation }: { allowClientActivation?: boolean }) => (
    <div data-testid="portal-role-toggle">{allowClientActivation ? 'client-activation-enabled' : 'disabled'}</div>
  ),
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}));

describe('RestaurantPortalHeader', () => {
  it('renders the restaurant name and role toggle with client activation enabled', () => {
    render(<RestaurantPortalHeader restaurantName="Chez Medjira" />);

    expect(screen.getByText('Chez Medjira')).toBeInTheDocument();
    expect(screen.getByTestId('portal-role-toggle')).toHaveTextContent('client-activation-enabled');
  });

  it('does not render a sign-out button in the header', () => {
    render(<RestaurantPortalHeader restaurantName="Chez Medjira" />);

    expect(screen.queryByRole('button', { name: /déconnecter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log\s?out/i })).not.toBeInTheDocument();
  });
});
