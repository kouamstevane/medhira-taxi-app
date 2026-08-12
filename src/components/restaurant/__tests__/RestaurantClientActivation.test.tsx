import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { RestaurantClientActivation } from '../RestaurantClientActivation';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({
  auth: { currentUser: { uid: 'user-1' } },
  db: {},
  functions: {},
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...args: unknown[]) => args),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(() => 'timestamp'),
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(),
}));

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span>{name}</span>,
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedUseRouter = useRouter as jest.Mock;
const mockedUpdateDoc = updateDoc as jest.Mock;

describe('RestaurantClientActivation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseRouter.mockReturnValue({ push: jest.fn(), replace: jest.fn() });
    mockedUseAuth.mockReturnValue({ reloadUser: jest.fn().mockResolvedValue(undefined) });
    mockedUpdateDoc.mockResolvedValue(undefined);
  });

  it('reloads the user profile before replacing the route with the client dashboard', async () => {
    const reloadUser = jest.fn().mockResolvedValue(undefined);
    const replace = jest.fn();
    mockedUseAuth.mockReturnValue({ reloadUser });
    mockedUseRouter.mockReturnValue({ push: jest.fn(), replace });

    render(<RestaurantClientActivation hasClientRole />);
    fireEvent.click(screen.getByRole('button', { name: /Basculer vers l'espace client/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));

    expect(reloadUser).toHaveBeenCalledTimes(1);
    expect(reloadUser.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockedUpdateDoc.mock.invocationCallOrder[0],
    );
    expect(replace.mock.invocationCallOrder[0]).toBeGreaterThan(
      reloadUser.mock.invocationCallOrder[0],
    );
  });

  it('keeps the user on the portal when refreshing the profile fails', async () => {
    const reloadUser = jest.fn().mockRejectedValue(new Error('Profil indisponible'));
    const replace = jest.fn();
    mockedUseAuth.mockReturnValue({ reloadUser });
    mockedUseRouter.mockReturnValue({ push: jest.fn(), replace });

    render(<RestaurantClientActivation hasClientRole />);
    fireEvent.click(screen.getByRole('button', { name: /Basculer vers l'espace client/i }));

    expect(await screen.findByText('Profil indisponible')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith('/dashboard');
  });
});
