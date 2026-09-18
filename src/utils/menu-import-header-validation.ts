import type JSZipType from 'jszip';

const loadJSZip = async (): Promise<JSZipType> => {
  const jszipModule = await import('jszip');
  return (jszipModule.default ?? jszipModule) as unknown as JSZipType;
};

export const MAX_CLIENT_XLSX_BYTES = 4 * 1024 * 1024; // 4 Mo
export const MAX_CLIENT_ZIP_BYTES = 8 * 1024 * 1024; // 8 Mo

export const RECOGNIZED_HEADER_ALIASES = {
  externalId: [
    'externalid',
    'external_id',
    'idexterne',
    'sku',
    'id',
    'reference',
    'ref',
    'itemid',
    'merchantitemid',
    'token',
    'barcode',
    'codebarre',
    'codebarres',
    'articleid',
    'productid',
    'handle',
    'posid',
  ],
  name: [
    'name',
    'nom',
    'titre',
    'plat',
    'item',
    'intitule',
    'libelle',
    'itemname',
    'productname',
    'nomduproduit',
    'titreduplat',
    'designation',
    'title',
  ],
  price: [
    'price',
    'prix',
    'tarif',
    'amount',
    'prixunitaire',
    'itemprice',
    'baseprice',
    'regularprice',
    'variantprice',
    'prixttc',
    'prixht',
  ],
  description: [
    'description',
    'desc',
    'details',
    'detail',
    'contents',
    'shortdescription',
    'ingredients',
    'composition',
    'resume',
    'body',
    'bodyhtml',
  ],
  category: [
    'category',
    'categorie',
    'type',
    'section',
    'rayon',
    'menucategory',
    'categoryname',
    'menugroup',
    'accountinggroup',
    'groupe',
    'famille',
  ],
  isAvailable: [
    'isavailable',
    'is_available',
    'disponible',
    'disponibilite',
    'actif',
    'active',
    'status',
    'statut',
    'published',
    'soldout',
    'online',
    'visibility',
  ],
  image: [
    'image',
    'imageurl',
    'photo',
    'imagefile',
    'fichierimage',
    'variantimage',
    'photos',
    'images',
    'picture',
  ],
} as const;

export const normalizeHeader = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

export const isPriceHeader = (normalized: string): boolean => {
  return (
    normalized.startsWith('price') ||
    normalized.startsWith('prix') ||
    normalized.includes('tarif') ||
    normalized.includes('amount') ||
    normalized.includes('montant')
  );
};

const localName = (node: Element): string =>
  (node.localName || node.tagName.split(':').pop() || '').toLowerCase();

export interface HeaderValidationTranslateFn {
  (key: string, params?: Record<string, string | number>): string;
}

const resolveTranslation = (
  t: HeaderValidationTranslateFn | undefined,
  key: string,
  params: Record<string, string | number> | undefined,
  fallback: string
): string => {
  if (!t) return fallback;
  const res = t(key, params);
  if (res && res !== key) return res;
  const resWithNs = t(`restaurant.${key}`, params);
  if (resWithNs && resWithNs !== `restaurant.${key}`) return resWithNs;
  return fallback;
};

