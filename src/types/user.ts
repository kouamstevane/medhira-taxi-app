/**
 * Types liés aux utilisateurs et à l'authentification.
 *
 * Modèle V1 : roles cumulatifs ({ client, driver?, restaurant? }).
 * Le statut effectif d'un rôle pro est lu sur sa collection métier
 * (drivers/{uid}.status, restaurants/{id}.status), jamais dupliqué ici.
 */

import { User as FirebaseUser } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';

export interface RoleClient {
  enabled: true;
  joinedAt: Timestamp;
}

export interface RoleDriver {
  joinedAt: Timestamp;
}

export interface RoleRestaurant {
  restaurantId: string;
  joinedAt: Timestamp;
}

export interface UserRoles {
  client: RoleClient;
  driver?: RoleDriver;
  restaurant?: RoleRestaurant;
}

export type ActiveRole = 'client' | 'driver' | 'restaurant';

export interface RestaurantDraftData {
  name?: string;
  description?: string;
  cuisineTypes?: string[];
  address?: string;
  phoneNumber?: string;
  avgPricePerPerson?: number;
  openingHours?: Record<string, { open: string; close: string; closed: boolean }>;
  coverImageUrl?: string;
}

export interface UserData {
  uid: string;
  email?: string | null;
  phoneNumber?: string | null;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  profileImageUrl?: string | null;

  roles: UserRoles;
  activeRole: ActiveRole;
  lastActiveRole?: ActiveRole;

  draftRestaurant?: {
    currentStep: 3 | 4;
    data: Partial<RestaurantDraftData>;
    updatedAt: Timestamp;
  };

  country?: string;
  address?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AuthContextType {
  currentUser: FirebaseUser | null;
  loading: boolean;
  userData: UserData | null;
  error: string | null;
  isEmailVerified: boolean;
  reloadUser: () => Promise<void>;
}

export interface Country {
  code: string;
  dialCode: string;
  name: string;
  flag: string;
  defaultNumber: string;
  phoneLength: number;
}

export interface UserProfile extends UserData {
  city?: string;
  zipCode?: string;
  dateOfBirth?: Date;
  verificationStatus?: 'pending' | 'verified' | 'rejected';
}

export type { FirebaseUser };

export function isClientOnly(user: UserData): boolean {
  return user.roles.driver == null && user.roles.restaurant == null;
}

export function hasRole<R extends ActiveRole>(
  user: UserData,
  role: R,
): user is UserData & { roles: UserRoles & Required<Pick<UserRoles, R>> } {
  if (role === 'client') return true;
  return user.roles[role] != null;
}
