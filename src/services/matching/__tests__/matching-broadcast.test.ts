jest.mock('@/config/firebase', () => ({
  db: {},
}));

jest.mock('@/services/driver.service', () => ({
  getDriverById: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(),
    logStart: jest.fn(), logSuccess: jest.fn(), logError: jest.fn(), logWarning: jest.fn(),
  })),
}));

const mockGetDocs = jest.fn();
const mockGetDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDoc = jest.fn();
const mockCollection = jest.fn();
const mockQuery = jest.fn();
const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();
const mockOnSnapshot = jest.fn(() => jest.fn());
const mockWriteBatch = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  limit: (...args: unknown[]) => mockLimit(...args),
  onSnapshot: (...args: unknown[]) => (mockOnSnapshot as (...a: unknown[]) => unknown)(...args),
  serverTimestamp: () => ({ _ts: 'server-timestamp' }),
  Timestamp: {
    fromDate: jest.fn((d: Date) => ({
      seconds: Math.floor(d.getTime() / 1000),
      toDate: () => d,
    })),
  },
  writeBatch: (...args: unknown[]) => mockWriteBatch(...args),
  runTransaction: jest.fn(),
  setDoc: jest.fn(),
}));

import {
  broadcastRideRequest,
  markCandidateAccepted,
  markCandidateDeclined,
  expireAllPendingCandidates,
  subscribeToDriverRideRequests,
  getPendingCandidatesForDriver,
} from '../broadcast';
import { findAvailableDrivers } from '../findAvailableDrivers';

function setupMocks() {
  mockCollection.mockReturnValue('mock-collection');
  mockDoc.mockReturnValue('mock-doc');
  mockQuery.mockReturnValue('mock-query');
  mockWhere.mockReturnValue('mock-where');
  mockOrderBy.mockReturnValue('mock-orderby');
  mockLimit.mockReturnValue('mock-limit');
}

function createDriverDoc(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: () => ({
      firstName: 'Jean', lastName: 'Dupont', status: 'approved',
      isAvailable: true, currentLocation: { lat: 43.6532, lng: -79.3832 },
      rating: 4.5, tripsAccepted: 50, tripsDeclined: 10,
      car: { model: 'Civic', plate: 'ABC-123', color: 'Blanc' },
      ...overrides,
    }),
    ref: { id },
  };
}

describe('FindAvailableDrivers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('retourne [] si aucun chauffeur approuve', async () => {
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    const result = await findAvailableDrivers({ location: { lat: 43.65, lng: -79.38 }, maxTravelMinutes: 5 });
    expect(result).toEqual([]);
  });

  it('filtre les chauffeurs sans localisation', async () => {
    mockGetDocs.mockResolvedValue({ docs: [createDriverDoc('d1', { currentLocation: null })], empty: false });
    const result = await findAvailableDrivers({ location: { lat: 43.65, lng: -79.38 }, maxTravelMinutes: 30 });
    expect(result).toEqual([]);
  });

  it('filtre les chauffeurs indisponibles', async () => {
    mockGetDocs.mockResolvedValue({ docs: [createDriverDoc('d1', { isAvailable: false })], empty: false });
    const result = await findAvailableDrivers({ location: { lat: 43.65, lng: -79.38 }, maxTravelMinutes: 30 });
    expect(result).toEqual([]);
  });

  it('filtre les chauffeurs hors rayon', async () => {
    mockGetDocs.mockResolvedValue({ docs: [createDriverDoc('d1', { currentLocation: { lat: 44.0, lng: -80.0 } })], empty: false });
    const result = await findAvailableDrivers({ location: { lat: 43.65, lng: -79.38 }, rangeKm: 5, maxTravelMinutes: 30 });
    expect(result).toEqual([]);
  });

  it('retourne des chauffeurs proches', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        createDriverDoc('d1', { currentLocation: { lat: 43.655, lng: -79.385 } }),
        createDriverDoc('d2', { currentLocation: { lat: 43.653, lng: -79.382 } }),
      ],
      empty: false,
    });
    const result = await findAvailableDrivers({ location: { lat: 43.65, lng: -79.38 }, rangeKm: 50, maxTravelMinutes: 30 });
    expect(result.length).toBeGreaterThan(0);
  });

  it('respecte maxResults', async () => {
    const drivers = Array.from({ length: 10 }, (_, i) =>
      createDriverDoc(`d${i}`, { currentLocation: { lat: 43.65 + i * 0.001, lng: -79.38 + i * 0.001 } })
    );
    mockGetDocs.mockResolvedValue({ docs: drivers, empty: false });
    const result = await findAvailableDrivers({ location: { lat: 43.65, lng: -79.38 }, rangeKm: 50, maxTravelMinutes: 60, maxResults: 3 });
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('propage les erreurs Firestore', async () => {
    mockGetDocs.mockRejectedValue(new Error('unavailable'));
    await expect(findAvailableDrivers({ location: { lat: 43.65, lng: -79.38 }, maxTravelMinutes: 5 }))
      .rejects.toThrow('Erreur lors de la recherche de chauffeurs');
  });
});

