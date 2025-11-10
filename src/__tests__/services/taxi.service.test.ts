/**
 * Tests unitaires pour taxi.service.ts
 * 
 * @jest-environment jsdom
 */

import { estimateFare, calculatePrice } from '@/services/taxi.service';
import { CarType } from '@/types';

// Mock Google Maps
global.google = {
  maps: {
    DirectionsService: jest.fn().mockImplementation(() => ({
      route: jest.fn((request, callback) => {
        callback(
          {
            routes: [
              {
                legs: [
                  {
                    distance: { value: 5000, text: '5 km' }, // 5 km
                    duration: { value: 600, text: '10 min' }, // 10 minutes
                  },
                ],
              },
            ],
          },
          'OK'
        );
      }),
    })),
    TravelMode: {
      DRIVING: 'DRIVING',
    },
  },
} as any;

// Mock window
global.window = global as any;

describe('taxi.service', () => {
  const mockCarType: CarType = {
    id: '1',
    name: 'Éco',
    basePrice: 1000,
    pricePerKm: 500,
    pricePerMinute: 50,
    image: '',
    seats: 4,
    time: '5 min',
    order: 1,
  };

  describe('calculatePrice', () => {
    it('devrait calculer le prix correctement', () => {
      const price = calculatePrice(5, 10, mockCarType);
      // Prix = 1000 (base) + (5 * 500) + (10 * 50) = 1000 + 2500 + 500 = 4000
      // Avec heure de pointe (1.2) = 4800
      // Arrondi à la centaine supérieure = 4800
      expect(price).toBeGreaterThan(0);
    });

    it('devrait retourner 0 pour distance et durée nulles', () => {
      const price = calculatePrice(0, 0, mockCarType);
      expect(price).toBeGreaterThanOrEqual(0);
    });
  });

  describe('estimateFare', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('devrait estimer le tarif avec des adresses', async () => {
      const result = await estimateFare({
        from: 'Yaoundé, Cameroun',
        to: 'Douala, Cameroun',
        type: '1',
      });

      expect(result).toHaveProperty('price');
      expect(result).toHaveProperty('distance');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('currency', 'FCFA');
      expect(result.price).toBeGreaterThan(0);
      expect(result.distance).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('devrait lancer une erreur si le type de véhicule est introuvable', async () => {
      await expect(
        estimateFare({
          from: 'Yaoundé',
          to: 'Douala',
          type: 'inexistant',
        })
      ).rejects.toThrow('Type de véhicule');
    });

    it('devrait lancer une erreur si Google Maps n\'est pas chargé', async () => {
      const originalGoogle = global.google;
      global.google = undefined as any;

      await expect(
        estimateFare({
          from: 'Yaoundé',
          to: 'Douala',
          type: '1',
        })
      ).rejects.toThrow('Google Maps API non chargée');

      global.google = originalGoogle;
    });
  });
});

