import { assertDriverNearPickup, getDistanceMeters } from '../geolocation.js';

describe('personal driver arrival geolocation', () => {
  const pickup = { latitude: 45.5017, longitude: -73.5673 };

  it('calculates a zero distance for identical coordinates', () => {
    expect(getDistanceMeters(pickup, pickup)).toBe(0);
  });

  it('accepts an accurate driver location inside the configured radius', () => {
    expect(() => assertDriverNearPickup({ ...pickup }, pickup, 20)).not.toThrow();
  });

  it('rejects a driver location outside the configured radius', () => {
    expect(() => assertDriverNearPickup({ latitude: 45.51, longitude: -73.5673 }, pickup, 20))
      .toThrow('outside the pickup radius');
  });

  it('rejects an inaccurate GPS measurement', () => {
    expect(() => assertDriverNearPickup({ ...pickup }, pickup, 150))
      .toThrow('GPS accuracy');
  });
});
