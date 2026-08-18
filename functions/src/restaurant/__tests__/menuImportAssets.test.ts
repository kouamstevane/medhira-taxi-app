import ExcelJS from 'exceljs';
import { normalizeArchivePath, parseXlsxImportBuffer, parseZipCsvBuffer } from '../menuImportAssets.js';

const archiver = require('archiver') as (format: string) => {
  on(event: string, handler: (...args: unknown[]) => void): void;
  append(data: Buffer | string, options: { name: string }): void;
  finalize(): Promise<void>;
};

function createZip(entries: Array<{ name: string; data: string | Buffer }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip');
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: unknown) => chunks.push(Buffer.from(chunk as Buffer)));
    archive.on('error', (error: unknown) => reject(error));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    entries.forEach((entry) => archive.append(entry.data, { name: entry.name }));
    void archive.finalize();
  });
}

describe('menu import assets', () => {
  test('associates ZIP images with CSV rows', async () => {
    const buffer = await createZip([
      { name: 'menu.csv', data: '# Obligatoires : externalId, name, price\n# Optionnels : category, image\nexternalId,name,price,category,image\nSKU-001,Burger,12,Burgers,SKU-001.png' },
      { name: 'images/SKU-001.png', data: Buffer.from('png-data') },
    ]);

    const records = await parseZipCsvBuffer(buffer);

    expect(records).toHaveLength(1);
    expect(records[0].rawRow.name).toBe('Burger');
    expect(records[0].imageAsset?.originalName).toBe('images/SKU-001.png');
    expect(records[0].imageAsset?.extension).toBe('png');
  });

  test('rejects a ZIP row that references a missing image', async () => {
    const buffer = await createZip([
      { name: 'menu.csv', data: 'externalId,name,price,image\nSKU-001,Burger,12,missing.png' },
    ]);

    await expect(parseZipCsvBuffer(buffer)).rejects.toThrow(/image introuvable/i);
  });

  test('rejects unsafe ZIP paths', () => {
    expect(() => normalizeArchivePath('../outside.png')).toThrow(/chemin suspect/i);
    expect(() => normalizeArchivePath('/outside.png')).toThrow(/chemin suspect/i);
  });

  test('associates an embedded XLSX image with the row and image column', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Menu');
    worksheet.addRow(['externalId', 'name', 'price', 'category', 'image']);
    worksheet.addRow(['SKU-001', 'Burger', 12, 'Burgers', '']);
    const imageId = workbook.addImage({
      buffer: Buffer.from('png-data') as unknown as never,
      extension: 'png',
    });
    worksheet.addImage(imageId, { tl: { col: 4, row: 1 }, ext: { width: 100, height: 100 } });

    const buffer = Buffer.from((await workbook.xlsx.writeBuffer()) as unknown as Buffer);
    const records = await parseXlsxImportBuffer(buffer);

    expect(records).toHaveLength(1);
    expect(records[0].imageAsset?.extension).toBe('png');
  });
});
