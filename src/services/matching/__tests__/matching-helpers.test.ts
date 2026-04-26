function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

function calculateDistance(
  loc1: { lat: number; lng: number },
  loc2: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = toRad(loc2.lat - loc1.lat);
  const dLon = toRad(loc2.lng - loc1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(loc1.lat)) *
    Math.cos(toRad(loc2.lat)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function estimateTravelTime(distanceKm: number): number {
  return (distanceKm / 30) * 60;
}

function calculateScore(rating: number, acceptRate: number): number {
  const normalizedRating = Math.min(rating / 5, 1);
  return normalizedRating * 0.6 + acceptRate * 0.4;
}

function calculateAcceptRate(accepted: number, declined: number): number {
  const total = accepted + declined;
  return total === 0 ? 0.5 : accepted / total;
}

describe('Matching - Fonctions utilitaires pures', () => {
  describe('calculateDistance', () => {
    it('retourne 0 pour le meme point', () => {
      const loc = { lat: 45.5017, lng: -73.5673 };
      expect(calculateDistance(loc, loc)).toBeCloseTo(0, 10);
    });

    it('calcule la distance entre deux points proches', () => {
      const loc1 = { lat: 45.5017, lng: -73.5673 };
      const loc2 = { lat: 45.5117, lng: -73.5773 };
      const dist = calculateDistance(loc1, loc2);
      expect(dist).toBeGreaterThan(0);
      expect(dist).toBeLessThan(5);
    });

    it('calcule une distance entre Montreal et Quebec City (~230km)', () => {
      const montreal = { lat: 45.5017, lng: -73.5673 };
      const quebec = { lat: 46.8139, lng: -71.208 };
      const dist = calculateDistance(montreal, quebec);
      expect(dist).toBeGreaterThan(200);
      expect(dist).toBeLessThan(280);
    });

    it('calcule une distance entre Paris et Lyon (~390km)', () => {
      const paris = { lat: 48.8566, lng: 2.3522 };
      const lyon = { lat: 45.764, lng: 4.8357 };
      const dist = calculateDistance(paris, lyon);
      expect(dist).toBeGreaterThan(350);
      expect(dist).toBeLessThan(430);
    });

    it('est symetrique', () => {
      const a = { lat: 45.5017, lng: -73.5673 };
      const b = { lat: 46.8139, lng: -71.208 };
      expect(calculateDistance(a, b)).toBeCloseTo(calculateDistance(b, a), 5);
    });
  });

  describe('estimateTravelTime', () => {
    it('retourne 0 min pour 0 km', () => {
      expect(estimateTravelTime(0)).toBe(0);
    });

    it('retourne 60 min pour 30 km (vitesse moyenne)', () => {
      expect(estimateTravelTime(30)).toBe(60);
    });

    it('retourne 30 min pour 15 km', () => {
      expect(estimateTravelTime(15)).toBe(30);
    });

    it('retourne 2 min pour 1 km', () => {
      expect(estimateTravelTime(1)).toBeCloseTo(2, 5);
    });

    it('retourne 120 min pour 60 km', () => {
      expect(estimateTravelTime(60)).toBe(120);
    });
  });

  describe('calculateScore', () => {
    it('retourne 1.0 pour rating 5 et acceptRate 1.0', () => {
      expect(calculateScore(5, 1.0)).toBeCloseTo(1.0, 5);
    });

    it('retourne 0.4 pour rating 0 et acceptRate 1.0', () => {
      expect(calculateScore(0, 1.0)).toBeCloseTo(0.4, 5);
    });

    it('retourne 0.6 pour rating 5 et acceptRate 0', () => {
      expect(calculateScore(5, 0)).toBeCloseTo(0.6, 5);
    });

    it('retourne 0 pour rating 0 et acceptRate 0', () => {
      expect(calculateScore(0, 0)).toBeCloseTo(0, 5);
    });

    it('plafonne le rating a 5 (pas de depassement)', () => {
      const scoreWith6 = calculateScore(6, 0.5);
      const scoreWith5 = calculateScore(5, 0.5);
      expect(scoreWith6).toBeCloseTo(scoreWith5, 5);
    });

    it('retourne 0.7 pour rating 2.5 et acceptRate 0.5', () => {
      const expected = (2.5 / 5) * 0.6 + 0.5 * 0.4;
      expect(calculateScore(2.5, 0.5)).toBeCloseTo(expected, 5);
    });
  });

  describe('calculateAcceptRate', () => {
    it('retourne 1.0 quand tout est accepte', () => {
      expect(calculateAcceptRate(10, 0)).toBeCloseTo(1.0, 5);
    });

    it('retourne 0.0 quand tout est refuse', () => {
      expect(calculateAcceptRate(0, 10)).toBeCloseTo(0.0, 5);
    });

    it('retourne 0.5 quand aucun historique', () => {
      expect(calculateAcceptRate(0, 0)).toBeCloseTo(0.5, 5);
    });

    it('retourne 0.5 pour 5 accepte et 5 refuse', () => {
      expect(calculateAcceptRate(5, 5)).toBeCloseTo(0.5, 5);
    });

    it('retourne 0.3 pour 3 accepte et 7 refuse', () => {
      expect(calculateAcceptRate(3, 7)).toBeCloseTo(0.3, 5);
    });

    it('retourne 0.75 pour 15 accepte et 5 refuse', () => {
      expect(calculateAcceptRate(15, 5)).toBeCloseTo(0.75, 5);
    });
  });
});
