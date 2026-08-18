import { buildMenuSearchPrefixes, normalizeMenuSearchValue } from '../menu-catalog';

describe('menu catalog search metadata', () => {
  it('normalizes accents, punctuation and repeated spaces', () => {
    expect(normalizeMenuSearchValue('  Détox-Pomme  fraîche ')).toBe('detox pomme fraiche');
  });

  it('builds prefixes for full fields and individual words', () => {
    const prefixes = buildMenuSearchPrefixes(['Détox Pomme', 'Boissons Fraîches', 'SKU-42']);
    expect(prefixes).toEqual(expect.arrayContaining(['detox', 'detox pomme', 'pomme', 'boissons', 'sku']));
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
