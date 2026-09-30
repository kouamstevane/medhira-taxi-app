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

  it('gère les utilisateurs avec email manquant, undefined ou null sans crasher', () => {
    const grouped = groupUsersByIdentity([
      { id: 'user-phone-only', firstName: 'William', lastName: 'Tewe', phoneNumber: '+33612345678' },
      { id: 'user-null-email', firstName: 'Bob', lastName: 'Martin', email: null, phoneNumber: '+33698765432' },
      { id: 'user-undefined-email', firstName: 'Alice', lastName: 'Dupont', email: undefined },
    ]);

    expect(grouped).toHaveLength(3);
    expect(grouped[0].id).toBe('user-phone-only');
    expect(grouped[0].email).toBe('');
    expect(grouped[0].roles).toContain('client');
    expect(grouped[1].id).toBe('user-null-email');
    expect(grouped[2].id).toBe('user-undefined-email');
  });

  it('détecte correctement les rôles sous forme de tableau ou activeRole', () => {
    const grouped = groupUsersByIdentity([
      { id: 'user-driver-arr', firstName: 'Chauffeur', lastName: 'Un', roles: ['driver'], activeRole: 'driver' },
      { id: 'user-active-resto', firstName: 'Chef', lastName: 'Resto', activeRole: 'restaurant' },
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].roles).toContain('driver');
    expect(grouped[1].roles).toContain('restaurant');
  });
});
