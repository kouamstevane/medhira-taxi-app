import yauzl from 'yauzl';
import ExcelJS from 'exceljs';
import { parseCsvBuffer, MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS } from './menuImportParsing.js';
import { assertXlsxArchiveWithinLimits } from './xlsxLimits.js';

export type MenuImportImageExtension = 'jpeg' | 'png' | 'gif' | 'webp';

export interface MenuImportImageAsset {
  buffer: Buffer;
  extension: MenuImportImageExtension;
  originalName: string;
}

export interface ParsedMenuImportRecord {
  rawRow: Record<string, string>;
  rowNumber?: number;
  imageAsset?: MenuImportImageAsset;
}

interface ArchiveEntry {
  name: string;
  buffer: Buffer;
}

const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_EXTENSIONS = new Set<MenuImportImageExtension>(['jpeg', 'png', 'gif', 'webp']);

export function normalizeArchivePath(fileName: string): string {
  const normalized = fileName.replace(/\\/g, '/').replace(/^\.\//, '');
  const segments = normalized.split('/').filter(Boolean);
  if (!segments.length || normalized.startsWith('/') || segments.includes('..')) {
    throw new Error(`Chemin suspect détecté dans l'archive: ${fileName}`);
  }
  return segments.join('/');
}

function getImageExtension(fileName: string): MenuImportImageExtension {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'jpg') return 'jpeg';
  if (!extension || !SUPPORTED_IMAGE_EXTENSIONS.has(extension as MenuImportImageExtension)) {
    throw new Error(`Format d'image non supporté dans l'archive: ${fileName}`);
  }
  return extension as MenuImportImageExtension;
}

function readZipEntries(buffer: Buffer): Promise<ArchiveEntry[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipfile) => {
      if (error || !zipfile) {
        reject(new Error(`Archive ZIP invalide ou corrompue${error ? `: ${error.message}` : ''}`));
        return;
      }

      const entries: ArchiveEntry[] = [];
      let totalUncompressedBytes = 0;
      let entryCount = 0;
      let settled = false;

      const fail = (reason: Error) => {
        if (settled) return;
        settled = true;
        zipfile.close();
        reject(reason);
      };

      zipfile.on('error', (zipError) => fail(new Error(`Erreur lors de la lecture de l'archive ZIP: ${zipError.message}`)));
      zipfile.on('end', () => {
        if (!settled) {
          settled = true;
          resolve(entries);
        }
      });

      const readNext = () => {
        if (!settled) zipfile.readEntry();
      };

      zipfile.on('entry', (entry) => {
        if (settled) return;
        entryCount += 1;
        if (entryCount > MAX_ARCHIVE_ENTRIES) {
          fail(new Error(`L'archive ZIP contient trop d'entrées (maximum ${MAX_ARCHIVE_ENTRIES})`));
          return;
        }

        let normalizedName: string;
        try {
          normalizedName = normalizeArchivePath(entry.fileName);
        } catch (entryError) {
          fail(entryError instanceof Error ? entryError : new Error(String(entryError)));
          return;
        }

        totalUncompressedBytes += entry.uncompressedSize;
        if (totalUncompressedBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
          fail(new Error("La taille décompressée totale de l'archive ZIP dépasse 64 MiB"));
          return;
        }

        if (/\/$/.test(normalizedName)) {
          readNext();
          return;
        }

        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail(new Error(`Impossible de lire l'entrée ZIP ${normalizedName}`));
            return;
          }

          const chunks: Buffer[] = [];
          let readBytes = 0;
          stream.on('data', (chunk: Buffer) => {
            readBytes += chunk.length;
            if (readBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
              stream.destroy(new Error('Entrée ZIP trop volumineuse'));
              return;
            }
            chunks.push(chunk);
          });
          stream.on('error', (streamReadError) => fail(new Error(`Impossible de lire l'entrée ZIP ${normalizedName}: ${streamReadError.message}`)));
          stream.on('end', () => {
            if (settled) return;
            entries.push({ name: normalizedName, buffer: Buffer.concat(chunks) });
            readNext();
          });
        });
      });

      readNext();
    });
  });
}

function getImageReference(row: Record<string, string>): string {
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    if (['image', 'imageurl', 'photo', 'imagefile', 'fichierimage'].includes(normalizedKey)) {
      return String(value || '').trim();
    }
  }
  return '';
}

function findZipImage(entries: ArchiveEntry[], reference: string): ArchiveEntry | undefined {
  const normalizedReference = normalizeArchivePath(reference);
  const candidates = new Set([normalizedReference, `images/${normalizedReference}`]);
  return entries.find((entry) => candidates.has(entry.name));
}

