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
  restaurantIds?: string[];
}

export interface UserRoles {
  client?: RoleClient;
  driver?: RoleDriver;
  restaurant?: RoleRestaurant;
}

export type ActiveRole = 'client' | 'driver' | 'restaurant' | 'driver_onboarding' | 'restaurant_onboarding';
export type AppAccountState = 'active' | 'driver_onboarding' | 'restaurant_onboarding';
export type AuthStatus = 'loading' | 'authenticated' | 'degraded' | 'unauthenticated';

export interface RestaurantDraftData {
  name?: string;
  description?: string;
  cuisineTypes?: string[];
  address?: string;
  phoneNumber?: string;
  avgPricePerPerson?: number;
  openingHours?: Record<string, { open: string; close: string; closed: boolean }>;
  logoUrl?: string;
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
  accountState?: AppAccountState;

  onboarding?: {
    driver?: {
      status: 'draft' | 'submitted';
      currentStep: number;
      startedAt: Timestamp;
      updatedAt: Timestamp;
    };
    restaurant?: {
      status: 'draft' | 'submitted';
      currentStep: 2 | 3 | 4;
      startedAt: Timestamp;
      updatedAt: Timestamp;
    };
  };

  draftRestaurant?: {
    currentStep: 3 | 4;
    data: Partial<RestaurantDraftData>;
    updatedAt: Timestamp;
  };

  country?: string;
  address?: string;
  city?: string;
  bio?: string;
  stripeCustomerId?: string;
  defaultPaymentMethodId?: string;
  setupIntentId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AuthContextType {
  currentUser: FirebaseUser | null;
  loading: boolean;
  authStatus: AuthStatus;
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
  return user.roles.client != null && user.roles.driver == null && user.roles.restaurant == null;
}

export function hasRole<R extends Exclude<ActiveRole, 'driver_onboarding' | 'restaurant_onboarding'>>(
  user: UserData,
  role: R,
): user is UserData & { roles: UserRoles & Required<Pick<UserRoles, R>> } {
  return user.roles[role] != null;
}

export function isApprovedRoleStatus(status: string | undefined): boolean {
  return status === 'approved';
}