export const getMenuImportHeaderError = (
  headers: string[],
  t?: HeaderValidationTranslateFn
): string | null => {
  const normalizedHeaders = headers.map(normalizeHeader).filter(Boolean);
  const normalizedSet = new Set(normalizedHeaders);

  const missing: string[] = [];
  const hasName = RECOGNIZED_HEADER_ALIASES.name.some((alias) => normalizedSet.has(alias));
  const hasPrice =
    RECOGNIZED_HEADER_ALIASES.price.some((alias) => normalizedSet.has(alias)) ||
    normalizedHeaders.some(isPriceHeader);
  const hasExternalId = RECOGNIZED_HEADER_ALIASES.externalId.some((alias) => normalizedSet.has(alias));

  if (!hasName) {
    missing.push('name');
  }
  if (!hasPrice) {
    missing.push('price');
  }
  // When name is provided, externalId is auto-generated on import if absent (e.g. DoorDash/Square simple exports)
  if (!hasExternalId && !hasName) {
    missing.push('externalId');
  }

  if (missing.length === 0) return null;

  const allKnownAliases = new Set<string>(Object.values(RECOGNIZED_HEADER_ALIASES).flat());
  const unknown = headers.filter((header) => {
    const key = normalizeHeader(header);
    if (!key) return false;
    if (allKnownAliases.has(key)) return false;
    if (isPriceHeader(key)) return false;
    return true;
  });

  const invalidFormatMsg = resolveTranslation(
    t,
    'importInvalidCatalogFormat',
    undefined,
    'Format de catalogue non conforme.'
  );
  const useTemplateMsg = resolveTranslation(
    t,
    'importUseTemplateAdvice',
    undefined,
    'Utilisez le modèle Excel et conservez ses noms de colonnes.'
  );
  const missingMsg = resolveTranslation(
    t,
    'importMissingRequiredColumns',
    { columns: missing.join(', ') },
    `Colonnes obligatoires manquantes : ${missing.join(', ')}.`
  );
  const unknownMsg = unknown.length > 0
    ? resolveTranslation(
        t,
        'importUnrecognizedColumns',
        { columns: unknown.join(', ') },
        `Colonnes non reconnues : ${unknown.join(', ')}.`
      )
    : '';

  return [invalidFormatMsg, useTemplateMsg, missingMsg, unknownMsg].filter(Boolean).join(' ');
};

