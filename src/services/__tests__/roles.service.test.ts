import { Timestamp } from 'firebase/firestore';
import { UserData } from '@/types/user';
import {
  isApprovedDriver,
  isApprovedRestaurateur,
  getEffectiveRoleStatus,
  getDashboardRouteFor,
  getRouteForPostLogin,
  toRestaurantEffectiveStatus,
} from '@/services/roles.service';

jest.mock('firebase/firestore', () => {
  const actual = jest.requireActual('firebase/firestore');
  return {
    ...actual,
    getDoc: jest.fn(),
    doc: jest.fn((_db, ...path) => ({ path: path.join('/') })),
  };
});

import { getDoc } from 'firebase/firestore';
const mockGetDoc = getDoc as jest.Mock;

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

describe('roles.service', () => {
  beforeEach(() => mockGetDoc.mockReset());

  describe('isApprovedDriver', () => {
    test('returns false when user has no driver role', async () => {
      expect(await isApprovedDriver(baseUser)).toBe(false);
      expect(mockGetDoc).not.toHaveBeenCalled();
    });

    test('returns false when drivers/{uid} status is pending', async () => {
      const user = { ...baseUser, roles: { ...baseUser.roles, driver: { joinedAt: Timestamp.now() } } };
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ status: 'pending' }) });
      expect(await isApprovedDriver(user)).toBe(false);
    });

    test('returns true when drivers/{uid} status is approved', async () => {
      const user = { ...baseUser, roles: { ...baseUser.roles, driver: { joinedAt: Timestamp.now() } } };
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ status: 'approved' }) });
      expect(await isApprovedDriver(user)).toBe(true);
    });
  });

  describe('isApprovedRestaurateur', () => {
    test('returns false when user has no restaurant role', async () => {
      expect(await isApprovedRestaurateur(baseUser)).toBe(false);
    });

    test('returns false when ownerId mismatch (integrity check)', async () => {
      const user = { ...baseUser, roles: { ...baseUser.roles, restaurant: { restaurantId: 'r1', joinedAt: Timestamp.now() } } };
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ status: 'approved', ownerId: 'OTHER_UID' }),
      });
      expect(await isApprovedRestaurateur(user)).toBe(false);
    });

    test('returns true when status approved and ownerId matches', async () => {
      const user = { ...baseUser, roles: { ...baseUser.roles, restaurant: { restaurantId: 'r1', joinedAt: Timestamp.now() } } };
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ status: 'approved', ownerId: 'u1' }),
      });
      expect(await isApprovedRestaurateur(user)).toBe(true);
    });
  });

  describe('getEffectiveRoleStatus', () => {
    test('returns "approved" for client role unconditionally', async () => {
      expect(await getEffectiveRoleStatus(baseUser, 'client')).toBe('approved');
    });

    test('returns drivers/{uid}.status when role is driver', async () => {
      const user = { ...baseUser, roles: { ...baseUser.roles, driver: { joinedAt: Timestamp.now() } } };
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ status: 'pending' }) });
      expect(await getEffectiveRoleStatus(user, 'driver')).toBe('pending');
    });

    test('returns "missing" when role absent on user', async () => {
      expect(await getEffectiveRoleStatus(baseUser, 'driver')).toBe('missing');
    });
  });
});

describe('getDashboardRouteFor (matrice §4.4)', () => {
  test('client role -> /dashboard', () => {
    expect(getDashboardRouteFor('client', { restaurantStatus: 'approved', stripeConnectStatus: 'active' })).toBe('/dashboard');
  });

  test('driver pending -> /driver/dashboard (read-only handled by page)', () => {
    expect(getDashboardRouteFor('driver', { driverStatus: 'pending' })).toBe('/driver/dashboard');
  });

  test('driver approved -> /driver/dashboard', () => {
    expect(getDashboardRouteFor('driver', { driverStatus: 'approved' })).toBe('/driver/dashboard');
  });

  test('driver rejected -> /driver/pending', () => {
    expect(getDashboardRouteFor('driver', { driverStatus: 'rejected' })).toBe('/driver/pending');
  });

  test('driver suspended -> /driver/suspended', () => {
    expect(getDashboardRouteFor('driver', { driverStatus: 'suspended' })).toBe('/driver/suspended');
  });

  test('restaurant pending -> /restaurant/pending', () => {
    expect(getDashboardRouteFor('restaurant', { restaurantStatus: 'pending', stripeConnectStatus: 'not_started' })).toBe('/restaurant/pending');
  });

  test('restaurant rejected -> /restaurant/pending', () => {
    expect(getDashboardRouteFor('restaurant', { restaurantStatus: 'rejected', stripeConnectStatus: 'not_started' })).toBe('/restaurant/pending');
  });

  test('restaurant approved + stripe not_started -> /restaurant/dashboard', () => {
    expect(getDashboardRouteFor('restaurant', { restaurantStatus: 'approved', stripeConnectStatus: 'not_started' })).toBe('/restaurant/dashboard');
  });

  test('restaurant approved + stripe in_progress -> /restaurant/dashboard', () => {
    expect(getDashboardRouteFor('restaurant', { restaurantStatus: 'approved', stripeConnectStatus: 'in_progress' })).toBe('/restaurant/dashboard');
  });

  test('restaurant approved + stripe active -> /restaurant/dashboard', () => {
    expect(getDashboardRouteFor('restaurant', { restaurantStatus: 'approved', stripeConnectStatus: 'active' })).toBe('/restaurant/dashboard');
  });

  test('restaurant approved + stripe restricted -> /restaurant/dashboard', () => {
    expect(getDashboardRouteFor('restaurant', { restaurantStatus: 'approved', stripeConnectStatus: 'restricted' })).toBe('/restaurant/dashboard');
  });

  test('restaurant suspended -> /restaurant/suspended', () => {
    expect(getDashboardRouteFor('restaurant', { restaurantStatus: 'suspended', stripeConnectStatus: 'active' })).toBe('/restaurant/suspended');
  });
});

