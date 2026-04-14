import {
  formatCurrencyWithCode,
  formatCurrency,
  formatPhoneNumber,
  formatDistance,
  formatDuration,
  formatDate,
  formatDateTime,
  formatFirestoreDate,
} from '@/utils/format';

describe('formatCurrencyWithCode', () => {
  it('formate un montant normal avec le code de devise', () => {
    expect(formatCurrencyWithCode(100)).toBe('100 CAD');
  });

  it('formate un montant avec séparateurs de milliers', () => {
    const result = formatCurrencyWithCode(1500);
    expect(result).toContain('500');
    expect(result).toContain('CAD');
  });

  it('retourne 0 pour un montant NaN', () => {
    expect(formatCurrencyWithCode(NaN)).toBe('0 CAD');
  });

  it('retourne 0 pour un montant négatif', () => {
    expect(formatCurrencyWithCode(-50)).toBe('0 CAD');
  });

  it('retourne 0 pour un montant de zéro', () => {
    expect(formatCurrencyWithCode(0)).toBe('0 CAD');
  });

  it('formate un très grand montant', () => {
    const result = formatCurrencyWithCode(1000000);
    expect(result).toContain('000');
    expect(result).toContain('CAD');
  });

  it('formate un montant décimal', () => {
    expect(formatCurrencyWithCode(3.5)).toBe('3,5 CAD');
  });
});

describe('formatCurrency', () => {
  it('formate un montant normal avec le symbole de devise', () => {
    const result = formatCurrency(100);
    expect(result).toContain('100');
    expect(result).toContain('$');
  });

  it('formate un montant de zéro', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
    expect(result).toContain('$');
  });
});

describe('formatPhoneNumber', () => {
  it('formate un numéro canadien (+1)', () => {
    expect(formatPhoneNumber('+15550123456')).toBe('+1 (555) 012-3456');
  });

  it('formate un numéro camerounais (+237)', () => {
    expect(formatPhoneNumber('+237655744484')).toBe('+237 6 55 74 44 84');
  });

  it('retourne le numéro tel quel pour un format inconnu', () => {
    expect(formatPhoneNumber('+33612345678')).toBe('+33612345678');
  });

  it('retourne une chaîne vide pour une chaîne vide', () => {
    expect(formatPhoneNumber('')).toBe('');
  });

  it('retourne le numéro tel quel sans préfixe +', () => {
    expect(formatPhoneNumber('5550123456')).toBe('5550123456');
  });
});

describe('formatDistance', () => {
  it('formate une distance normale avec 1 décimale par défaut', () => {
    expect(formatDistance(5.678)).toBe('5.7 km');
  });

  it('formate une distance de zéro', () => {
    expect(formatDistance(0)).toBe('0.0 km');
  });

  it('formate une distance négative', () => {
    expect(formatDistance(-5.5)).toBe('-5.5 km');
  });

  it('formate avec un nombre de décimales personnalisé', () => {
    expect(formatDistance(5.678, 2)).toBe('5.68 km');
  });

  it('formate avec 0 décimales', () => {
    expect(formatDistance(5.678, 0)).toBe('6 km');
  });
});

describe('formatDuration', () => {
  it('formate une durée inférieure à 60 minutes', () => {
    expect(formatDuration(45)).toBe('45 min');
  });

  it('formate exactement 60 minutes comme 1h', () => {
    expect(formatDuration(60)).toBe('1h');
  });

  it('formate une durée supérieure à 60 minutes avec reste', () => {
    expect(formatDuration(90)).toBe('1h 30min');
  });

  it('formate exactement 120 minutes comme 2h', () => {
    expect(formatDuration(120)).toBe('2h');
  });

  it('formate une durée de zéro', () => {
    expect(formatDuration(0)).toBe('0 min');
  });

  it('formate une durée avec un grand nombre d\'heures', () => {
    expect(formatDuration(185)).toBe('3h 5min');
  });
});

describe('formatDate', () => {
  it('formate une date en français', () => {
    const date = new Date(2025, 0, 15);
    const result = formatDate(date);
    expect(result).toContain('15');
    expect(result).toContain('2025');
  });
});

describe('formatDateTime', () => {
  it('formate une date avec heure en français', () => {
    const date = new Date(2025, 0, 15, 13, 45);
    const result = formatDateTime(date);
    expect(result).toContain('15');
    expect(result).toContain('2025');
    expect(result).toContain('13');
    expect(result).toContain('45');
  });
});

describe('formatFirestoreDate', () => {
  it('retourne une chaîne vide pour null', () => {
    expect(formatFirestoreDate(null)).toBe('');
  });

  it('formate un objet Date', () => {
    const date = new Date(2025, 0, 15, 13, 45);
    const result = formatFirestoreDate(date);
    expect(result).toContain('15');
    expect(result).toContain('janv');
  });

  it('formate un objet timestamp Firestore { seconds }', () => {
    const ts = { seconds: 1736948700 };
    const result = formatFirestoreDate(ts);
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });
});
