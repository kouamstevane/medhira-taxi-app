import { mergeWithDefaultCarType, resolveDefaultCarType } from './vehicleCatalog';

describe('vehicleCatalog', () => {
  it('resolves Confort+ from a few common labels', () => {
    expect(resolveDefaultCarType('Confort+')).toBeDefined();
    expect(resolveDefaultCarType('confort plus')).toBeDefined();
    expect(resolveDefaultCarType('premium')).toBeDefined();
  });

  it('keeps local fallback pricing when Firestore values are missing or zero', () => {
    const merged = mergeWithDefaultCarType('confort-plus', {
      name: 'Confort+',
      basePrice: 0,
      pricePerKm: 0,
      pricePerMinute: 0,
    });

    expect(merged.name).toBe('Confort+');
    expect(merged.basePrice).toBeGreaterThan(0);
    expect(merged.pricePerKm).toBeGreaterThan(0);
    expect(merged.pricePerMinute).toBeGreaterThan(0);
  });
});
