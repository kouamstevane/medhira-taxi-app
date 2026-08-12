import { calculateParcelPrice } from '../parcels/parcelPricing.js';

describe('server parcel pricing', () => {
  it('calculates the Canadian price from server-side coordinates and size', () => {
    const result = calculateParcelPrice({
      country: 'CA',
      pickup: { latitude: 45.5017, longitude: -73.5673 },
      dropoff: { latitude: 45.5917, longitude: -73.5673 },
      sizeCategory: 'small',
    });

    expect(result.currency).toBe('CAD');
    expect(result.price).toBeGreaterThan(5);
    expect(result.price).toBeLessThan(20);
    expect(result.driverEarnings).toBe(Math.round(result.price * 0.7 * 100) / 100);
  });

  it('does not accept a client-provided price as an input', () => {
    const result = calculateParcelPrice({
      country: 'CA',
      pickup: { latitude: 45.5017, longitude: -73.5673 },
      dropoff: { latitude: 45.5917, longitude: -73.5673 },
      sizeCategory: 'small',
    });

    expect(result).not.toHaveProperty('clientPrice');
  });
});
