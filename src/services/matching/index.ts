/**
 * Service de Matching - Exports Centraux
 * 
 * @module services/matching
 */

// Les types sont exportés depuis @/types/matching
export type {
  AvailableDriver,
  FindDriversConfig,
  RideCandidate,
  BroadcastRideParams,
  MatchingMetrics,
} from '@/types/matching';

export {
  findAvailableDrivers,
} from './findAvailableDrivers';

export {
  broadcastRideRequest,
  markCandidateAccepted,
  markCandidateDeclined,
  expireAllPendingCandidates,
  subscribeToDriverRideRequests,
  getPendingCandidatesForDriver,
} from './broadcast';

export {
  assignDriver,
  cancelAssignment,
  type AssignDriverResult,
} from './assignment';

export {
  findDriverWithRetry,
  logMatchingMetrics,
  type RetryConfig,
} from './retry';
