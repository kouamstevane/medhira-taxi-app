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
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  profileImageUrl?: string;
  profileImage?: string;
  photoURL?: string;
  emailVerified?: boolean;
  roles?: {
    client?: AdminRoleDetails;
    driver?: AdminRoleDetails;
    restaurant?: AdminRoleDetails;
  };
  activeRole?: AdminUserRole;
  lastActiveRole?: AdminUserRole;
  accountState?: string;
  country?: string;
  address?: string;
  city?: string;
  bio?: string;
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
    const normalizedEmail = user.email.trim().toLowerCase();
    const identityKey = normalizedEmail || `id:${user.id}`;
    const existing = groups.get(identityKey);

    if (!existing) {
      groups.set(identityKey, {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
        roles: [],
        roleUserIds: {},
        roleDetails: {},
        activeRole: user.activeRole,
        profileImageUrl: user.profileImageUrl || user.profileImage || user.photoURL,
        emailVerified: user.emailVerified,
        lastActiveRole: user.lastActiveRole,
        accountState: user.accountState,
        country: user.country,
        address: user.address,
        city: user.city,
        bio: user.bio,
        updatedAt: user.updatedAt,
      });
    }

    const group = groups.get(identityKey)!;
    const detectedRoles = (['restaurant', 'driver', 'client'] as const).filter((role) => user.roles?.[role] != null);

    for (const role of detectedRoles) {
      if (!group.roles.includes(role)) group.roles.push(role);
      group.roleUserIds[role] ??= user.id;
      group.roleDetails[role] ??= user.roles?.[role];
    }

    group.activeRole ??= user.activeRole;
    group.profileImageUrl ??= user.profileImageUrl || user.profileImage || user.photoURL;
    group.emailVerified ??= user.emailVerified;
    group.lastActiveRole ??= user.lastActiveRole;
    group.accountState ??= user.accountState;
    group.country ??= user.country;
    group.address ??= user.address;
    group.city ??= user.city;
    group.bio ??= user.bio;
    group.updatedAt ??= user.updatedAt;

    if (detectedRoles.length === 0) {
      if (!group.roles.includes('client')) group.roles.push('client');
      group.roleUserIds.client ??= user.id;
      group.roleDetails.client ??= user.roles?.client;
    }
  }

  return Array.from(groups.values());
}
