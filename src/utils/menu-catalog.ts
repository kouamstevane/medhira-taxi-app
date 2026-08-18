import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

export type MenuCatalogAvailability = 'all' | 'available' | 'unavailable';
export type MenuCatalogSort = 'category' | 'name' | 'price-asc' | 'price-desc';

export interface MenuCatalogQuery {
  pageSize?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  search?: string;
  category?: string | null;
  availability?: MenuCatalogAvailability;
  sort?: MenuCatalogSort;
}

export function normalizeMenuSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function buildMenuSearchPrefixes(fields: string[]): string[] {
  const prefixes = new Set<string>();

  for (const field of fields) {
    const normalized = normalizeMenuSearchValue(field);
    if (!normalized) continue;

    const values = new Set([normalized, ...normalized.split(' ')]);
    for (const value of values) {
      const maxLength = Math.min(value.length, 32);
      for (let length = 2; length <= maxLength; length += 1) {
        prefixes.add(value.slice(0, length));
      }
    }
  }

  return Array.from(prefixes);
}
