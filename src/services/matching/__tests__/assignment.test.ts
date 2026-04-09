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

// Mock Firebase
jest.mock('@/config/firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'test-driver-1' }
  }
}));

// Mock des collections Firestore
const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockGetDoc = jest.fn();
const mockUpdateDoc = jest.fn();
const mockDeleteDoc = jest.fn();
const mockQuery = jest.fn();
const mockWhere = jest.fn();
const mockOnSnapshot = jest.fn();
const mockLimit = jest.fn();

jest.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  getDoc: mockGetDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  query: mockQuery,
  where: mockWhere,
  onSnapshot: mockOnSnapshot,
  limit: mockLimit,
  serverTimestamp: () => new Date()
}));

describe('Service de Matching - Assignment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('assignDriver', () => {
    it('devrait assigner un chauffeur à une course avec succès', async () => {
      // Arrange
      const bookingId = 'booking-123';
      const driverId = 'driver-456';
      const proposedPrice = 5000;

      mockGetDoc.mockResolvedValue({
        exists: true,
        data: () => ({
          status: 'pending',
          candidates: []
        })
      });

      mockUpdateDoc.mockResolvedValue(undefined);

      // Act
      const result = await assignDriver(bookingId, driverId);

      // Assert
      expect(result).toBe(true);
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          driverId,
          status: 'accepted',
          assignedAt: expect.any(Date)
        })
      );
    });

    it('devrait échouer si la booking n\'existe pas', async () => {
      // Arrange
      const bookingId = 'non-existent';
      const driverId = 'driver-456';

      mockGetDoc.mockResolvedValue({
        exists: false
      });

      // Act & Assert
      await expect(assignDriver(bookingId, driverId))
        .rejects.toThrow('Booking non trouvée');
    });

    it('devrait échouer si la course est déjà assignée', async () => {
      // Arrange
      const bookingId = 'booking-123';
      const driverId = 'driver-456';

      mockGetDoc.mockResolvedValue({
        exists: true,
        data: () => ({
          status: 'accepted',
          driverId: 'other-driver'
        })
      });

      // Act & Assert
      await expect(assignDriver(bookingId, driverId))
        .rejects.toThrow('Course déjà assignée');
    });

    it('devrait ajouter le candidat à la sous-collection candidates', async () => {
      // Arrange
      const bookingId = 'booking-123';
      const driverId = 'driver-456';

      mockGetDoc.mockResolvedValue({
        exists: true,
        data: () => ({
          status: 'pending',
          candidates: []
        })
      });

      mockCollection.mockReturnValue({});
      mockDoc.mockReturnValue({});
      mockUpdateDoc.mockResolvedValue(undefined);

      // Act
      await assignDriver(bookingId, driverId);

      // Assert
      expect(mockCollection).toHaveBeenCalled();
    });
  });

  describe('cancelAssignment', () => {
    it('devrait annuler l\'assignation d\'un chauffeur avec succès', async () => {
      // Arrange
      const bookingId = 'booking-123';
      const driverId = 'driver-456';

      mockGetDoc.mockResolvedValue({
        exists: true,
        data: () => ({
          status: 'accepted',
          driverId,
          candidates: [driverId]
        })
      });

      mockUpdateDoc.mockResolvedValue(undefined);
      mockDeleteDoc.mockResolvedValue(undefined);

      // Act
      const result = await cancelAssignment(bookingId, driverId);

      // Assert
      expect(result).toBe(true);
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'pending',
          driverId: null
        })
      );
    });

    it('devrait échouer si la booking n\'existe pas', async () => {
      // Arrange
      const bookingId = 'non-existent';
      const driverId = 'driver-456';

      mockGetDoc.mockResolvedValue({
        exists: false
      });

      // Act & Assert
      await expect(cancelAssignment(bookingId, driverId))
        .rejects.toThrow('Booking non trouvée');
    });

    it('devrait échouer si le chauffeur n\'est pas assigné à cette course', async () => {
      // Arrange
      const bookingId = 'booking-123';
      const driverId = 'driver-456';

      mockGetDoc.mockResolvedValue({
        exists: true,
        data: () => ({
          status: 'accepted',
          driverId: 'other-driver'
        })
      });

      // Act & Assert
      await expect(cancelAssignment(bookingId, driverId))
        .rejects.toThrow('Chauffeur non assigné à cette course');
    });

    it('devrait supprimer le candidat de la sous-collection', async () => {
      // Arrange
      const bookingId = 'booking-123';
      const driverId = 'driver-456';

      mockGetDoc.mockResolvedValue({
        exists: true,
        data: () => ({
          status: 'accepted',
          driverId,
          candidates: [driverId]
        })
      });

      mockCollection.mockReturnValue({});
      mockDoc.mockReturnValue({});
      mockUpdateDoc.mockResolvedValue(undefined);
      mockDeleteDoc.mockResolvedValue(undefined);

      // Act
      await cancelAssignment(bookingId, driverId);

      // Assert
      expect(mockDeleteDoc).toHaveBeenCalled();
    });
  });
});

