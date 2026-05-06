import { estimateParcelPrice, ParcelValidationError } from '@/services/parcel.service';
import { getDeliveryDistance } from '@/utils/distance';

jest.mock('@/utils/distance', () => ({
  getDeliveryDistance: jest.fn(),
}));

jest.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  setDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  limit: jest.fn(),
  serverTimestamp: jest.fn(),
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
    it('calcule le prix pour un petit colis à 10km', async () => {
      const result = await estimateParcelPrice(
        makeLocation('CM'),
        { ...makeLocation('CM'), latitude: 4.15, longitude: 9.87 },
        'small'
      );
      expect(result.currency).toBe('FCFA');
      expect(result.distance).toBe(10);
      const expectedRaw = (1500 + 10 * 200) * 1.0;
      const expectedPrice = Math.round(expectedRaw / 50) * 50;
      expect(result.price).toBe(expectedPrice);
    });

    it('calcule le prix pour un grand colis à 10km', async () => {
      const result = await estimateParcelPrice(
        makeLocation('CM'),
        { ...makeLocation('CM'), latitude: 4.15, longitude: 9.87 },
        'large'
      );
      const expectedRaw = (1500 + 10 * 200) * 1.8;
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
        { ...makeLocation('CM'), latitude: 4.15, longitude: 9.87 },
        'medium'
      );
      const expectedRaw = (1500 + 7 * 200) * 1.4;
      const expectedPrice = Math.round(expectedRaw / 50) * 50;
      expect(result.price).toBe(expectedPrice);
      expect(result.price % 50).toBe(0);
    });
  });

  describe('Canada (CA)', () => {
    it('calcule le prix pour un petit colis à 10km', async () => {
      const result = await estimateParcelPrice(
        makeLocation('CA'),
        { ...makeLocation('CA'), latitude: 45.60, longitude: -73.67 },
        'small'
      );
      expect(result.currency).toBe('CAD');
      const expectedRaw = (5 + 10 * 1.25) * 1.0;
      const expectedPrice = Math.round(expectedRaw * 100) / 100;
      expect(result.price).toBeCloseTo(expectedPrice, 2);
    });

    it('calcule le prix pour un moyen colis à 10km', async () => {
      const result = await estimateParcelPrice(
        makeLocation('CA'),
        { ...makeLocation('CA'), latitude: 45.60, longitude: -73.67 },
        'medium'
      );
      const expectedRaw = (5 + 10 * 1.25) * 1.4;
      const expectedPrice = Math.round(expectedRaw * 100) / 100;
      expect(result.price).toBeCloseTo(expectedPrice, 2);
    });
  });

  describe('France (FR)', () => {
    it('calcule le prix pour un petit colis à 10km', async () => {
      const result = await estimateParcelPrice(
        makeLocation('FR'),
        { ...makeLocation('FR'), latitude: 48.96, longitude: 2.45 },
        'small'
      );
      expect(result.currency).toBe('EUR');
      const expectedRaw = (4 + 10 * 1.10) * 1.0;
      const expectedPrice = Math.round(expectedRaw * 100) / 100;
      expect(result.price).toBeCloseTo(expectedPrice, 2);
    });
  });

  describe('Belgique (BE)', () => {
    it('calcule le prix pour un petit colis à 10km', async () => {
      const result = await estimateParcelPrice(
        makeLocation('BE'),
        { ...makeLocation('BE'), latitude: 50.95, longitude: 4.45 },
        'small'
      );
      expect(result.currency).toBe('EUR');
      const expectedRaw = (4 + 10 * 1.15) * 1.0;
      const expectedPrice = Math.round(expectedRaw * 100) / 100;
      expect(result.price).toBeCloseTo(expectedPrice, 2);
    });
  });

  describe('validation', () => {
    it('rejette un pays non supporté (US) pour le pickup', async () => {
      await expect(
        estimateParcelPrice(makeLocation('US'), makeLocation('US'), 'small')
      ).rejects.toThrow(ParcelValidationError);
    });

    it('rejette un pickup et dropoff dans des pays différents', async () => {
      await expect(
        estimateParcelPrice(makeLocation('CM'), makeLocation('CA'), 'small')
      ).rejects.toThrow(ParcelValidationError);
    });

    it('le message d\'erreur mentionne "pays supporté"', async () => {
      try {
        await estimateParcelPrice(makeLocation('US'), makeLocation('US'), 'small');
      } catch (err) {
        expect(err).toBeInstanceOf(ParcelValidationError);
        expect((err as ParcelValidationError).message).toContain('pays supporté');
        return;
      }
      throw new Error('Expected ParcelValidationError to be thrown');
    });
  });
});
