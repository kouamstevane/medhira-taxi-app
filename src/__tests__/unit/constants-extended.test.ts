// src/__tests__/unit/constants-extended.test.ts
import {
  getMarketByCountryCode,
  getSupportedCountryNames,
  applyRounding,
  MARKET_CONFIGS,
  type MarketCode,
  type RoundingStrategy,
} from '@/utils/constants';

describe('getMarketByCountryCode', () => {
  it('retourne CM pour "CM" (uppercase exact)', () => {
    const result = getMarketByCountryCode('CM');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('CM');
    expect(result!.config.name).toBe('Cameroun');
  });

  it('retourne CA pour "ca" (lowercase)', () => {
    const result = getMarketByCountryCode('ca');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('CA');
  });

  it('retourne FR pour "Fr" (casse mixte)', () => {
    const result = getMarketByCountryCode('Fr');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('FR');
  });

  it('retourne BE pour "be"', () => {
    const result = getMarketByCountryCode('be');
    expect(result).not.toBeNull();
    expect(result!.code).toBe('BE');
  });

  it('retourne null pour "US" (pays non supporté)', () => {
    expect(getMarketByCountryCode('US')).toBeNull();
  });

  it('retourne null pour "XX" (code inexistant)', () => {
    expect(getMarketByCountryCode('XX')).toBeNull();
  });

  it('retourne null pour chaîne vide', () => {
    expect(getMarketByCountryCode('')).toBeNull();
  });

  it('retourne la config complète incluant parcelPricing pour CM', () => {
    const result = getMarketByCountryCode('CM');
    expect(result!.config.parcelPricing).toEqual({
      basePrice: 1500,
      pricePerKm: 200,
      sizeMultiplier: { small: 1.0, medium: 1.4, large: 1.8 },
      roundingStrategy: { mode: 'nearest', precision: 50 },
    });
  });

  it('retourne la config complète incluant parcelPricing pour CA', () => {
    const result = getMarketByCountryCode('CA');
    expect(result!.config.parcelPricing).toEqual({
      basePrice: 5,
      pricePerKm: 1.25,
      sizeMultiplier: { small: 1.0, medium: 1.4, large: 1.8 },
      roundingStrategy: { mode: 'decimals', precision: 2 },
    });
  });

  it('retourne boundingBox pour chaque marché', () => {
    for (const code of ['CM', 'CA', 'FR', 'BE'] as MarketCode[]) {
      const result = getMarketByCountryCode(code);
      expect(result!.config.boundingBox).toBeDefined();
      const { latMin, latMax, lngMin, lngMax } = result!.config.boundingBox;
      expect(latMin).toBeLessThan(latMax);
      expect(lngMin).toBeLessThan(lngMax);
    }
  });

  it('retourne currencyCode pour chaque marché', () => {
    expect(getMarketByCountryCode('CM')!.config.currencyCode).toBe('FCFA');
    expect(getMarketByCountryCode('CA')!.config.currencyCode).toBe('CAD');
    expect(getMarketByCountryCode('FR')!.config.currencyCode).toBe('EUR');
    expect(getMarketByCountryCode('BE')!.config.currencyCode).toBe('EUR');
  });
});

describe('getSupportedCountryNames', () => {
  it('retourne les 4 noms séparés par virgule sans detectedCountry', () => {
    const names = getSupportedCountryNames();
    expect(names).toContain('Cameroun');
    expect(names).toContain('Canada');
    expect(names).toContain('France');
    expect(names).toContain('Belgique');
    const parts = names.split(', ');
    expect(parts).toHaveLength(4);
  });

  it('place le detectedCountry en premier', () => {
    const names = getSupportedCountryNames('CM');
    expect(names.startsWith('Cameroun')).toBe(true);
  });

  it('place FR en premier quand detectedCountry=FR', () => {
    const names = getSupportedCountryNames('FR');
    expect(names.startsWith('France')).toBe(true);
  });

  it('retourne 4 noms même avec detectedCountry', () => {
    const names = getSupportedCountryNames('CA');
    const parts = names.split(', ');
    expect(parts).toHaveLength(4);
  });

  it('fonctionne avec detectedCountry null', () => {
    const names = getSupportedCountryNames(null);
    const parts = names.split(', ');
    expect(parts).toHaveLength(4);
  });
});

describe('applyRounding', () => {
  describe('mode "nearest"', () => {
    const strategy: RoundingStrategy = { mode: 'nearest', precision: 50 };

    it('arrondit 1550 au 50 FCFA → 1550 (déjà multiple)', () => {
      expect(applyRounding(1550, strategy)).toBe(1550);
    });

    it('arrondit 1575 au 50 FCFA → 1600', () => {
      expect(applyRounding(1575, strategy)).toBe(1600);
    });

    it('arrondit 1524 au 50 FCFA → 1500', () => {
      expect(applyRounding(1524, strategy)).toBe(1500);
    });

    it('arrondit 1525 au 50 FCFA → 1550 (milieu arrondi supérieur)', () => {
      expect(applyRounding(1525, strategy)).toBe(1550);
    });

    it('arrondit 0 → 0', () => {
      expect(applyRounding(0, strategy)).toBe(0);
    });
  });

  describe('mode "decimals"', () => {
    const strategy: RoundingStrategy = { mode: 'decimals', precision: 2 };

    it('arrondit 1.235 à 2 décimales → 1.24', () => {
      expect(applyRounding(1.235, strategy)).toBeCloseTo(1.24, 5);
    });

    it('arrondit 1.231 à 2 décimales → 1.23', () => {
      expect(applyRounding(1.231, strategy)).toBeCloseTo(1.23, 5);
    });

    it('arrondit 5.00 à 2 décimales → 5.00', () => {
      expect(applyRounding(5.0, strategy)).toBeCloseTo(5.0, 5);
    });

    it('arrondit 0 → 0', () => {
      expect(applyRounding(0, strategy)).toBe(0);
    });
  });

  describe('mode "decimals" precision 3', () => {
    const strategy: RoundingStrategy = { mode: 'decimals', precision: 3 };

    it('arrondit 1.2345 à 3 décimales → 1.235', () => {
      expect(applyRounding(1.2345, strategy)).toBeCloseTo(1.235, 5);
    });
  });
});

