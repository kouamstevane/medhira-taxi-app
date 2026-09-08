import { buildAdminManageUserPayload, groupUsersByIdentity } from './adminUsersUi';

describe('buildAdminManageUserPayload', () => {
  it('construit le payload attendu pour retirer le rôle restaurant', () => {
    expect(buildAdminManageUserPayload('user-1')).toEqual({
      userId: 'user-1',
      action: 'remove_role',
      role: 'restaurant',
    });
  });

  it('construit aussi le payload pour retirer le rôle chauffeur', () => {
    expect(buildAdminManageUserPayload('user-2', 'driver')).toEqual({
      userId: 'user-2',
      action: 'remove_role',
      role: 'driver',
    });
  });
});

describe('groupUsersByIdentity', () => {
  it('regroupe une même adresse email et conserve les rôles de chaque document', () => {
    const grouped = groupUsersByIdentity([
      {
        id: 'restaurant-doc',
        firstName: 'Olive',
        lastName: 'Manick',
        email: 'Olive@example.com',
        phoneNumber: '693372118',
        roles: { restaurant: { restaurantId: 'restaurant-1' } },
      },
      {
        id: 'client-doc',
        firstName: 'Olive',
        lastName: 'Manick',
        email: 'olive@example.com',
        phoneNumber: '693372118',
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toEqual(expect.objectContaining({
      firstName: 'Olive',
      roles: ['restaurant', 'client'],
      roleUserIds: { restaurant: 'restaurant-doc', client: 'client-doc' },
    }));
  });

  it('ne regroupe pas les documents qui n’ont pas d’email', () => {
    const grouped = groupUsersByIdentity([
      { id: 'user-1', firstName: 'A', lastName: 'One', email: '', roles: {} },
      { id: 'user-2', firstName: 'A', lastName: 'Two', email: '', roles: {} },
    ]);

    expect(grouped.map((user) => user.id)).toEqual(['user-1', 'user-2']);
  });
});
