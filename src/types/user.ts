/**
 * Types liés aux utilisateurs et à l'authentification
 *
 * @module types/user
 */

import { User as FirebaseUser } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';

/**
 * Type d'utilisateur dans l'application
 * ✅ CORRECTION : 'chauffeur' unifié avec les règles Firestore (était 'driver')
 */
export type UserType = 'client' | 'chauffeur';

/**
 * Données utilisateur stockées dans Firestore
 */
export interface UserData {
  uid: string;
  email?: string | null;
  phoneNumber?: string | null;
  firstName: string;
  lastName: string;
  profileImageUrl?: string|null;
  userType: UserType;
  country?: string;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

/**
 * Contexte d'authentification
 */
export interface AuthContextType {
  currentUser: FirebaseUser | null;
  loading: boolean;
  userData: UserData | null;
  error: string | null;
  isEmailVerified: boolean;
  reloadUser: () => Promise<void>;
}

/**
 * Configuration d'un pays supporté
 */
export interface Country {
  code: string;
  dialCode: string;
  name: string;
  flag: string;
  defaultNumber: string;
}

/**
 * Profil utilisateur étendu (pour les paramètres avancés)
 */
export interface UserProfile extends UserData {
  address?: string;
  city?: string;
  zipCode?: string;
  dateOfBirth?: Date;
  verificationStatus?: 'pending' | 'verified' | 'rejected';
}

// Re-export Firebase User type
export type { FirebaseUser };
