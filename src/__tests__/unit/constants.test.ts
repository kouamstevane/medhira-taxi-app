import {
  ACTIVE_MARKET,
  CURRENCY_CODE,
  DEFAULT_LOCALE,
  DEFAULT_PRICING,
  LIMITS,
  SUPPORTED_COUNTRIES,
  PEAK_HOURS,
  WALLET_FEES,
  FOOD_DELIVERY_PRICING,
  CURRENCY_MAP,
  ERROR_MESSAGES,
} from '@/utils/constants';

describe('ACTIVE_MARKET', () => {
  it('est "CA" pour le Canada', () => {
    expect(ACTIVE_MARKET).toBe('CA');
  });
});

describe('CURRENCY_CODE', () => {
  it('est "CAD" pour le Canada', () => {
    expect(CURRENCY_CODE).toBe('CAD');
  });
});

describe('DEFAULT_LOCALE', () => {
  it('est "fr-CA" pour le Canada', () => {
    expect(DEFAULT_LOCALE).toBe('fr-CA');
  });
});

describe('DEFAULT_PRICING', () => {
  it('contient BASE_PRICE: 3.50', () => {
    expect(DEFAULT_PRICING.BASE_PRICE).toBe(3.50);
  });

  it('contient PRICE_PER_KM: 1.75', () => {
    expect(DEFAULT_PRICING.PRICE_PER_KM).toBe(1.75);
  });

  it('contient PRICE_PER_MINUTE: 0.45', () => {
    expect(DEFAULT_PRICING.PRICE_PER_MINUTE).toBe(0.45);
  });

  it('contient PEAK_HOUR_MULTIPLIER: 1.25', () => {
    expect(DEFAULT_PRICING.PEAK_HOUR_MULTIPLIER).toBe(1.25);
  });

  it('contient DISCOUNT_RATE: 0.10', () => {
    expect(DEFAULT_PRICING.DISCOUNT_RATE).toBe(0.10);
  });

  it('contient CANCELLATION_PENALTY_RATE: 0.50', () => {
    expect(DEFAULT_PRICING.CANCELLATION_PENALTY_RATE).toBe(0.50);
  });
});

describe('LIMITS', () => {
  it('a MIN_WALLET_RECHARGE: 5', () => {
    expect(LIMITS.MIN_WALLET_RECHARGE).toBe(5);
  });

  it('a MAX_WALLET_RECHARGE: 1000', () => {
    expect(LIMITS.MAX_WALLET_RECHARGE).toBe(1000);
  });
});

describe('SUPPORTED_COUNTRIES', () => {
  it('contient 4 pays', () => {
    expect(SUPPORTED_COUNTRIES).toHaveLength(4);
  });

  it('a le marché actif (CA) en premier', () => {
    expect(SUPPORTED_COUNTRIES[0].code).toBe('CA');
  });

  it('chaque pays a les champs obligatoires', () => {
    SUPPORTED_COUNTRIES.forEach((country) => {
      expect(country).toHaveProperty('code');
      expect(country).toHaveProperty('dialCode');
      expect(country).toHaveProperty('name');
      expect(country).toHaveProperty('phoneLength');
      expect(typeof country.phoneLength).toBe('number');
    });
  });
});

describe('PEAK_HOURS', () => {
  it('a MORNING_START: 7', () => {
    expect(PEAK_HOURS.MORNING_START).toBe(7);
  });

  it('a EVENING_END: 19', () => {
    expect(PEAK_HOURS.EVENING_END).toBe(19);
  });
});

describe('WALLET_FEES', () => {
  it('a RECHARGE_RATE: 0.015', () => {
    expect(WALLET_FEES.RECHARGE_RATE).toBe(0.015);
  });
});

describe('FOOD_DELIVERY_PRICING', () => {
  it('a RATE_PER_KM: 1.50', () => {
    expect(FOOD_DELIVERY_PRICING.RATE_PER_KM).toBe(1.50);
  });
});

describe('CURRENCY_MAP', () => {
  it('mappe FCFA vers XAF', () => {
    expect(CURRENCY_MAP['FCFA']).toBe('XAF');
  });

  it('mappe CAD vers CAD', () => {
    expect(CURRENCY_MAP['CAD']).toBe('CAD');
  });
});

describe('ERROR_MESSAGES', () => {
  const expectedKeys = [
    'NETWORK_ERROR',
    'AUTH_ERROR',
    'FIREBASE_ERROR',
    'INVALID_PHONE',
    'INVALID_EMAIL',
    'REQUIRED_FIELDS',
  ];

  expectedKeys.forEach((key) => {
    it(`contient la clé ${key}`, () => {
      expect(ERROR_MESSAGES).toHaveProperty(key);
      expect(typeof ERROR_MESSAGES[key as keyof typeof ERROR_MESSAGES]).toBe('string');
    });
  });
});
