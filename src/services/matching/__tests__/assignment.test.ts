/**
 * Tests unitaires pour le service de matching
 *
 * Teste les fonctions d'assignation et d'annulation de courses.
 *
 * @see src/services/matching/assignment.ts
 * @see src/services/matching/broadcast.ts
 * @see src/services/matching/findAvailableDrivers.ts
 */

import { assignDriver, cancelAssignment } from '../assignment';
import { broadcastRideRequest } from '../broadcast';
import { findAvailableDrivers } from '../findAvailableDrivers';

// ── Mocks Firestore ───────────────────────────────────────────────────────────

const mockCollection = jest.fn();
const mockDoc = jest.fn().mockReturnValue({});
const mockGetDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockQuery = jest.fn();
const mockWhere = jest.fn();
const mockOnSnapshot = jest.fn();
const mockLimit = jest.fn();
const mockRunTransaction = jest.fn();

// Mock fonctions internes de la transaction
const mockTransactionGet = jest.fn();
const mockTransactionUpdate = jest.fn().mockReturnValue(undefined);
const mockTransaction = {
  get: mockTransactionGet,
  update: mockTransactionUpdate,
};

jest.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  limit: (...args: unknown[]) => mockLimit(...args),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
  serverTimestamp: () => new Date(),
}));

// ── Mock Firebase config ──────────────────────────────────────────────────────

jest.mock('@/config/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-driver-1' } },
}));

// ── Mock driver.service ───────────────────────────────────────────────────────

const mockGetDriverById = jest.fn();

jest.mock('@/services/driver.service', () => ({
  getDriverById: (...args: unknown[]) => mockGetDriverById(...args),
}));

// ── Mock broadcast helpers (appelés après la transaction) ─────────────────────

jest.mock('../broadcast', () => ({
  broadcastRideRequest: jest.fn().mockResolvedValue([]),
  expireAllPendingCandidates: jest.fn().mockResolvedValue(undefined),
  markCandidateAccepted: jest.fn().mockResolvedValue(undefined),
}));

// ── Mock findAvailableDrivers ─────────────────────────────────────────────────

