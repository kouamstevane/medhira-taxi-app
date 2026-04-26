const mockBroadcastRideRequest = jest.fn();

jest.mock('../broadcast', () => ({
  broadcastRideRequest: (...args: unknown[]) => mockBroadcastRideRequest(...args),
  markCandidateAccepted: jest.fn(),
  markCandidateDeclined: jest.fn(),
  expireAllPendingCandidates: jest.fn(),
  subscribeToDriverRideRequests: jest.fn(() => jest.fn()),
  getPendingCandidatesForDriver: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({ db: {} }));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(),
    logStart: jest.fn(), logSuccess: jest.fn(), logError: jest.fn(), logWarning: jest.fn(),
  })),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(),
}));

import { findDriverWithRetry, logMatchingMetrics } from '../retry';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('findDriverWithRetry', () => {
  it('retourne succes au premier essai', async () => {
    mockBroadcastRideRequest.mockResolvedValue(['d1', 'd2']);
    const result = await findDriverWithRetry('r1', { lat: 43.65, lng: -79.38 }, 'Test', 25);
    expect(result.success).toBe(true);
    expect(result.driversNotified).toBe(2);
  });

  it('reessaie et reussit', async () => {
    mockBroadcastRideRequest.mockResolvedValueOnce([]).mockResolvedValueOnce(['d1']);
    jest.useFakeTimers();
    const p = findDriverWithRetry('r1', { lat: 43.65, lng: -79.38 }, 'T', 25, undefined, 0,
      { maxRetries: 3, timeoutSeconds: 90, initialPerimeterMinutes: 5, expandedPerimeterMinutes: 10 });
    await jest.advanceTimersByTimeAsync(5000);
    const result = await p;
    expect(result.success).toBe(true);
    expect(mockBroadcastRideRequest).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('utilise perimetre elargi avec bonus', async () => {
    mockBroadcastRideRequest.mockResolvedValue(['d1']);
    await findDriverWithRetry('r1', { lat: 43.65, lng: -79.38 }, 'T', 25, undefined, 5,
      { initialPerimeterMinutes: 5, expandedPerimeterMinutes: 10, maxRetries: 3, timeoutSeconds: 90 });
    expect(mockBroadcastRideRequest).toHaveBeenCalledWith(expect.objectContaining({ maxTravelMinutes: 10 }));
  });

  it('retourne echec apres max retries', async () => {
    mockBroadcastRideRequest.mockResolvedValue([]);
    jest.useFakeTimers();
    const p = findDriverWithRetry('r1', { lat: 43.65, lng: -79.38 }, 'T', 25, undefined, 0,
      { maxRetries: 2, timeoutSeconds: 90, initialPerimeterMinutes: 5, expandedPerimeterMinutes: 10 });
    await jest.advanceTimersByTimeAsync(10000);
    const result = await p;
    expect(result.success).toBe(false);
    expect(mockBroadcastRideRequest).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('propage erreur au dernier retry', async () => {
    // maxRetries: 1 → le catch relance immédiatement l'erreur, pas de setTimeout impliqué
    mockBroadcastRideRequest.mockRejectedValueOnce(new Error('unavailable'));
    await expect(
      findDriverWithRetry('r1', { lat: 43.65, lng: -79.38 }, 'T', 25, undefined, 0,
        { maxRetries: 1, timeoutSeconds: 90, initialPerimeterMinutes: 5, expandedPerimeterMinutes: 10 })
    ).rejects.toThrow('unavailable');
  });
});

describe('logMatchingMetrics', () => {
  it('n enclave pas', async () => {
    await expect(logMatchingMetrics({
      rideId: 'r1', timestamp: new Date(),
      initialRange: 20, initialTravelTime: 5, finalRange: 30, finalTravelTime: 10,
      retryCount: 2, driversNotified: 5, success: true, duration: 3000, bonusUsed: 0,
    })).resolves.toBeUndefined();
  });
});
