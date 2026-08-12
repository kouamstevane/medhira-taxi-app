import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RestaurantPortalHeader } from '../RestaurantPortalHeader';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockSignOut = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services', () => ({
  AuthService: {
    signOut: (...args: unknown[]) => mockSignOut(...args),
  },
}));

jest.mock('@/components/role/RoleSwitcher', () => ({
  RoleSwitcher: ({ allowClientActivation }: { allowClientActivation?: boolean }) => (
    <div data-testid="portal-role-toggle">{allowClientActivation ? 'client-activation-enabled' : 'disabled'}</div>
  ),
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockSignOut.mockClear();
});

describe('RestaurantPortalHeader', () => {
  it('renders the compact role toggle with client activation enabled', () => {
    render(<RestaurantPortalHeader restaurantName="Chez Medjira" />);

    expect(screen.getByText('Chez Medjira')).toBeInTheDocument();
    expect(screen.getByTestId('portal-role-toggle')).toHaveTextContent('client-activation-enabled');
  });

  it('signs out before returning to login', async () => {
    render(<RestaurantPortalHeader restaurantName="Chez Medjira" />);

    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(mockSignOut.mock.invocationCallOrder[0]).toBeLessThan(mockReplace.mock.invocationCallOrder[0]);
  });

  it('keeps the portal open when sign-out fails', async () => {
    mockSignOut.mockRejectedValueOnce(new Error('network'));
    render(<RestaurantPortalHeader restaurantName="Chez Medjira" />);

    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));

    expect(await screen.findByText('Impossible de vous déconnecter. Réessayez.')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
