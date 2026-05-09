import { UserData, isClientOnly, hasRole } from '@/types/user';
import { Timestamp } from 'firebase/firestore';

describe('UserData type helpers', () => {
  const baseUser: UserData = {
    uid: 'u1',
    email: 'a@b.fr',
    emailVerified: true,
    firstName: 'A',
    lastName: 'B',
    roles: { client: { enabled: true, joinedAt: Timestamp.now() } },
    activeRole: 'client',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  test('isClientOnly returns true when only client role present', () => {
    expect(isClientOnly(baseUser)).toBe(true);
  });

  test('isClientOnly returns false when driver role added', () => {
    const u: UserData = {
      ...baseUser,
      roles: {
        ...baseUser.roles,
        driver: { joinedAt: Timestamp.now() },
      },
    };
    expect(isClientOnly(u)).toBe(false);
  });
});

describe('hasRole', () => {
  const baseUser: UserData = {
    uid: 'u1',
    email: 'a@b.fr',
    emailVerified: true,
    firstName: 'A',
    lastName: 'B',
    roles: { client: { enabled: true, joinedAt: Timestamp.now() } },
    activeRole: 'client',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  test('returns true for client (always present)', () => {
    expect(hasRole(baseUser, 'client')).toBe(true);
  });

  test('returns false for driver when absent', () => {
    expect(hasRole(baseUser, 'driver')).toBe(false);
  });

  test('returns true for driver when present', () => {
    const u = { ...baseUser, roles: { ...baseUser.roles, driver: { joinedAt: Timestamp.now() } } };
    expect(hasRole(u, 'driver')).toBe(true);
  });

  test('narrows the type when true (compile-time check)', () => {
    const u: UserData = { ...baseUser, roles: { ...baseUser.roles, driver: { joinedAt: Timestamp.now() } } };
    if (hasRole(u, 'driver')) {
      // No `!` needed — predicate must narrow `roles.driver` to non-undefined.
      const joined: import('firebase/firestore').Timestamp = u.roles.driver.joinedAt;
      expect(joined).toBeDefined();
    }
  });
});
