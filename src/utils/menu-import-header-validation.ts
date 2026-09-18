import type JSZipType from 'jszip';

const loadJSZip = async (): Promise<JSZipType> => {
  const jszipModule = await import('jszip');
  return (jszipModule.default ?? jszipModule) as unknown as JSZipType;
};

export const RECOGNIZED_HEADER_ALIASES = {
  externalId: ['externalid', 'external_id', 'idexterne', 'sku', 'id', 'reference', 'ref'],
  name: ['name', 'nom', 'titre', 'plat', 'item', 'intitule', 'libelle'],
  price: ['price', 'prix', 'tarif', 'amount', 'prixunitaire'],
  description: ['description', 'desc', 'details', 'detail'],
  category: ['category', 'categorie', 'type', 'section', 'rayon'],
  isAvailable: ['isavailable', 'is_available', 'disponible', 'disponibilite', 'actif', 'active'],
  image: ['image', 'imageurl', 'photo', 'imagefile', 'fichierimage'],
} as const;

export const normalizeHeader = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const localName = (node: Element): string =>
  (node.localName || node.tagName.split(':').pop() || '').toLowerCase();

export const getMenuImportHeaderError = (headers: string[]): string | null => {
  const normalizedHeaders = headers.map(normalizeHeader).filter(Boolean);
  const normalizedSet = new Set(normalizedHeaders);

  const missing: string[] = [];
  if (!RECOGNIZED_HEADER_ALIASES.externalId.some((alias) => normalizedSet.has(alias))) {
    missing.push('externalId');
  }
  if (!RECOGNIZED_HEADER_ALIASES.name.some((alias) => normalizedSet.has(alias))) {
    missing.push('name');
  }
  if (!RECOGNIZED_HEADER_ALIASES.price.some((alias) => normalizedSet.has(alias))) {
    missing.push('price');
  }

  if (missing.length === 0) return null;

  const allKnownAliases = new Set<string>(Object.values(RECOGNIZED_HEADER_ALIASES).flat());
  const unknown = headers.filter((header) => {
    const key = normalizeHeader(header);
    return Boolean(key) && !allKnownAliases.has(key);
  });

  return [
    'Fichier non conforme au modèle Excel.',
    'Téléchargez le modèle ci-dessous et conservez exactement ses noms de colonnes.',
    `Colonnes obligatoires manquantes : ${missing.join(', ')}.`,
    unknown.length > 0 ? `Colonnes inconnues : ${unknown.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
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

const getCellText = (cell: Element, sharedStrings: string[]): string => {
  const type = cell.getAttribute('t');
  const textNodes = Array.from(cell.getElementsByTagName('*')).filter((node) => localName(node) === 't');
  if (type === 'inlineStr' || (textNodes.length > 0 && !type)) {
    const text = textNodes.map((node) => node.textContent ?? '').join('');
    if (text) return text;
  }

  const valueNode = Array.from(cell.getElementsByTagName('*')).find((node) => localName(node) === 'v');
  const value = valueNode?.textContent?.trim() ?? '';
  if (type === 's') return sharedStrings[Number(value)] ?? '';
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

const parseSharedStrings = (xmlText: string): string[] => {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const siElements = Array.from(doc.getElementsByTagName('*')).filter((node) => localName(node) === 'si');
  return siElements.map((si) => {
    const textNodes = Array.from(si.getElementsByTagName('*')).filter((child) => localName(child) === 't');
    return textNodes.map((t) => t.textContent ?? '').join('');
  });
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
        const rId = firstSheet.getAttribute('r:id') || firstSheet.getAttribute('id');
        if (rId) {
          const relsFile = zip.file('xl/_rels/workbook.xml.rels') ?? zip.file(/^xl\/_rels\/workbook\.xml\.rels$/i)[0];
          if (relsFile) {
            const relsXml = await relsFile.async('text');
            const relsDoc = new DOMParser().parseFromString(relsXml, 'application/xml');
            const relElements = Array.from(relsDoc.getElementsByTagName('*')).filter((node) => localName(node) === 'relationship');
            const targetRel = relElements.find((rel) => rel.getAttribute('Id') === rId);
            const target = targetRel?.getAttribute('Target');
            if (target) {
              const cleanTarget = target.startsWith('/') ? target.slice(1) : target.startsWith('xl/') ? target : `xl/${target}`;
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
  const sharedStringsFile = zip.file('xl/sharedStrings.xml') ?? zip.file(/^xl\/sharedStrings\.xml$/i)[0];
  const sharedStrings = sharedStringsFile
    ? parseSharedStrings(await sharedStringsFile.async('text'))
    : [];

  const worksheetFile = await getFirstWorksheetEntry(zip);
  if (!worksheetFile) return [];

  const document = new DOMParser().parseFromString(await worksheetFile.async('text'), 'application/xml');
  const rows = Array.from(document.getElementsByTagName('*')).filter((node) => localName(node) === 'row');
  const firstRow = rows.find((r) => r.getAttribute('r') === '1') || rows[0];
  if (!firstRow) return [];

  const cells = Array.from(firstRow.getElementsByTagName('*')).filter((node) => localName(node) === 'c');
  return cells
    .map((cell, index) => {
      const ref = cell.getAttribute('r');
      const colIdx = ref ? columnIndex(ref) : index + 1;
      return { index: colIdx, value: getCellText(cell, sharedStrings) };
    })
    .sort((left, right) => left.index - right.index)
    .map(({ value }) => value.trim())
    .filter(Boolean);
};

const parseZipHeaders = async (file: File): Promise<string[]> => {
  const JSZip = await loadJSZip();
  const fileBuffer = await readFileArrayBuffer(file);
  const zip = await JSZip.loadAsync(fileBuffer);

  const csvFiles = Object.keys(zip.files).filter(
    (name) => name.toLowerCase().endsWith('.csv') && !name.startsWith('__MACOSX/') && !zip.files[name].dir
  );

  if (csvFiles.length === 0) {
    throw new Error("L'archive ZIP doit contenir un fichier CSV de catalogue.");
  }

  const csvEntry = zip.file(csvFiles[0]);
  if (!csvEntry) {
    throw new Error("Impossible de lire le fichier CSV dans l'archive ZIP.");
  }

  const text = await csvEntry.async('text');
  return parseCsvFirstLineHeaders(text);
};

export async function validateMenuImportFileHeaders(file: File): Promise<string | null> {
  try {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.csv')) {
      const text = await file.slice(0, 64 * 1024).text();
      const headers = parseCsvFirstLineHeaders(text);
      return getMenuImportHeaderError(headers);
    }
    if (fileName.endsWith('.zip')) {
      const headers = await parseZipHeaders(file);
      return getMenuImportHeaderError(headers);
    }
    if (fileName.endsWith('.xlsx')) {
      if (file.size > 5 * 1024 * 1024) {
        return null;
      }
      const headers = await parseXlsxHeaders(file);
      return getMenuImportHeaderError(headers);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("L'archive ZIP")) {
      return err.message;
    }
    return null;
  }
  return null;
}