export const parseCsvFirstLineHeaders = (content: string): string[] => {
  let cleanContent = content;
  if (cleanContent.charCodeAt(0) === 0xfeff) {
    cleanContent = cleanContent.slice(1);
  }

  const lines = cleanContent.split(/\r?\n/);
  const firstDataLine = lines.find((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith('#');
  }) ?? '';

  if (!firstDataLine) return [];

  const outsideQuotes = firstDataLine.replace(/"[^"]*"/g, '');
  const commaCount = (outsideQuotes.match(/,/g) || []).length;
  const semicolonCount = (outsideQuotes.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ';' : ',';

  const headers: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < firstDataLine.length; i++) {
    const char = firstDataLine[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      headers.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  headers.push(current.trim().replace(/^"|"$/g, ''));

  return headers.filter(Boolean);
};

const getCellText = (cell: Element, sharedStringsMap: Map<number, string>): string => {
  const type = cell.getAttribute('t');
  const textNodes = Array.from(cell.getElementsByTagName('*')).filter((node) => localName(node) === 't');
  if (type === 'inlineStr' || (textNodes.length > 0 && !type)) {
    const text = textNodes.map((node) => node.textContent ?? '').join('');
    if (text) return text;
  }

  const valueNode = Array.from(cell.getElementsByTagName('*')).find((node) => localName(node) === 'v');
  const value = valueNode?.textContent?.trim() ?? '';
  if (type === 's') {
    const idx = Number(value);
    return sharedStringsMap.get(idx) ?? '';
  }
  return value;
};

const columnIndex = (reference: string): number => {
  const letters = reference.match(/[A-Z]+/i)?.[0].toUpperCase() ?? '';
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
};

const readFileArrayBuffer = async (file: File): Promise<ArrayBuffer> => {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Impossible de lire le fichier'));
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Targeted extraction of only the needed shared strings without parsing the entire XML into DOM
 */
const extractTargetSharedStrings = (sstXml: string, targetIndices: Set<number>): Map<number, string> => {
  const result = new Map<number, string>();
  if (targetIndices.size === 0) return result;

  // Each <si> represents a shared string entry in sequential order (0, 1, 2, ...), with optional namespace prefix
  const siRegex = /<(?:[a-zA-Z0-9_-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?si>/gi;
  let match: RegExpExecArray | null;
  let currentIndex = 0;

  while ((match = siRegex.exec(sstXml)) !== null) {
    if (targetIndices.has(currentIndex)) {
      const siContent = match[1];
      const tMatches = siContent.matchAll(/<(?:[a-zA-Z0-9_-]+:)?t\b[^>]*>([^<]*)<\/(?:[a-zA-Z0-9_-]+:)?t>/gi);
      let cellText = '';
      for (const tMatch of tMatches) {
        cellText += tMatch[1];
      }
      // Decode basic XML entities
      cellText = cellText
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      result.set(currentIndex, cellText);
      if (result.size === targetIndices.size) {
        break; // Stop immediately as soon as all needed strings are resolved
      }
    }
    currentIndex++;
    if (currentIndex > maxIndex) {
      break;
    }
  }

  // Fallback to DOMParser if regex extraction missed any target index (e.g. nested complex nodes)
  if (result.size < targetIndices.size && sstXml.length < 2 * 1024 * 1024) {
    try {
      const doc = new DOMParser().parseFromString(sstXml, 'application/xml');
      const siElements = Array.from(doc.getElementsByTagName('*')).filter((node) => localName(node) === 'si');
      for (const targetIdx of targetIndices) {
        if (!result.has(targetIdx) && siElements[targetIdx]) {
          const textNodes = Array.from(siElements[targetIdx].getElementsByTagName('*')).filter(
            (child) => localName(child) === 't'
          );
          result.set(targetIdx, textNodes.map((t) => t.textContent ?? '').join(''));
        }
      }
    } catch {
      // Ignore fallback error
    }
  }

  return result;
};

const getFirstWorksheetEntry = async (zip: JSZipType): Promise<JSZipType.JSZipObject | null> => {
  const workbookFile = zip.file('xl/workbook.xml') ?? zip.file(/^xl\/workbook\.xml$/i)[0];
  if (workbookFile) {
    try {
      const workbookXml = await workbookFile.async('text');
      const doc = new DOMParser().parseFromString(workbookXml, 'application/xml');
      const sheetElements = Array.from(doc.getElementsByTagName('*')).filter((node) => localName(node) === 'sheet');
      const firstSheet = sheetElements[0];
      if (firstSheet) {
        let rId = firstSheet.getAttribute('r:id') || firstSheet.getAttribute('id');
        if (!rId) {
          for (const attr of Array.from(firstSheet.attributes)) {
            if (attr.name.toLowerCase().endsWith(':id') || attr.name.toLowerCase() === 'id') {
              rId = attr.value;
              break;
            }
          }
        }
        if (rId) {
          const relsFile = zip.file('xl/_rels/workbook.xml.rels') ?? zip.file(/^xl\/_rels\/workbook\.xml\.rels$/i)[0];
          if (relsFile) {
            const relsXml = await relsFile.async('text');
            const relsDoc = new DOMParser().parseFromString(relsXml, 'application/xml');
            const relElements = Array.from(relsDoc.getElementsByTagName('*')).filter((node) => localName(node) === 'relationship');
            const targetRel = relElements.find((rel) => {
              const id = rel.getAttribute('Id') || rel.getAttribute('id');
              return id === rId;
            });
            const target = targetRel?.getAttribute('Target') || targetRel?.getAttribute('target');
            if (target) {
              const normalizedTarget = target.replace(/\\/g, '/');
              const cleanTarget = normalizedTarget.startsWith('/')
                ? normalizedTarget.slice(1)
                : normalizedTarget.startsWith('xl/')
                ? normalizedTarget
                : `xl/${normalizedTarget}`;
              const resolved = zip.file(cleanTarget) ?? zip.file(new RegExp(`^${cleanTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'))[0];
              if (resolved) return resolved;
            }
          }
        }
      }
    } catch {
      // Fallback below
    }
  }
  return zip.file('xl/worksheets/sheet1.xml') ?? zip.file(/^xl\/worksheets\/sheet\d+\.xml$/i)[0] ?? null;
};

const parseXlsxHeaders = async (file: File): Promise<string[]> => {
  const JSZip = await loadJSZip();
  const fileBuffer = await readFileArrayBuffer(file);
  const zip = await JSZip.loadAsync(fileBuffer);

  const worksheetFile = await getFirstWorksheetEntry(zip);
  if (!worksheetFile) return [];

  const worksheetXml = await worksheetFile.async('text');

  // Find the first row that actually contains cell tags (<c ...>), supporting optional namespace prefixes (<x:row>, <d:row>)
  const rowRegex = /<(?:[a-zA-Z0-9_-]+:)?row\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?row>/gi;
  let rowMatch: RegExpExecArray | null;
  let firstRowXml = '';

  while ((rowMatch = rowRegex.exec(worksheetXml)) !== null) {
    const rowInner = rowMatch[1];
    if (/<(?:[a-zA-Z0-9_-]+:)?c\b/i.test(rowInner)) {
      firstRowXml = rowMatch[0];
      break;
    }
  }

  if (!firstRowXml) return [];

  // Remove namespaced attributes (e.g. x14ac:dyDescent="0.25") and strip element prefixes
  // so DOMParser does not fail on undeclared XML prefixes when parsing this fragment
  const sanitizedRowXml = firstRowXml
    .replace(/\s+[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+=(?:"[^"]*"|'[^']*')/g, '')
    .replace(/<(\/?)[\w-]+:(row|c|v|t|is)\b/gi, '<$1$2');

  const rowDoc = new DOMParser().parseFromString(sanitizedRowXml, 'application/xml');
  const cells = Array.from(rowDoc.getElementsByTagName('*')).filter((node) => localName(node) === 'c');

  // Collect only the string indices required for header cells
  const neededStringIndices = new Set<number>();
  for (const cell of cells) {
    if (cell.getAttribute('t') === 's') {
      const valNode = Array.from(cell.getElementsByTagName('*')).find((node) => localName(node) === 'v');
      const idx = Number(valNode?.textContent?.trim());
      if (!Number.isNaN(idx)) {
        neededStringIndices.add(idx);
      }
    }
  }

  let sharedStringsMap = new Map<number, string>();
  if (neededStringIndices.size > 0) {
    const sharedStringsFile = zip.file('xl/sharedStrings.xml') ?? zip.file(/^xl\/sharedStrings\.xml$/i)[0];
    if (sharedStringsFile) {
      const sstXml = await sharedStringsFile.async('text');
      sharedStringsMap = extractTargetSharedStrings(sstXml, neededStringIndices);
    }
  }

  return cells
    .map((cell, index) => {
      const ref = cell.getAttribute('r');
      const colIdx = ref ? columnIndex(ref) : index + 1;
      return { index: colIdx, value: getCellText(cell, sharedStringsMap) };
    })
    .sort((left, right) => left.index - right.index)
    .map(({ value }) => value.trim())
    .filter(Boolean);
};

const parseZipHeaders = async (
  file: File,
  t?: HeaderValidationTranslateFn
): Promise<string[]> => {
  const JSZip = await loadJSZip();
  const fileBuffer = await readFileArrayBuffer(file);
  const zip = await JSZip.loadAsync(fileBuffer);

  const csvFiles = Object.keys(zip.files).filter(
    (name) => name.toLowerCase().endsWith('.csv') && !name.startsWith('__MACOSX/') && !zip.files[name].dir
  );

  if (csvFiles.length === 0) {
    throw new Error(
      resolveTranslation(
        t,
        'importZipMissingCsv',
        undefined,
        "L'archive ZIP doit contenir un fichier CSV de catalogue."
      )
    );
  }

  const csvEntry = zip.file(csvFiles[0]);
  if (!csvEntry) {
    throw new Error(
      resolveTranslation(
        t,
        'importZipUnreadableCsv',
        undefined,
        "Impossible de lire le fichier CSV dans l'archive ZIP."
      )
    );
  }

  const text = await csvEntry.async('text');
  return parseCsvFirstLineHeaders(text);
};

export async function validateMenuImportFileHeaders(
  file: File,
  t?: HeaderValidationTranslateFn
): Promise<string | null> {
  try {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.csv')) {
      const text = await file.slice(0, 64 * 1024).text();
      const headers = parseCsvFirstLineHeaders(text);
      return getMenuImportHeaderError(headers, t);
    }
    if (fileName.endsWith('.zip')) {
      if (file.size > MAX_CLIENT_ZIP_BYTES) {
        return null; // Skip client inspection for very large archives (fail-open to server)
      }
      const headers = await parseZipHeaders(file, t);
      return getMenuImportHeaderError(headers, t);
    }
    if (fileName.endsWith('.xlsx')) {
      if (file.size > MAX_CLIENT_XLSX_BYTES) {
        return null; // Skip client inspection for files > 4 Mo (fail-open to server)
      }
      const headers = await parseXlsxHeaders(file);
      return getMenuImportHeaderError(headers, t);
    }
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.message.startsWith("L'archive ZIP") ||
        err.message.startsWith('The ZIP archive') ||
        err.message.includes('ZIP'))
    ) {
      return err.message;
    }
    return null;
  }
  return null;
}
