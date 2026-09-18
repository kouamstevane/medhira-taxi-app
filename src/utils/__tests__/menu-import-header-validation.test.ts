import JSZip from 'jszip';
import {
  getMenuImportHeaderError,
  parseCsvFirstLineHeaders,
  validateMenuImportFileHeaders,
} from '../menu-import-header-validation';
import { getTranslation } from '@/locales';

describe('menu import header validation', () => {
  test('returns a concise actionable error for missing template headers', () => {
    expect(getMenuImportHeaderError(['category', 'custom_field', 'extra_data'])).toBe(
      'Format de catalogue non conforme. Utilisez le modèle Excel et conservez ses noms de colonnes. Colonnes obligatoires manquantes : name, price, externalId. Colonnes non reconnues : custom_field, extra_data.'
    );
  });

  test('returns English localized error when English translator is passed', () => {
    const tEn = (key: string, params?: Record<string, string | number>) =>
      getTranslation('en', key.startsWith('restaurant.') ? key : `restaurant.${key}`, params);

    expect(getMenuImportHeaderError(['category', 'custom_field', 'extra_data'], tEn)).toBe(
      'Invalid catalog format. Use the Excel template and keep its column names. Missing required columns: name, price, externalId. Unrecognized columns: custom_field, extra_data.'
    );
  });

  test('accepts official template headers without error', () => {
    expect(
      getMenuImportHeaderError([
        'externalId',
        'name',
        'description',
        'price',
        'category',
        'isAvailable',
        'image',
      ])
    ).toBeNull();
  });

  test('accepts recognized French and standard aliases without false positives', () => {
    expect(
      getMenuImportHeaderError([
        'Reference',
        'Nom',
        'Description',
        'Tarif',
        'Rayon',
        'Actif',
        'Image',
      ])
    ).toBeNull();

    expect(
      getMenuImportHeaderError(['SKU', 'Intitulé', 'Prix'])
    ).toBeNull();

    expect(
      getMenuImportHeaderError(['id', 'titre', 'amount'])
    ).toBeNull();
  });

  test('accepts DoorDash, Uber Eats, Square POS and Lightspeed formats without error', () => {
    // DoorDash / Square Canada export (from user screenshot)
    expect(
      getMenuImportHeaderError(['category', 'item_name', 'price_cad', 'contents', 'active'])
    ).toBeNull();

    // Uber Eats export
    expect(
      getMenuImportHeaderError(['Item ID', 'Item Name', 'Base Price', 'Item Description', 'Menu Category'])
    ).toBeNull();

    // Lightspeed export
    expect(
      getMenuImportHeaderError(['Product Name', 'Price Incl. Tax', 'Accounting Group', 'Barcode'])
    ).toBeNull();

    // Square POS export
    expect(
      getMenuImportHeaderError(['Token', 'Item Name', 'Price CAD', 'Description'])
    ).toBeNull();
  });

  describe('parseCsvFirstLineHeaders', () => {
    test('ignores initial comment lines starting with # and parses comma separated header', () => {
      const csv = '# Obligatoires : externalId, name, price\n# Optionnels : description\nexternalId,name,price\nSKU-1,Burger,12';
      expect(parseCsvFirstLineHeaders(csv)).toEqual(['externalId', 'name', 'price']);
    });

    test('parses semicolon delimited CSV with quotes', () => {
      const csv = '"Id Externe";"Nom du plat";"Prix TTC";"Catégorie"\n1;Burger;10;Plats';
      expect(parseCsvFirstLineHeaders(csv)).toEqual([
        'Id Externe',
        'Nom du plat',
        'Prix TTC',
        'Catégorie',
      ]);
    });

    test('parses semicolon delimited CSV when header values contain commas inside quotes', () => {
      const csv = '"Nom (pizza, burger, boisson)";"Prix";"SKU"\nBurger;10;1';
      expect(parseCsvFirstLineHeaders(csv)).toEqual([
        'Nom (pizza, burger, boisson)',
        'Prix',
        'SKU',
      ]);
    });

    test('strips UTF-8 BOM', () => {
      const csv = '\uFEFFexternalId,name,price\n1,Burger,10';
      expect(parseCsvFirstLineHeaders(csv)).toEqual(['externalId', 'name', 'price']);
    });
  });

  describe('validateMenuImportFileHeaders', () => {
    test('validates CSV file directly', async () => {
      const csv = 'SKU,Nom,Prix\n1,Pizza,15';
      const file = new File([csv], 'menu.csv', { type: 'text/csv' });
      await expect(validateMenuImportFileHeaders(file)).resolves.toBeNull();
    });

    test('validates ZIP archive containing valid CSV', async () => {
      const zip = new JSZip();
      zip.file('menu.csv', 'externalId,name,price\nSKU-1,Burger,12');
      zip.file('images/burger.jpg', 'fake-image-bytes');
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const file = new File([buffer], 'menu.zip', { type: 'application/zip' });

      await expect(validateMenuImportFileHeaders(file)).resolves.toBeNull();
    });

    test('returns actionable error for ZIP archive with invalid CSV headers', async () => {
      const zip = new JSZip();
      zip.file('menu.csv', 'category,options,extra_col\nPlats,Burger,12');
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const file = new File([buffer], 'menu.zip', { type: 'application/zip' });

      await expect(validateMenuImportFileHeaders(file)).resolves.toContain(
        'Colonnes obligatoires manquantes : name, price, externalId.'
      );
    });

    test('returns clear error for ZIP archive without CSV', async () => {
      const zip = new JSZip();
      zip.file('readme.txt', 'no csv here');
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const file = new File([buffer], 'menu.zip', { type: 'application/zip' });

      await expect(validateMenuImportFileHeaders(file)).resolves.toBe(
        "L'archive ZIP doit contenir un fichier CSV de catalogue."
      );
    });

    test('reads XLSX headers with shared strings before upload', async () => {
      const zip = new JSZip();
      zip.file(
        'xl/sharedStrings.xml',
        '<sst><si><t>externalId</t></si><si><t>name</t></si><si><t>price</t></si></sst>'
      );
      zip.file(
        'xl/worksheets/sheet1.xml',
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row></sheetData></worksheet>'
      );
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const file = new File([buffer], 'menu.xlsx');

      await expect(validateMenuImportFileHeaders(file)).resolves.toBeNull();
    });

    test('reads realistic Excel XLSX with x14ac attribute and user headers', async () => {
      const zip = new JSZip();
      zip.file(
        'xl/workbook.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet sheetId="1" name="Sheet1" state="visible" r:id="rId1"/></sheets></workbook>'
      );
      zip.file(
        'xl/_rels/workbook.xml.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
      );
      zip.file(
        'xl/sharedStrings.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="8" uniqueCount="8"><si><t>category</t></si><si><t>item_name</t></si><si><t>description</t></si><si><t>price_cad</t></si><si><t>item_type</t></si><si><t>contents</t></si><si><t>options</t></si><si><t>active</t></si></sst>'
      );
      zip.file(
        'xl/worksheets/sheet1.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x14ac" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac"><sheetData><row r="1" spans="1:8" x14ac:dyDescent="0.25"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c><c r="G1" t="s"><v>6</v></c><c r="H1" t="s"><v>7</v></c></row></sheetData></worksheet>'
      );
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const file = new File([buffer], 'Sr_Frango_Menu_Import_Simple.xlsx');

      const res = await validateMenuImportFileHeaders(file);
      expect(res).toBeNull();
    });

    test('reads XLSX headers with inlineStr and reports missing columns', async () => {
      const zip = new JSZip();
      zip.file(
        'xl/worksheets/sheet1.xml',
        '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>category</t></is></c><c r="B1" t="inlineStr"><is><t>custom_col</t></is></c></row></sheetData></worksheet>'
      );
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const file = new File([buffer], 'menu.xlsx');

      await expect(validateMenuImportFileHeaders(file)).resolves.toContain(
        'Colonnes obligatoires manquantes : name, price, externalId.'
      );
    });

    test('skips client inspection for large XLSX files to delegate to server', async () => {
      const fakeLargeBlob = new Blob([new Uint8Array(5 * 1024 * 1024)]);
      const file = new File([fakeLargeBlob], 'large.xlsx');

      await expect(validateMenuImportFileHeaders(file)).resolves.toBeNull();
    });
  });
});

