import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const restaurantIndex = args.indexOf('--restaurantId');
const restaurantId = restaurantIndex >= 0 ? args[restaurantIndex + 1] : '';
const apply = args.includes('--apply');

if (!restaurantId) {
  throw new Error('Usage: npm run menu:backfill-search -- --restaurantId <id> [--apply]');
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function prefixes(fields) {
  const values = new Set();
  for (const field of fields) {
    const normalized = normalize(field);
    if (!normalized) continue;
    for (const value of new Set([normalized, ...normalized.split(' ')])) {
      for (let length = 2; length <= Math.min(value.length, 32); length += 1) {
        values.add(value.slice(0, length));
      }
    }
  }
  return [...values];
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const collection = db.collection(`restaurants/${restaurantId}/menu_items`);
let snapshot = await collection.orderBy('__name__').get();
let changed = 0;

for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
  const batch = db.batch();
  const chunk = snapshot.docs.slice(offset, offset + 400);
  for (const document of chunk) {
    const data = document.data();
    const searchPrefixes = prefixes([data.name, data.category, data.externalId]);
    if (JSON.stringify(data.searchPrefixes || []) === JSON.stringify(searchPrefixes)) continue;
    changed += 1;
    if (apply) batch.update(document.ref, { searchPrefixes });
  }
  if (apply && chunk.length > 0) await batch.commit();
}

console.log(`${apply ? 'Updated' : 'Would update'} ${changed} menu items for ${restaurantId}.`);
