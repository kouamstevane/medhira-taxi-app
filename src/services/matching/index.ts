/**
 * Service de Matching - Exports Centraux
 * 
 * @module services/matching
 */

export {
  findAvailableDrivers,
  type AvailableDriver,
  type FindAvailableDriversParams,
} from './findAvailableDrivers';

export {
  broadcastRideRequest,
  markCandidateAccepted,
  markCandidateDeclined,
  expireAllPendingCandidates,
  subscribeToDriverRideRequests,
  getPendingCandidatesForDriver,
  type RideCandidate,
  type BroadcastRideParams,
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
  type MatchingMetrics,
} from './retry';