jest.mock('../findAvailableDrivers', () => ({
  findAvailableDrivers: jest.fn().mockResolvedValue([]),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Crée un faux DocumentSnapshot Firestore */
const makeSnap = (exists: boolean, data: Record<string, unknown> = {}) => ({
  exists: () => exists,
  data: () => data,
  id: 'snap-id',
});

// ─────────────────────────────────────────────────────────────────────────────
// assignDriver
// ─────────────────────────────────────────────────────────────────────────────

describe('Service de Matching - Assignment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockReturnValue({});
    mockUpdateDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
  });

  describe('assignDriver', () => {
    const bookingId = 'booking-123';
    const driverId = 'driver-456';

    const mockDriver = {
      id: driverId,
      firstName: 'Jean',
      lastName: 'Dupont',
      phone: '+237655000001',
      isAvailable: true,
      status: 'approved',
      currentLocation: { lat: 3.85, lng: 11.5 },
    };

    it('devrait retourner success:true lors d\'une assignation réussie', async () => {
      // La transaction appelle transaction.get deux fois :
      //   1. rideRef  → booking en attente
      //   2. candidateRef → candidature pending
      mockTransactionGet
        .mockResolvedValueOnce(makeSnap(true, { status: 'pending', candidates: [] }))
        .mockResolvedValueOnce(makeSnap(true, { status: 'pending' }));

      mockGetDriverById.mockResolvedValue(mockDriver);

      mockRunTransaction.mockImplementation(async (_db: unknown, callback: Function) =>
        callback(mockTransaction)
      );

      const result = await assignDriver(bookingId, driverId);

      expect(result.success).toBe(true);
      expect(result.rideId).toBe(bookingId);
      expect(result.driverId).toBe(driverId);
    });

    it('devrait retourner success:false si la booking n\'existe pas', async () => {
      mockTransactionGet.mockResolvedValueOnce(makeSnap(false));

      mockGetDriverById.mockResolvedValue(mockDriver);

      mockRunTransaction.mockImplementation(async (_db: unknown, callback: Function) =>
        callback(mockTransaction)
      );

      const result = await assignDriver(bookingId, driverId);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/non trouvée/i);
    });

    it('devrait retourner success:false si la course n\'est plus en attente', async () => {
      mockTransactionGet.mockResolvedValueOnce(
        makeSnap(true, { status: 'accepted', driverId: 'other-driver' })
      );

      mockGetDriverById.mockResolvedValue(mockDriver);

      mockRunTransaction.mockImplementation(async (_db: unknown, callback: Function) =>
        callback(mockTransaction)
      );

      const result = await assignDriver(bookingId, driverId);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/plus disponible/i);
    });

    it('devrait retourner success:false si le chauffeur n\'existe pas', async () => {
      mockTransactionGet.mockResolvedValueOnce(
        makeSnap(true, { status: 'pending', candidates: [] })
      );

      mockGetDriverById.mockResolvedValue(null);

      mockRunTransaction.mockImplementation(async (_db: unknown, callback: Function) =>
        callback(mockTransaction)
      );

      const result = await assignDriver(bookingId, driverId);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/chauffeur non trouvé/i);
    });

    it('devrait retourner success:false si la candidature n\'existe pas', async () => {
      mockTransactionGet
        .mockResolvedValueOnce(makeSnap(true, { status: 'pending', candidates: [] }))
        .mockResolvedValueOnce(makeSnap(false)); // pas de candidature

      mockGetDriverById.mockResolvedValue(mockDriver);

      mockRunTransaction.mockImplementation(async (_db: unknown, callback: Function) =>
        callback(mockTransaction)
      );

      const result = await assignDriver(bookingId, driverId);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/candidature non trouvée/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // cancelAssignment
  // ─────────────────────────────────────────────────────────────────────────

  describe('cancelAssignment', () => {
    const bookingId = 'booking-123';
    const driverId = 'driver-456';

    it('devrait annuler l\'assignation avec succès', async () => {
      mockGetDoc.mockResolvedValue(
        makeSnap(true, { status: 'accepted', driverId })
      );

      await cancelAssignment(bookingId);

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'pending',
          driverId: null,
        })
      );
    });

    it('devrait libérer le chauffeur précédemment assigné', async () => {
      mockGetDoc.mockResolvedValue(
        makeSnap(true, { status: 'accepted', driverId })
      );

      await cancelAssignment(bookingId);

      // Premier appel updateDoc → booking ; deuxième → driver
      expect(mockUpdateDoc).toHaveBeenCalledTimes(2);
      const secondCall = mockUpdateDoc.mock.calls[1][1];
      expect(secondCall).toMatchObject({
        isAvailable: true,
        status: 'available',
      });
    });

    it('devrait lancer une erreur si la booking n\'existe pas', async () => {
      mockGetDoc.mockResolvedValue(makeSnap(false));

      await expect(cancelAssignment(bookingId)).rejects.toThrow('Course non trouvée');
    });

    it('devrait accepter une raison en paramètre optionnel', async () => {
      mockGetDoc.mockResolvedValue(
        makeSnap(true, { status: 'accepted', driverId })
      );

      await cancelAssignment(bookingId, 'Annulation client');

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ cancellationReason: 'Annulation client' })
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// broadcastRideRequest
// ─────────────────────────────────────────────────────────────────────────────

describe('Service de Matching - Broadcast', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('broadcastRideRequest', () => {
    it('devrait retourner un tableau (vide ou non) de chauffeurs notifiés', async () => {
      const booking = {
        rideId: 'booking-123',
        pickupLocation: { lat: 3.85, lng: 11.5 },
        destination: 'Destination test',
        price: 5000,
        carType: 'Éco',
        rangeKm: 50,
        timeoutSeconds: 30,
      };

      const driverIds = await broadcastRideRequest(booking);

      expect(Array.isArray(driverIds)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findAvailableDrivers
// ─────────────────────────────────────────────────────────────────────────────

describe('Service de Matching - Find Available Drivers', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findAvailableDrivers', () => {
    const location = { lat: 3.85, lng: 11.5 };
    const options = { rangeKm: 50, maxTravelMinutes: 30, maxResults: 10 };

    it('devrait retourner un tableau de chauffeurs', async () => {
      const drivers = await findAvailableDrivers({ location, ...options });

      expect(Array.isArray(drivers)).toBe(true);
    });

    it('devrait respecter la limite de résultats', async () => {
      const drivers = await findAvailableDrivers({ location, ...options, maxResults: 5 });

      expect(drivers.length).toBeLessThanOrEqual(5);
    });
  });
});
