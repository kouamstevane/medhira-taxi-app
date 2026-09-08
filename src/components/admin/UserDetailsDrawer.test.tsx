import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GroupedAdminUser } from '@/app/admin/users/adminUsersUi';
import { UserDetailsDrawer } from './UserDetailsDrawer';

jest.mock('@/components/ui/MaterialIcon', () => ({
  MaterialIcon: ({ name }: { name: string }) => <span aria-hidden="true">{name}</span>,
}));

const user: GroupedAdminUser = {
  id: 'user-123',
  firstName: 'Olive',
  lastName: 'Manick',
  email: 'olive@example.com',
  phoneNumber: '693372118',
  profileImageUrl: 'https://firebasestorage.googleapis.com/profile.jpg',
  emailVerified: true,
  activeRole: 'restaurant',
  lastActiveRole: 'restaurant',
  accountState: 'active',
  country: 'Canada',
  city: 'Edmonton',
  address: '123 Main Street',
  bio: 'Utilisateur de test',
  roles: ['restaurant', 'client'],
  roleUserIds: { restaurant: 'user-123', client: 'user-123' },
  roleDetails: { restaurant: { restaurantId: 'restaurant-1' }, client: { enabled: true } },
  createdAt: new Date('2026-01-10T00:00:00.000Z'),
};

describe('UserDetailsDrawer', () => {
  it('affiche les informations utilisateur et la photo de profil', () => {
    render(<UserDetailsDrawer user={user} onClose={jest.fn()} />);

    expect(screen.getByRole('heading', { name: 'Olive Manick' })).toBeInTheDocument();
    expect(screen.getByText('123 Main Street')).toBeInTheDocument();
    expect(screen.getByText('restaurant-1')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Photo de profil de Olive Manick' })).toHaveAttribute('src', user.profileImageUrl);
  });

  it('affiche les documents chauffeur disponibles et ferme la fiche', async () => {
    const userInteraction = userEvent.setup();
    const onClose = jest.fn();

    render(
      <UserDetailsDrawer
        user={{ ...user, roles: ['driver', 'client'], roleDetails: { driver: { joinedAt: new Date('2026-02-01') }, client: { enabled: true } } }}
        driverProfile={{ driverType: 'chauffeur', status: 'approved', licenseNumber: 'LIC-123', city: 'Edmonton' }}
        driverPrivate={{ documents: { biometricPhoto: { url: 'https://firebasestorage.googleapis.com/driver.jpg', status: 'approved' } } }}
        onClose={onClose}
      />,
    );

    expect(screen.getByText('Profil chauffeur')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Photo biométrique/ })).toHaveAttribute('href', 'https://firebasestorage.googleapis.com/driver.jpg');
    await userInteraction.click(screen.getByRole('button', { name: 'Fermer la fiche' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
