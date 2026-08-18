import { parse as parseCsvSync } from 'csv-parse/sync';

export const MAX_IMPORT_ROWS = 10000;
export const MAX_IMPORT_COLUMNS = 64;

function normalizeHeaderKey(key: string): string {
  return key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function parseCsvBuffer(buffer: Buffer): Array<Record<string, string>> {
  let content = buffer.toString('utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ';' : ',';
  const rawRecords: Array<Record<string, string>> = parseCsvSync(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
    delimiter,
  });

  if (rawRecords.length > MAX_IMPORT_ROWS) {
    throw new Error(`Le fichier CSV dépasse la limite maximale autorisée de ${MAX_IMPORT_ROWS} lignes (${rawRecords.length} reçues)`);
  }
  if (rawRecords.length === 0) return [];

  const headers = Object.keys(rawRecords[0] || {});
  if (headers.length > MAX_IMPORT_COLUMNS) {
    throw new Error(`Le fichier CSV dépasse la limite de ${MAX_IMPORT_COLUMNS} colonnes (${headers.length} détectées)`);
  }
  const normalizedHeaders = new Set<string>();
  for (const header of headers) {
    const normalized = normalizeHeaderKey(header);
    if (normalized && normalizedHeaders.has(normalized)) {
      throw new Error(`En-tête de colonne en double détecté dans le fichier CSV: "${header}"`);
    }
    if (normalized) normalizedHeaders.add(normalized);
  }
  return rawRecords;
}
