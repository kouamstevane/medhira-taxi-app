import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

describe('buildActivateClientRoleUpdate', () => {
  test('adds the client role without changing the active role', async () => {
    const { buildActivateClientRoleUpdate } = await import('../activateClientRole.js');
    const now = Symbol('serverTimestamp') as unknown as FirebaseFirestore.FieldValue;

    expect(buildActivateClientRoleUpdate(now)).toEqual({
      'roles.client': { enabled: true, joinedAt: now },
      accountState: 'active',
      updatedAt: now,
    });
  });
});