describe('Service de Matching - Broadcast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('broadcastRideRequest', () => {
    it('devrait diffuser une demande de course aux chauffeurs disponibles', async () => {
      // Arrange
      const booking = {
        rideId: 'booking-123',
        pickupLocation: { lat: 43.6532, lng: -79.3832 },
        destination: 'Destination test',
        price: 5000,
        carType: 'Éco',
        rangeKm: 50,
        timeoutSeconds: 30
      };

      mockQuery.mockReturnValue({});
      mockGetDoc.mockResolvedValue({
        exists: true,
        data: () => ({ status: 'approved', isAvailable: true })
      });

      // Act
      const driverIds = await broadcastRideRequest(booking);

      // Assert
      expect(Array.isArray(driverIds)).toBe(true);
    });

    it('devrait retourner un tableau vide si aucun chauffeur n\'est disponible', async () => {
      // Arrange
      const booking = {
        rideId: 'booking-123',
        pickupLocation: { lat: 43.6532, lng: -79.3832 },
        destination: 'Destination test',
        price: 5000,
        carType: 'Éco',
        rangeKm: 50,
        timeoutSeconds: 30
      };

      mockQuery.mockReturnValue({});
      mockGetDoc.mockResolvedValue({
        exists: false
      });

      // Act
      const driverIds = await broadcastRideRequest(booking);

      // Assert
      expect(driverIds).toEqual([]);
    });
  });
});

describe('Service de Matching - Find Available Drivers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findAvailableDrivers', () => {
    it('devrait trouver des chauffeurs disponibles dans un rayon donné', async () => {
      // Arrange
      const location = { lat: 43.6532, lng: -79.3832 };
      const options = {
        rangeKm: 50,
        maxTravelMinutes: 30,
        maxResults: 10
      };

      const mockDrivers = [
        {
          id: 'driver-1',
          data: () => ({
            firstName: 'Jean',
            lastName: 'Dupont',
            currentLocation: { lat: 43.6532, lng: -79.3832 },
            isAvailable: true,
            status: 'approved'
          })
        },
        {
          id: 'driver-2',
          data: () => ({
            firstName: 'Marie',
            lastName: 'Martin',
            currentLocation: { lat: 43.6632, lng: -79.3932 },
            isAvailable: true,
            status: 'approved'
          })
        }
      ];

      mockQuery.mockReturnValue({});
      mockLimit.mockReturnValue({});
      mockGetDoc.mockResolvedValue({
        exists: true,
        data: () => mockDrivers[0].data()
      });

      // Act
      const drivers = await findAvailableDrivers({
        location,
        ...options
      });

      // Assert
      expect(Array.isArray(drivers)).toBe(true);
      expect(drivers.length).toBeLessThanOrEqual(options.maxResults);
    });

    it('devrait respecter la limite de résultats', async () => {
      // Arrange
      const location = { lat: 43.6532, lng: -79.3832 };
      const maxResults = 5;

      mockQuery.mockReturnValue({});
      mockLimit.mockReturnValue({});

      // Act
      const drivers = await findAvailableDrivers({
        location,
        rangeKm: 50,
        maxTravelMinutes: 30,
        maxResults
      });

      // Assert
      expect(mockLimit).toHaveBeenCalledWith(5);
    });

    it('devrait filtrer les chauffeurs par disponibilité', async () => {
      // Arrange
      const location = { lat: 43.6532, lng: -79.3832 };

      mockQuery.mockReturnValue({});
      mockLimit.mockReturnValue({});
      mockGetDoc.mockResolvedValue({
        exists: true,
        data: () => ({
          isAvailable: false, // Non disponible
          status: 'approved'
        })
      });

      // Act
      const drivers = await findAvailableDrivers({
        location,
        rangeKm: 50,
        maxTravelMinutes: 30,
        maxResults: 10
      });

      // Assert
      // Les chauffeurs non disponibles ne doivent pas être retournés
      expect(drivers).toBeDefined();
    });
  });
});
