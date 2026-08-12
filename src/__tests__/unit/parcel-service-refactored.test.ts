import { estimateParcelPrice } from '@/services/parcel.service';

jest.mock('@/utils/distance', () => ({
  getDeliveryDistance: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(() => ({ id: 'mock-parcel-id' })),
  setDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  limit: jest.fn(),
  serverTimestamp: jest.fn(),
  runTransaction: jest.fn(),
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(),
}));

jest.mock('@/lib/firebase-helpers', () => ({
  typedServerTimestamp: jest.fn(() => new Date()),
}));

import { getDeliveryDistance as mockGetDeliveryDistance } from '@/utils/distance';

const makeLocation = (country: string) => ({
  address: '123 Test Street',
  latitude: 4.05,
  longitude: 9.77,
  country,
});

describe('estimateParcelPrice after refactor', () => {
  beforeEach(() => {
    (mockGetDeliveryDistance as jest.Mock).mockResolvedValue({
      distanceKm: 10,
      durationMinutes: 15,
      isEstimate: false,
    });
  });

  describe('Cameroun (CM)', () => {
    it('calcule le prix pour un colis à 10km', async () => {
      const result = await estimateParcelPrice(
        makeLocation('CM'),
        { ...makeLocation('CM'), latitude: 4.15, longitude: 9.87 }
      );
      expect(result.currency).toBe('FCFA');
      expect(result.distance).toBe(10);
      const expectedRaw = 1500 + 10 * 200;
      const expectedPrice = Math.round(expectedRaw / 50) * 50;
      expect(result.price).toBe(expectedPrice);
    });

    it('arrondit au 50 FCFA le plus proche', async () => {
      (mockGetDeliveryDistance as jest.Mock).mockResolvedValue({
        distanceKm: 7,
        durationMinutes: 10,
        isEstimate: false,
      });
      const result = await estimateParcelPrice(
        makeLocation('CM'),
        { ...makeLocation('CM'), latitude: 4.15, longitude: 9.87 }
      );
      const expectedRaw = 1500 + 7 * 200;
      const expectedPrice = Math.round(expectedRaw / 50) * 50;
      expect(result.price).toBe(expectedPrice);
      expect(result.price % 50).toBe(0);
    });
  });

  describe('Canada (CA)', () => {
    it('calcule le prix pour un colis à 10km', async () => {
      const result = await estimateParcelPrice(
        makeLocation('CA'),
        { ...makeLocation('CA'), latitude: 45.60, longitude: -73.67 }
      );
      expect(result.currency).toBe('CAD');
      const expectedRaw = 5 + 10 * 1.25;
      const expectedPrice = Math.round(expectedRaw * 100) / 100;
      expect(result.price).toBeCloseTo(expectedPrice, 2);
    });
  });

  describe('France (FR)', () => {
    it('calcule le prix pour un colis à 10km', async () => {
      const result = await estimateParcelPrice(
        makeLocation('FR'),
        { ...makeLocation('FR'), latitude: 48.96, longitude: 2.45 }
      );
      expect(result.currency).toBe('EUR');
      const expectedRaw = 4 + 10 * 1.10;
      const expectedPrice = Math.round(expectedRaw * 100) / 100;
      expect(result.price).toBeCloseTo(expectedPrice, 2);
    });
  });

  describe('Belgique (BE)', () => {
    it('calcule le prix pour un colis à 10km', async () => {
      const result = await estimateParcelPrice(
        makeLocation('BE'),
        { ...makeLocation('BE'), latitude: 50.95, longitude: 4.45 }
      );
      expect(result.currency).toBe('EUR');
      const expectedRaw = 4 + 10 * 1.15;
      const expectedPrice = Math.round(expectedRaw * 100) / 100;
      expect(result.price).toBeCloseTo(expectedPrice, 2);
    });
  });

  describe('createParcelOrder & confirmParcelReceipt', () => {
    it('délègue la création wallet au serveur sans écrire directement dans Firestore', async () => {
      const { createParcelOrder } = await import('@/services/parcel.service');
      const { httpsCallable } = await import('firebase/functions');
      const { setDoc, runTransaction } = await import('firebase/firestore');
      const mockCallable = jest.fn().mockResolvedValue({
        data: {
          parcelId: 'server-parcel-id',
          amount: 17.5,
          currency: 'CAD',
          paymentMethod: 'wallet',
        },
      });
      (httpsCallable as jest.Mock).mockReturnValue(mockCallable);

      const result = await createParcelOrder({
        senderId: 'user-123',
        recipientName: 'Jean Dupont',
        recipientPhone: '+15550123456',
        pickupLocation: makeLocation('CA'),
        dropoffLocation: { ...makeLocation('CA'), latitude: 45.60, longitude: -73.67 },
        parcelType: 'food',
        paymentMethod: 'wallet',
      });

      expect(result.parcelId).toBe('server-parcel-id');
      expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'createParcelOrder');
      expect(mockCallable).toHaveBeenCalledWith(expect.objectContaining({
        paymentMethod: 'wallet',
      }));
      expect(setDoc).not.toHaveBeenCalled();
      expect(runTransaction).not.toHaveBeenCalled();
    });

    it('prépare le paiement carte avec le client secret Stripe renvoyé par le serveur', async () => {
      const { createParcelOrder } = await import('@/services/parcel.service');
      const { httpsCallable } = await import('firebase/functions');
      const mockCallable = jest.fn().mockResolvedValue({
        data: {
          parcelId: 'card-parcel-id',
          amount: 17.5,
          currency: 'CAD',
          paymentMethod: 'card',
          clientSecret: 'pi_secret',
          paymentIntentId: 'pi_123',
        },
      });
      (httpsCallable as jest.Mock).mockReturnValue(mockCallable);

      const result = await createParcelOrder({
        senderId: 'user-123',
        recipientName: 'Jean Dupont',
        recipientPhone: '+15550123456',
        pickupLocation: makeLocation('CA'),
        dropoffLocation: { ...makeLocation('CA'), latitude: 45.60, longitude: -73.67 },
        parcelType: 'food',
        paymentMethod: 'card',
      });

      expect(result.clientSecret).toBe('pi_secret');
      expect(mockCallable).toHaveBeenCalledWith(expect.objectContaining({
        paymentMethod: 'card',
      }));
    });

    it('appelle la Cloud Function confirmParcelReceipt', async () => {
      const { confirmParcelReceipt } = await import('@/services/parcel.service');
      const { httpsCallable } = await import('firebase/functions');

      const mockCallable = jest.fn().mockResolvedValue({ data: { success: true } });
      (httpsCallable as jest.Mock).mockReturnValue(mockCallable);

      await confirmParcelReceipt('parcel-999');
      expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'confirmParcelReceipt');
      expect(mockCallable).toHaveBeenCalledWith({ parcelId: 'parcel-999' });
    });
  });
});
