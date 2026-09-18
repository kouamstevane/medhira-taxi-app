import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  classifyMenuImportRows,
  computeImportedMenuItemId,
  normalizeMenuRow,
  parseCsvBuffer,
  parseXlsxBuffer,
  validateMenuImportHeaders,
  getTemplateHeaderError,
  stripHtml,
} from '../menuImportJobs.js';
import { isPublicRoutableIp, validateWooCommerceTarget } from '../woocommerceSecurity.js';
import { assertXlsxArchiveWithinLimits } from '../xlsxLimits.js';
import { parseXlsxImportBuffer } from '../menuImportAssets.js';

describe('Menu Import Pure Helpers & Parsers', () => {
  describe('validateMenuImportHeaders', () => {
    test('reports the template fields missing from a non-template catalogue', () => {
      expect(validateMenuImportHeaders(['category', 'item_name', 'description', 'price_cad', 'active'])).toEqual({
        missing: ['externalId', 'name', 'price', 'isAvailable', 'image'],
        unexpected: ['item_name', 'price_cad', 'active'],
      });
    });

    test('accepts the official template headers', () => {
      expect(validateMenuImportHeaders(['externalId', 'name', 'description', 'price', 'category', 'isAvailable', 'image'])).toEqual({
        missing: [],
        unexpected: [],
      });
    });
  });

  test('explains how to fix a non-template catalogue with missing columns', () => {
    expect(getTemplateHeaderError(['category', 'custom_foo', 'options'])).toBe(
      'Format de catalogue non conforme. Utilisez le modèle Excel et conservez ses noms de colonnes. Colonnes obligatoires manquantes : name, price, externalId. Colonnes non reconnues : custom_foo, options.'
    );
  });

  test('accepts DoorDash, Uber Eats and Square headers in getTemplateHeaderError', () => {
    expect(getTemplateHeaderError(['category', 'item_name', 'description', 'price_cad', 'contents', 'active'])).toBeNull();
    expect(getTemplateHeaderError(['Item ID', 'Item Name', 'Base Price', 'Item Description', 'Menu Category'])).toBeNull();
    expect(getTemplateHeaderError(['Product Name', 'Price Incl. Tax', 'Accounting Group', 'Barcode'])).toBeNull();
  });

  describe('classifyMenuImportRows', () => {
    test('classifies valid new rows and same-source updates for review', () => {
      const result = classifyMenuImportRows(
        'csv',
        [
          { name: 'Burger', description: 'Maison', price: '12', category: 'Plats', externalId: 'new-1' },
          { name: 'Pizza', description: 'DOP', price: '15', category: 'Pizzas', externalId: 'existing-1' },
        ],
        new Map([
          [computeImportedMenuItemId('csv', 'existing-1'), { source: 'csv', externalId: 'existing-1' }],
        ])
      );

      expect(result.summary).toEqual({ totalRows: 2, importableRows: 2, invalidRows: 0, conflictRows: 0, newRows: 1, updateRows: 1 });
      expect(result.rows.map((row) => row.status)).toEqual(['new', 'update']);
      expect(result.rows.every((row) => row.selectable)).toBe(true);
    });

    test('keeps invalid and conflicting rows visible but not selectable', () => {
      const result = classifyMenuImportRows(
        'csv',
        [
          { name: 'Prix invalide', price: '-5', category: 'Tests', externalId: 'bad-price' },
          { name: 'Conflit manuel', price: '10', category: 'Tests', externalId: 'manual-1' },
        ],
        new Map([
          [computeImportedMenuItemId('csv', 'manual-1'), { source: 'manual', externalId: 'manual-1' }],
        ])
      );

      expect(result.summary).toEqual({ totalRows: 2, importableRows: 0, invalidRows: 1, conflictRows: 1, newRows: 0, updateRows: 0 });
      expect(result.rows.every((row) => !row.selectable)).toBe(true);
      expect(result.rows[0].error).toMatch(/prix invalide/i);
      expect(result.rows[1].error).toMatch(/manuel/i);
    });
  });

  describe('computeImportedMenuItemId', () => {
    test('produces deterministic sha256-based ID prefixed with item_', () => {
      const id1 = computeImportedMenuItemId('csv', 'SKU-100');
      const id2 = computeImportedMenuItemId('csv', 'SKU-100');
      expect(id1).toBe(id2);
      expect(id1.startsWith('item_')).toBe(true);
      expect(id1.length).toBe(37); // 'item_' (5) + 32 hex chars
    });

    test('differentiates between sources for identical externalId', () => {
      const idCsv = computeImportedMenuItemId('csv', 'PROD-1');
      const idWc = computeImportedMenuItemId('woocommerce', 'PROD-1');
      expect(idCsv).not.toBe(idWc);
    });

    test('throws error if source or externalId is empty', () => {
      expect(() => computeImportedMenuItemId('csv', '')).toThrow();
      expect(() => computeImportedMenuItemId('csv', '   ')).toThrow();
    });
  });

  describe('stripHtml', () => {
    test('removes HTML tags and normalizes spaces', () => {
      expect(stripHtml('<p>Délicieux <strong>Burger</strong> avec sauce</p>')).toBe('Délicieux Burger avec sauce');
      expect(stripHtml('')).toBe('');
    });
  });

  describe('parseCsvBuffer', () => {
    test('parses comma-separated CSV with UTF-8 BOM', () => {
      const csvStr = '\uFEFFname,description,price,category,externalId\nBurger,Gourmet,15.5,Plats,ext-1';
      const records = parseCsvBuffer(Buffer.from(csvStr, 'utf8'));
      expect(records.length).toBe(1);
      expect(records[0].name).toBe('Burger');
      expect(records[0].price).toBe('15.5');
      expect(records[0].externalId).toBe('ext-1');
    });

    test('parses semicolon-separated CSV', () => {
      const csvStr = 'Nom;Description;Prix;Catégorie;SKU\nPizza;Reine;12,00;Pizzas;sku-42';
      const records = parseCsvBuffer(Buffer.from(csvStr, 'utf8'));
      expect(records.length).toBe(1);
      expect(records[0].Nom).toBe('Pizza');
      expect(records[0].Prix).toBe('12,00');
      expect(records[0].SKU).toBe('sku-42');
    });

    test('ignores short template notes written as comment lines', () => {
      const csvStr = '# Obligatoires : externalId, name, price\n# Optionnels : description, category, isAvailable, image\nexternalId,name,price\nSKU-001,Burger,12';
      const records = parseCsvBuffer(Buffer.from(csvStr, 'utf8'));
      expect(records).toEqual([{ externalId: 'SKU-001', name: 'Burger', price: '12' }]);
    });

    test('handles quoted values with commas and newlines', () => {
      const csvStr = 'name,description,price,category,externalId\n"Pizza, double cheese","Sauce tomate, fromage\net herbes",14,Pizzas,sku-99';
      const records = parseCsvBuffer(Buffer.from(csvStr, 'utf8'));
      expect(records.length).toBe(1);
      expect(records[0].name).toBe('Pizza, double cheese');
      expect(records[0].description).toContain('fromage\net herbes');
    });

    test('throws error on duplicate column headers after normalization', () => {
      const csvStr = 'Nom,Description,nom,externalId\nSalade,Fraiche,Salade2,id-1';
      expect(() => parseCsvBuffer(Buffer.from(csvStr, 'utf8'))).toThrow(/double/);
    });
  });

  describe('normalizeMenuRow', () => {
    test('normalizes varied French/English headers and formats price with comma', () => {
      const rawRow = {
        Nom: 'Burger Maison',
        Description: '<p>Viande fraîche</p>',
        Prix: '14,50 €',
        Catégorie: 'Plats',
        'Id Externe': 'ext-999',
        image: 'images/burger.jpg',
        Disponible: 'oui',
      };

      const result = normalizeMenuRow(rawRow, 2);
      expect(result.name).toBe('Burger Maison');
      expect(result.description).toBe('Viande fraîche');
      expect(result.price).toBe(14.5);
      expect(result.category).toBe('Plats');
      expect(result.externalId).toBe('ext-999');
      expect(result.image).toBe('images/burger.jpg');
      expect(result).not.toHaveProperty('preparationTime');
      expect(result.isAvailable).toBe(true);
    });

    test('normalizes the French catalogue headers used by the semicolon dataset', () => {
      const rawRow = {
        Reference: 'TACO-001',
        Intitule: 'Tacos 2 Viandes',
        Description: 'Tenders croustillants et sauce fromagère',
        Tarif: '9,50',
        Rayon: 'Street Food',
        Image: 'images/tacos.png',
        Actif: 'oui',
      };

      const result = normalizeMenuRow(rawRow, 2);
      expect(result.name).toBe('Tacos 2 Viandes');
      expect(result.price).toBe(9.5);
      expect(result.category).toBe('Street Food');
      expect(result.externalId).toBe('TACO-001');
      expect(result.image).toBe('images/tacos.png');
      expect(result.isAvailable).toBe(true);
    });

    test('auto-generates externalId from name when externalId is omitted', () => {
      const rawRow = {
        name: 'Burger Gourmet',
        price: '10',
        category: 'Plats',
      };

      const result = normalizeMenuRow(rawRow, 5);
      expect(result.externalId).toBe('auto_burgergourmet');
    });

    test('throws error with row number if name is missing', () => {
      const rawRow = {
        price: '10',
        category: 'Plats',
        externalId: 'sku-1',
      };

      expect(() => normalizeMenuRow(rawRow, 5)).toThrow(/nom du plat est manquant/i);
    });

    test('accepts third-party field names like item_name, price_cad and contents', () => {
      const rawRow = {
        item_name: 'Frango Burger',
        price_cad: '14.50 $',
        contents: 'Poulet grillé, sauce maison',
        category: 'Burgers',
      };

      const result = normalizeMenuRow(rawRow, 2);
      expect(result.name).toBe('Frango Burger');
      expect(result.price).toBe(14.5);
      expect(result.description).toBe('Poulet grillé, sauce maison');
      expect(result.externalId).toBe('auto_frangoburger');
    });

    test('throws error with row number if price is invalid or negative', () => {
      const rawRow = {
        name: 'Burger',
        price: '-5',
        externalId: 'sku-1',
      };

      expect(() => normalizeMenuRow(rawRow, 7)).toThrow(/Ligne 7/);
    });

    test('uses the general category when category is omitted', () => {
      const result = normalizeMenuRow({ name: 'Burger', price: '10', externalId: 'sku-2' }, 2);

      expect(result.category).toBe('Général');
      expect(result.isAvailable).toBe(true);
    });
  });

  describe('parseXlsxBuffer', () => {
    test('parses XLSX buffer from first worksheet correctly', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Menu');
      sheet.addRow(['name', 'description', 'price', 'category', 'externalId']);
      sheet.addRow(['Tarte aux pommes', 'Dessert maison', '6.5', 'Desserts', 'sku-xlsx-1']);

      const arrayBuffer = await workbook.xlsx.writeBuffer();
      const records = await parseXlsxBuffer(Buffer.from(arrayBuffer));

      expect(records.length).toBe(1);
      expect(records[0].name).toBe('Tarte aux pommes');
      expect(records[0].price).toBe('6.5');
      expect(records[0].externalId).toBe('sku-xlsx-1');
    });

    test('parses XLSX files whose workbook XML uses a namespace prefix', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Menu');
      sheet.addRow(['externalId', 'name', 'price']);
      sheet.addRow(['sku-prefixed-1', 'Poulet', '12.5']);
      const original = Buffer.from(await workbook.xlsx.writeBuffer());
      const zip = await JSZip.loadAsync(original);
      const workbookXml = await zip.file('xl/workbook.xml')!.async('string');
      zip.file('xl/workbook.xml', workbookXml
        .replace(/<(\/?)((?:workbook|sheets|sheet))\b/g, '<$1x:$2')
        .replace('<x:workbook ', '<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ')
        .replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', ''));
      const sharedStringsXml = await zip.file('xl/sharedStrings.xml')!.async('string');
      zip.file('xl/sharedStrings.xml', sharedStringsXml
        .replace('<sst ', '<x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ')
        .replace('</sst>', '</x:sst>')
        .replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', ''));
      const workbookRels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
      zip.file('xl/_rels/workbook.xml.rels', workbookRels.replace(/Target="([^"]+)"/g, 'Target="/xl/$1"'));

      const records = await parseXlsxImportBuffer(Buffer.from(await zip.generateAsync({ type: 'nodebuffer' })));

      expect(records[0].rawRow.name).toBe('Poulet');
      expect(records[0].rawRow.price).toBe('12.5');
    });
  });

  describe('assertXlsxArchiveWithinLimits', () => {
    test('succeeds for valid standard Excel buffer', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Test');
      sheet.addRow(['col1', 'col2']);
      sheet.addRow(['val1', 'val2']);
      const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;

      await expect(assertXlsxArchiveWithinLimits(Buffer.from(buffer))).resolves.toBeUndefined();
    });
  });

  describe('WooCommerce Security & SSRF Protection', () => {
    test('isPublicRoutableIp correctly classifies IPs', () => {
      expect(isPublicRoutableIp('127.0.0.1')).toBe(false);
      expect(isPublicRoutableIp('10.0.0.1')).toBe(false);
      expect(isPublicRoutableIp('192.168.1.1')).toBe(false);
      expect(isPublicRoutableIp('172.16.0.1')).toBe(false);
      expect(isPublicRoutableIp('169.254.169.254')).toBe(false);
      expect(isPublicRoutableIp('::1')).toBe(false);
      expect(isPublicRoutableIp('fe80::1')).toBe(false);

      // Public IPs
      expect(isPublicRoutableIp('8.8.8.8')).toBe(true);
      expect(isPublicRoutableIp('1.1.1.1')).toBe(true);
      expect(isPublicRoutableIp('142.250.190.46')).toBe(true);
    });

    test('validateWooCommerceTarget rejects non-HTTPS and URLs with embedded credentials', async () => {
      await expect(validateWooCommerceTarget('http://example.com')).rejects.toThrow(/HTTPS/);
      await expect(validateWooCommerceTarget('https://user:pass@example.com')).rejects.toThrow(/identifiants/);
      await expect(validateWooCommerceTarget('https://localhost:8080')).rejects.toThrow(/interdit/);
      await expect(validateWooCommerceTarget('https://169.254.169.254')).rejects.toThrow(/interdit/);
    });
  });
});