describe('toRestaurantEffectiveStatus', () => {
  test('returns undefined for undefined input', () => {
    expect(toRestaurantEffectiveStatus(undefined)).toBeUndefined();
  });

  test('extracts with defaults when fields missing', () => {
    const result = toRestaurantEffectiveStatus({});
    expect(result).toEqual({ status: 'pending_approval', stripeConnectStatus: 'not_started' });
  });

  test('extracts provided values', () => {
    const result = toRestaurantEffectiveStatus({ status: 'approved', stripeConnectStatus: 'active' });
    expect(result).toEqual({ status: 'approved', stripeConnectStatus: 'active' });
  });
});

describe('getRouteForPostLogin', () => {
  const clientUser: UserData = {
    ...baseUser,
    roles: { client: { enabled: true, joinedAt: Timestamp.now() } },
  };

  const multiRoleUser: UserData = {
    ...baseUser,
    roles: {
      client: { enabled: true, joinedAt: Timestamp.now() },
      driver: { joinedAt: Timestamp.now() },
    },
    activeRole: 'client',
  };

  const tripleRoleUser: UserData = {
    ...baseUser,
    roles: {
      client: { enabled: true, joinedAt: Timestamp.now() },
      driver: { joinedAt: Timestamp.now() },
      restaurant: { restaurantId: 'r1', joinedAt: Timestamp.now() },
    },
    activeRole: 'client',
  };

  test('single-role client -> /dashboard', () => {
    expect(getRouteForPostLogin(clientUser, {})).toBe('/dashboard');
  });

  test('single-role driver approved -> /driver/dashboard', () => {
    const user: UserData = {
      ...baseUser,
      roles: {
        client: { enabled: true, joinedAt: Timestamp.now() },
        driver: { joinedAt: Timestamp.now() },
      },
      activeRole: 'driver',
      lastActiveRole: 'driver',
    };
    expect(getRouteForPostLogin(user, { driver: 'approved' })).toBe('/driver/dashboard');
  });

  test('single-role restaurant pending_approval -> /restaurant/pending', () => {
    const user: UserData = {
      ...baseUser,
      roles: {
        client: { enabled: true, joinedAt: Timestamp.now() },
        restaurant: { restaurantId: 'r1', joinedAt: Timestamp.now() },
      },
      activeRole: 'restaurant',
      lastActiveRole: 'restaurant',
    };
    expect(getRouteForPostLogin(user, {
      restaurant: { status: 'pending_approval', stripeConnectStatus: 'not_started' },
    })).toBe('/restaurant/pending');
  });

  test('single-role restaurant suspended -> /restaurant/suspended', () => {
    const user: UserData = {
      ...baseUser,
      roles: {
        client: { enabled: true, joinedAt: Timestamp.now() },
        restaurant: { restaurantId: 'r1', joinedAt: Timestamp.now() },
      },
      activeRole: 'restaurant',
      lastActiveRole: 'restaurant',
    };
    expect(getRouteForPostLogin(user, {
      restaurant: { status: 'suspended', stripeConnectStatus: 'active' },
    })).toBe('/restaurant/suspended');
  });

  test('multi-role with valid lastActiveRole -> routes to that role dashboard', () => {
    const user: UserData = { ...multiRoleUser, lastActiveRole: 'driver' };
    expect(getRouteForPostLogin(user, { driver: 'approved' })).toBe('/driver/dashboard');
  });

  test('multi-role with valid lastActiveRole client -> /dashboard', () => {
    const user: UserData = { ...multiRoleUser, lastActiveRole: 'client' };
    expect(getRouteForPostLogin(user, {})).toBe('/dashboard');
  });

  test('multi-role without lastActiveRole -> /auth/continue-as', () => {
    expect(getRouteForPostLogin(multiRoleUser, {})).toBe('/auth/continue-as');
  });

  test('multi-role with lastActiveRole undefined -> /auth/continue-as', () => {
    const user: UserData = { ...tripleRoleUser };
    expect(getRouteForPostLogin(user, {})).toBe('/auth/continue-as');
  });

  test('lastActiveRole invalid (role removed) -> fallback to first approved pro then client', () => {
    const user: UserData = {
      ...baseUser,
      roles: {
        client: { enabled: true, joinedAt: Timestamp.now() },
        driver: { joinedAt: Timestamp.now() },
      },
      activeRole: 'client',
      lastActiveRole: 'restaurant' as UserData['lastActiveRole'],
    };
    expect(getRouteForPostLogin(user, { driver: 'approved' })).toBe('/driver/dashboard');
  });

  test('lastActiveRole invalid, no approved pro -> fallback to client', () => {
    const user: UserData = {
      ...baseUser,
      roles: {
        client: { enabled: true, joinedAt: Timestamp.now() },
        driver: { joinedAt: Timestamp.now() },
      },
      activeRole: 'client',
      lastActiveRole: 'restaurant' as UserData['lastActiveRole'],
    };
    expect(getRouteForPostLogin(user, { driver: 'pending' })).toBe('/dashboard');
  });

  test('no roles at all -> /dashboard', () => {
    const user: UserData = {
      ...baseUser,
      roles: {} as UserData['roles'],
      activeRole: 'client',
    };
    expect(getRouteForPostLogin(user, {})).toBe('/dashboard');
  });
});