describe('MARKET_CONFIGS bounding boxes', () => {
  it('CM bbox exclut le Nigeria (lat < 2.5)', () => {
    const bbox = MARKET_CONFIGS.CM.boundingBox;
    expect(bbox.latMin).toBeGreaterThanOrEqual(2.0);
    expect(bbox.latMax).toBeLessThanOrEqual(13.0);
  });

  it('CA bbox exclut le nord US (lat >= 44)', () => {
    const bbox = MARKET_CONFIGS.CA.boundingBox;
    expect(bbox.latMin).toBeGreaterThanOrEqual(40);
    expect(bbox.latMax).toBeLessThanOrEqual(75);
  });

  it('Douala (4.05, 9.77) est dans CM bbox', () => {
    const { latMin, latMax, lngMin, lngMax } = MARKET_CONFIGS.CM.boundingBox;
    expect(4.05).toBeGreaterThanOrEqual(latMin);
    expect(4.05).toBeLessThanOrEqual(latMax);
    expect(9.77).toBeGreaterThanOrEqual(lngMin);
    expect(9.77).toBeLessThanOrEqual(lngMax);
  });

  it('Montréal (45.50, -73.57) est dans CA bbox', () => {
    const { latMin, latMax, lngMin, lngMax } = MARKET_CONFIGS.CA.boundingBox;
    expect(45.50).toBeGreaterThanOrEqual(latMin);
    expect(45.50).toBeLessThanOrEqual(latMax);
    expect(-73.57).toBeGreaterThanOrEqual(lngMin);
    expect(-73.57).toBeLessThanOrEqual(lngMax);
  });

  it('Paris (48.86, 2.35) est dans FR bbox', () => {
    const { latMin, latMax, lngMin, lngMax } = MARKET_CONFIGS.FR.boundingBox;
    expect(48.86).toBeGreaterThanOrEqual(latMin);
    expect(48.86).toBeLessThanOrEqual(latMax);
    expect(2.35).toBeGreaterThanOrEqual(lngMin);
    expect(2.35).toBeLessThanOrEqual(lngMax);
  });

  it('Bruxelles (50.85, 4.35) est dans BE bbox', () => {
    const { latMin, latMax, lngMin, lngMax } = MARKET_CONFIGS.BE.boundingBox;
    expect(50.85).toBeGreaterThanOrEqual(latMin);
    expect(50.85).toBeLessThanOrEqual(latMax);
    expect(4.35).toBeGreaterThanOrEqual(lngMin);
    expect(4.35).toBeLessThanOrEqual(lngMax);
  });

  it('Détroit (42.33, -83.05) n\'est dans aucun bbox', () => {
    for (const config of Object.values(MARKET_CONFIGS)) {
      const { latMin, latMax, lngMin, lngMax } = config.boundingBox;
      const inside = 42.33 >= latMin && 42.33 <= latMax && -83.05 >= lngMin && -83.05 <= lngMax;
      expect(inside).toBe(false);
    }
  });
});

describe('MARKET_CONFIGS parcelPricing', () => {
  it('CM a les mêmes tarifs que parcel.service.ts original', () => {
    const cm = MARKET_CONFIGS.CM.parcelPricing;
    expect(cm.basePrice).toBe(1500);
    expect(cm.pricePerKm).toBe(200);
    expect(cm.sizeMultiplier.small).toBe(1.0);
    expect(cm.sizeMultiplier.medium).toBe(1.4);
    expect(cm.sizeMultiplier.large).toBe(1.8);
  });

  it('CA a les mêmes tarifs que parcel.service.ts original', () => {
    const ca = MARKET_CONFIGS.CA.parcelPricing;
    expect(ca.basePrice).toBe(5);
    expect(ca.pricePerKm).toBe(1.25);
    expect(ca.sizeMultiplier.small).toBe(1.0);
    expect(ca.sizeMultiplier.medium).toBe(1.4);
    expect(ca.sizeMultiplier.large).toBe(1.8);
  });

  it('FR et BE ont des tarifs définis', () => {
    expect(MARKET_CONFIGS.FR.parcelPricing.basePrice).toBeGreaterThan(0);
    expect(MARKET_CONFIGS.FR.parcelPricing.pricePerKm).toBeGreaterThan(0);
    expect(MARKET_CONFIGS.BE.parcelPricing.basePrice).toBeGreaterThan(0);
    expect(MARKET_CONFIGS.BE.parcelPricing.pricePerKm).toBeGreaterThan(0);
  });

  it('chaque marché a une roundingStrategy valide', () => {
    for (const [, config] of Object.entries(MARKET_CONFIGS)) {
      const { roundingStrategy } = config.parcelPricing;
      expect(['nearest', 'decimals']).toContain(roundingStrategy.mode);
      expect(roundingStrategy.precision).toBeGreaterThan(0);
    }
  });
});
