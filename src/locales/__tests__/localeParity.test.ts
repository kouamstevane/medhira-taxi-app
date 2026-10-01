import { fr } from '../fr';
import { en } from '../en';

type NestedObject = { [key: string]: string | NestedObject };

function getAllKeys(obj: NestedObject, prefix = ''): string[] {
  let keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys = keys.concat(getAllKeys(value as NestedObject, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

describe('i18n Locale Parity & Completeness', () => {
  const frKeys = new Set(getAllKeys(fr as unknown as NestedObject));
  const enKeys = new Set(getAllKeys(en as unknown as NestedObject));

  test('every FR translation key exists in EN', () => {
    const missingInEn = [...frKeys].filter((key) => !enKeys.has(key));
    expect(missingInEn).toEqual([]);
  });

  test('every EN translation key exists in FR', () => {
    const missingInFr = [...enKeys].filter((key) => !frKeys.has(key));
    expect(missingInFr).toEqual([]);
  });

  test('no translation strings are empty in FR', () => {
    const emptyKeysInFr: string[] = [];
    for (const key of frKeys) {
      const parts = key.split('.');
      let current: unknown = fr;
      for (const part of parts) {
        current = (current as Record<string, unknown>)?.[part];
      }
      if (typeof current !== 'string' || current.trim().length === 0) {
        emptyKeysInFr.push(key);
      }
    }
    expect(emptyKeysInFr).toEqual([]);
  });

  test('no translation strings are empty in EN', () => {
    const emptyKeysInEn: string[] = [];
    for (const key of enKeys) {
      const parts = key.split('.');
      let current: unknown = en;
      for (const part of parts) {
        current = (current as Record<string, unknown>)?.[part];
      }
      if (typeof current !== 'string' || current.trim().length === 0) {
        emptyKeysInEn.push(key);
      }
    }
    expect(emptyKeysInEn).toEqual([]);
  });
});
