/**
 * Index Central des Types TypeScript
 * 
 * Ce fichier ré-exporte tous les types de l'application depuis leurs modules respectifs.
 * Structure organisée par domaine pour une meilleure maintenabilité.
 * 
 * Architecture:
 * - user.ts     : Types liés aux utilisateurs et authentification
 * - booking.ts  : Types liés aux réservations et localisation
 * - taxi.ts     : Types liés aux chauffeurs et véhicules
 * - wallet.ts   : Types liés au portefeuille et transactions
 * 
 * @module types
 */

import { Timestamp } from 'firebase/firestore';

// ==================== Utilisateurs & Authentification ====================
export type {
  UserType,
  UserData,
  AuthContextType,
  Country,
  UserProfile,
  FirebaseUser,
} from './user';

// ==================== Réservations & Localisation ====================
export type {
  Location,
  PlaceSuggestion,
  BookingStatus,
  Booking,
  CarType,
  PricingConfig,
  PriceCalculation,
  PreciseLocation,
} from './booking';

// ==================== Chauffeurs & Véhicules ====================
export type {
  DriverStatus,
  Driver,
  VehicleInfo,
  DriverLicense,
  Rating,
  LiveLocation,
} from './taxi';

// ==================== Portefeuille & Transactions ====================
export type {
  TransactionType,
  TransactionStatus,
  PaymentMethod,
  Transaction,
  Wallet,
  RechargeRequest,
  TransactionHistory,
} from './wallet';

// ==================== Matching & Candidatures ====================
export type {
  CandidateStatus,
  RideCandidate,
  BroadcastRideParams,
  AvailableDriver,
  FindDriversConfig,
  DriverSearchResult,
  MatchingMetrics,
} from './matching';

// ==================== Re-export Firebase Types ====================
export type { Timestamp };