export async function parseZipCsvBuffer(buffer: Buffer): Promise<ParsedMenuImportRecord[]> {
  const entries = await readZipEntries(buffer);
  const csvEntries = entries.filter((entry) => entry.name.toLowerCase().endsWith('.csv'));
  if (csvEntries.length !== 1) {
    throw new Error(`L'archive ZIP doit contenir exactement un fichier CSV (reçu ${csvEntries.length})`);
  }

  for (const entry of entries) {
    if (entry !== csvEntries[0]) getImageExtension(entry.name);
  }

  const rawRecords = parseCsvBuffer(csvEntries[0].buffer);
  return rawRecords.map((rawRow, index) => {
    const reference = getImageReference(rawRow);
    if (!reference) return { rawRow, rowNumber: index + 2 };

    const imageEntry = findZipImage(entries, reference);
    if (!imageEntry) {
      throw new Error(`Ligne ${index + 2}: image introuvable dans l'archive: ${reference}`);
    }
    if (imageEntry.buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`Ligne ${index + 2}: image trop volumineuse: ${reference}`);
    }

    return {
      rawRow,
      rowNumber: index + 2,
      imageAsset: {
        buffer: imageEntry.buffer,
        extension: getImageExtension(imageEntry.name),
        originalName: imageEntry.name,
      },
    };
  });
}

function readCellValue(cell: ExcelJS.Cell): string {
  if (cell.value === null || cell.value === undefined) return '';
  if (typeof cell.value === 'object') {
    if ('text' in cell.value && typeof cell.value.text === 'string') return cell.value.text;
    if ('result' in cell.value && cell.value.result !== undefined) return String(cell.value.result);
    return String(cell.text || '');
  }
  return String(cell.value).trim();
}

export async function parseXlsxImportBuffer(buffer: Buffer): Promise<ParsedMenuImportRecord[]> {
  await assertXlsxArchiveWithinLimits(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];
  if (worksheet.rowCount > MAX_IMPORT_ROWS + 1 || worksheet.columnCount > MAX_IMPORT_COLUMNS) {
    throw new Error('Le fichier XLSX dépasse les limites autorisées');
  }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber - 1] = readCellValue(cell).trim();
  });
  const imageColumnIndex = headers.findIndex((header) => {
    const normalized = header.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    return ['image', 'imageurl', 'photo', 'imagefile', 'fichierimage'].includes(normalized);
  });

  const records: ParsedMenuImportRecord[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rawRow: Record<string, string> = {};
    let hasData = false;
    headers.forEach((header, index) => {
      if (!header) return;
      const value = readCellValue(row.getCell(index + 1)).trim();
      rawRow[header] = value;
      if (value) hasData = true;
    });
    if (hasData) records.push({ rawRow, rowNumber: rowNumber });
  }

  const imagesByRow = new Map<number, MenuImportImageAsset>();
  for (const image of worksheet.getImages()) {
    const imageColumn = image.range?.tl?.nativeCol;
    const imageRow = image.range?.tl?.nativeRow;
    if (imageColumn === undefined || imageRow === undefined) continue;
    const rowNumber = imageRow + 1;
    if (imageColumnIndex < 0 || imageColumn !== imageColumnIndex || rowNumber < 2 || rowNumber > worksheet.rowCount) {
      throw new Error(`Image Excel invalide: elle doit être ancrée dans la colonne image de sa ligne`);
    }
    if (imagesByRow.has(rowNumber)) {
      throw new Error(`Plusieurs images Excel sont associées à la ligne ${rowNumber}`);
    }

    const workbookImage = workbook.getImage(Number(image.imageId));
    const imageBuffer = workbookImage.buffer
      ? Buffer.from(workbookImage.buffer)
      : (workbookImage.base64 ? Buffer.from(workbookImage.base64.split(',').pop() || '', 'base64') : undefined);
    if (!imageBuffer || imageBuffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`Image Excel invalide ou trop volumineuse à la ligne ${rowNumber}`);
    }
    const extension = workbookImage.extension === 'jpeg' || workbookImage.extension === 'png' || workbookImage.extension === 'gif'
      ? workbookImage.extension
      : undefined;
    if (!extension) throw new Error(`Format d'image Excel non supporté à la ligne ${rowNumber}`);
    imagesByRow.set(rowNumber, { buffer: imageBuffer, extension, originalName: workbookImage.filename || `row-${rowNumber}.${extension}` });
  }

  return records.map((record) => {
    const imageAsset = imagesByRow.get(record.rowNumber || 0);
    if (getImageReference(record.rawRow) && !imageAsset) {
      throw new Error(`Ligne ${record.rowNumber}: image Excel intégrée introuvable dans la cellule image`);
    }
    return { ...record, imageAsset };
  });
}
