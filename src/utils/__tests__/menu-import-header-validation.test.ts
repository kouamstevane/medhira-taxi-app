import JSZip from 'jszip';
import {
  getMenuImportHeaderError,
  parseCsvFirstLineHeaders,
  validateMenuImportFileHeaders,
} from '../menu-import-header-validation';

describe('menu import header validation', () => {
  test('returns a concise actionable error for missing template headers', () => {
    expect(getMenuImportHeaderError(['category', 'item_name', 'price_cad'])).toBe(
      'Fichier non conforme au modèle Excel. Téléchargez le modèle ci-dessous et conservez exactement ses noms de colonnes. Colonnes obligatoires manquantes : externalId, name, price. Colonnes inconnues : item_name, price_cad.'
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
      zip.file('menu.csv', 'category,item_name,price_cad\nPlats,Burger,12');
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const file = new File([buffer], 'menu.zip', { type: 'application/zip' });

      await expect(validateMenuImportFileHeaders(file)).resolves.toContain(
        'Colonnes obligatoires manquantes : externalId, name, price.'
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

    test('reads XLSX headers with inlineStr and reports missing columns', async () => {
      const zip = new JSZip();
      zip.file(
        'xl/worksheets/sheet1.xml',
        '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>category</t></is></c><c r="B1" t="inlineStr"><is><t>item_name</t></is></c></row></sheetData></worksheet>'
      );
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const file = new File([buffer], 'menu.xlsx');

      await expect(validateMenuImportFileHeaders(file)).resolves.toContain(
        'Colonnes obligatoires manquantes : externalId, name, price.'
      );
    });

    test('skips client inspection for large XLSX files to delegate to server', async () => {
      const fakeLargeBlob = new Blob([new Uint8Array(6 * 1024 * 1024)]);
      const file = new File([fakeLargeBlob], 'large.xlsx');

      await expect(validateMenuImportFileHeaders(file)).resolves.toBeNull();
    });
  });
});