describe('Broadcast - broadcastRideRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('retourne [] si aucun chauffeur via Firestore', async () => {
    mockGetDocs.mockResolvedValue({ docs: [], empty: true });
    mockWriteBatch.mockReturnValue({ set: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) });
    const result = await broadcastRideRequest({
      rideId: 'ride-1', pickupLocation: { lat: 43.65, lng: -79.38 },
      destination: 'Test', price: 25,
    });
    expect(result).toEqual([]);
  });

  it('cree des candidatures quand des chauffeurs existent', async () => {
    const batch = { set: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) };
    mockWriteBatch.mockReturnValue(batch);
    mockGetDocs.mockResolvedValue({
      docs: [createDriverDoc('d1', { currentLocation: { lat: 43.653, lng: -79.382 } })],
      empty: false,
    });
    const result = await broadcastRideRequest({
      rideId: 'ride-1', pickupLocation: { lat: 43.65, lng: -79.38 },
      destination: 'Test', price: 25, timeoutSeconds: 90,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(batch.commit).toHaveBeenCalled();
  });
});

describe('Broadcast - markCandidateAccepted', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('retourne false si candidature inexistante', async () => {
    mockGetDoc.mockResolvedValue({ exists: false });
    expect(await markCandidateAccepted('r1', 'd1')).toBe(false);
  });

  it('retourne false si deja traitee', async () => {
    mockGetDoc.mockResolvedValue({ exists: true, data: () => ({ status: 'accepted' }) });
    expect(await markCandidateAccepted('r1', 'd1')).toBe(false);
  });

  it('retourne false si expiree', async () => {
    mockGetDoc.mockResolvedValue({
      exists: true,
      data: () => ({ status: 'pending', expiresAt: { toDate: () => new Date(Date.now() - 60000) } }),
    });
    mockUpdateDoc.mockResolvedValue(undefined);
    expect(await markCandidateAccepted('r1', 'd1')).toBe(false);
  });

  it('retourne false en cas d erreur', async () => {
    mockGetDoc.mockRejectedValue(new Error('fail'));
    expect(await markCandidateAccepted('r1', 'd1')).toBe(false);
  });
});

describe('Broadcast - markCandidateDeclined', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('ne fait rien si inexistante', async () => {
    mockGetDoc.mockResolvedValue({ exists: false });
    await markCandidateDeclined('r1', 'd1');
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('gere les erreurs', async () => {
    mockGetDoc.mockRejectedValue(new Error('fail'));
    await expect(markCandidateDeclined('r1', 'd1')).resolves.toBeUndefined();
  });
});

describe('Broadcast - expireAllPendingCandidates', () => {
  beforeEach(() => { jest.clearAllMocks(); setupMocks(); });

  it('met a jour les pending', async () => {
    mockGetDocs.mockResolvedValue({ docs: [{ ref: 'r1' }, { ref: 'r2' }], size: 2 });
    mockUpdateDoc.mockResolvedValue(undefined);
    await expireAllPendingCandidates('ride-1');
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
  });

  it('gere liste vide', async () => {
    mockGetDocs.mockResolvedValue({ docs: [], size: 0 });
    await expireAllPendingCandidates('ride-1');
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('gere les erreurs', async () => {
    mockGetDocs.mockRejectedValue(new Error('fail'));
    await expect(expireAllPendingCandidates('ride-1')).resolves.toBeUndefined();
  });
});

describe('Broadcast - subscribeToDriverRideRequests', () => {
  beforeEach(() => { jest.clearAllMocks(); setupMocks(); });

  it('retourne unsubscribe', () => {
    mockOnSnapshot.mockReturnValue(jest.fn());
    expect(typeof subscribeToDriverRideRequests('d1', jest.fn())).toBe('function');
  });
});

describe('Broadcast - getPendingCandidatesForDriver', () => {
  beforeEach(() => { jest.clearAllMocks(); setupMocks(); });

  it('retourne [] si vide', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    expect(await getPendingCandidatesForDriver('d1')).toEqual([]);
  });

  it('retourne demandes non expirees', async () => {
    const fd = new Date(Date.now() + 60000);
    const ts = { toDate: () => fd };
    mockGetDocs.mockResolvedValue({
      docs: [{ id: 'r1', data: () => ({ status: 'pending', expiresAt: ts, createdAt: ts, distance: 2.5, travelTimeMinutes: 5, bonus: 0 }) }],
    });
    const r = await getPendingCandidatesForDriver('d1');
    expect(r).toHaveLength(1);
    expect(r[0].rideId).toBe('r1');
  });

  it('exclut expirees', async () => {
    const pd = new Date(Date.now() - 60000);
    const ts = { toDate: () => pd };
    mockGetDocs.mockResolvedValue({
      docs: [{ id: 'r1', data: () => ({ status: 'pending', expiresAt: ts, createdAt: ts, distance: 2.5, travelTimeMinutes: 5, bonus: 0 }) }],
    });
    expect(await getPendingCandidatesForDriver('d1')).toHaveLength(0);
  });

  it('retourne [] en cas d erreur', async () => {
    mockGetDocs.mockRejectedValue(new Error('fail'));
    expect(await getPendingCandidatesForDriver('d1')).toEqual([]);
  });
});
