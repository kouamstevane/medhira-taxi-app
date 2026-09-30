export type AdminUserRole = 'client' | 'driver' | 'restaurant';
export type AdminManageableRole = Exclude<AdminUserRole, 'client'>;

export interface AdminRoleDetails {
  restaurantId?: string;
  joinedAt?: unknown;
  enabled?: boolean;
}

export type AdminManageUserPayload = {
  userId: string;
  action: 'remove_role';
  role: AdminManageableRole;
};

export interface AdminUserRecord {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  profileImageUrl?: string | null;
  profileImage?: string | null;
  photoURL?: string | null;
  emailVerified?: boolean;
  roles?: {
    client?: AdminRoleDetails;
    driver?: AdminRoleDetails;
    restaurant?: AdminRoleDetails;
  } | AdminUserRole[] | null;
  activeRole?: AdminUserRole | string | null;
  lastActiveRole?: AdminUserRole | string | null;
  accountState?: string | null;
  country?: string | null;
  address?: string | null;
  city?: string | null;
  bio?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GroupedAdminUser extends Omit<AdminUserRecord, 'roles'> {
  roles: AdminUserRole[];
  roleUserIds: Partial<Record<AdminUserRole, string>>;
  roleDetails: Partial<Record<AdminUserRole, AdminRoleDetails>>;
  activeRole?: AdminUserRole;
  profileImageUrl?: string;
  emailVerified?: boolean;
  lastActiveRole?: AdminUserRole;
  accountState?: string;
  country?: string;
  address?: string;
  city?: string;
  bio?: string;
  updatedAt?: unknown;
}

export function buildAdminManageUserPayload(
  userId: string,
  role: AdminManageableRole = 'restaurant',
): AdminManageUserPayload {
  return {
    userId,
    action: 'remove_role',
    role,
  };
}

export function groupUsersByIdentity(users: AdminUserRecord[]): GroupedAdminUser[] {
  const groups = new Map<string, GroupedAdminUser>();

  for (const user of users) {
    const rawEmail = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    const identityKey = rawEmail || `id:${user.id}`;
    const existing = groups.get(identityKey);

    if (!existing) {
      groups.set(identityKey, {
        id: user.id,
        firstName: typeof user.firstName === 'string' ? user.firstName : '',
        lastName: typeof user.lastName === 'string' ? user.lastName : '',
        email: typeof user.email === 'string' ? user.email : '',
        phoneNumber: typeof user.phoneNumber === 'string' ? user.phoneNumber : undefined,
        createdAt: user.createdAt,
        roles: [],
        roleUserIds: {},
        roleDetails: {},
        activeRole: (user.activeRole === 'client' || user.activeRole === 'driver' || user.activeRole === 'restaurant') ? user.activeRole : undefined,
        profileImageUrl: user.profileImageUrl || user.profileImage || user.photoURL || undefined,
        emailVerified: user.emailVerified,
        lastActiveRole: (user.lastActiveRole === 'client' || user.lastActiveRole === 'driver' || user.lastActiveRole === 'restaurant') ? user.lastActiveRole : undefined,
        accountState: typeof user.accountState === 'string' ? user.accountState : undefined,
        country: typeof user.country === 'string' ? user.country : undefined,
        address: typeof user.address === 'string' ? user.address : undefined,
        city: typeof user.city === 'string' ? user.city : undefined,
        bio: typeof user.bio === 'string' ? user.bio : undefined,
        updatedAt: user.updatedAt,
      });
    }

    const group = groups.get(identityKey)!;
    const detectedRoles: AdminUserRole[] = [];

    if (Array.isArray(user.roles)) {
      for (const role of user.roles) {
        if ((role === 'restaurant' || role === 'driver' || role === 'client') && !detectedRoles.includes(role)) {
          detectedRoles.push(role);
        }
      }
    } else if (user.roles && typeof user.roles === 'object') {
      for (const role of ['restaurant', 'driver', 'client'] as const) {
        if (user.roles[role] != null && !detectedRoles.includes(role)) {
          detectedRoles.push(role);
        }
      }
    }

    if (user.activeRole && (user.activeRole === 'restaurant' || user.activeRole === 'driver' || user.activeRole === 'client')) {
      if (!detectedRoles.includes(user.activeRole)) {
        detectedRoles.push(user.activeRole);
      }
    }

    for (const role of detectedRoles) {
      if (!group.roles.includes(role)) group.roles.push(role);
      group.roleUserIds[role] ??= user.id;
      if (user.roles && typeof user.roles === 'object' && !Array.isArray(user.roles)) {
        group.roleDetails[role] ??= user.roles[role];
      }
    }

    group.activeRole ??= (user.activeRole === 'client' || user.activeRole === 'driver' || user.activeRole === 'restaurant') ? user.activeRole : undefined;
    group.profileImageUrl ??= user.profileImageUrl || user.profileImage || user.photoURL || undefined;
    group.emailVerified ??= user.emailVerified;
    group.lastActiveRole ??= (user.lastActiveRole === 'client' || user.lastActiveRole === 'driver' || user.lastActiveRole === 'restaurant') ? user.lastActiveRole : undefined;
    group.accountState ??= typeof user.accountState === 'string' ? user.accountState : undefined;
    group.country ??= typeof user.country === 'string' ? user.country : undefined;
    group.address ??= typeof user.address === 'string' ? user.address : undefined;
    group.city ??= typeof user.city === 'string' ? user.city : undefined;
    group.bio ??= typeof user.bio === 'string' ? user.bio : undefined;
    group.updatedAt ??= user.updatedAt;

    if (detectedRoles.length === 0) {
      if (!group.roles.includes('client')) group.roles.push('client');
      group.roleUserIds.client ??= user.id;
      if (user.roles && typeof user.roles === 'object' && !Array.isArray(user.roles)) {
        group.roleDetails.client ??= user.roles.client;
      }
    }
  }

  return Array.from(groups.values());
}
