import * as crypto from 'crypto';
import { parse as parseCsvSync } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { encryptionMasterKey } from '../config/secrets.js';
import { decryptSensitiveData } from '../utils/encryption.js';
import {
  MenuImportError,
  MenuImportJobRecord,
  MenuItemSource,
  MenuRowZodSchema,
  ParsedMenuRow,
  StartMenuFileImportSchema,
  SyncSummary,
} from './menuImportContracts.js';
import { requestWooCommerce, validateWooCommerceTarget } from './woocommerceSecurity.js';
import { assertXlsxArchiveWithinLimits } from './xlsxLimits.js';

export const MAX_IMPORT_ROWS = 10000;
export const MAX_IMPORT_COLUMNS = 64;
export const MAX_ATTEMPTS = 5;
export const MAX_ERRORS_STORED = 100;
export const PROGRESS_BATCH_SIZE = 50;

/**
 * Computes deterministic ID for imported menu items:
 * `item_` + 32 hex chars of sha256(source + ':' + externalId)
 */
export function computeImportedMenuItemId(source: MenuItemSource, externalId: string): string {
  if (!source || typeof source !== 'string') {
    throw new Error('Le champ source est obligatoire pour générer un ID de plat importé');
  }
  if (!externalId || typeof externalId !== 'string' || externalId.trim().length === 0) {
    throw new Error('Le champ externalId ne peut pas être vide pour générer un ID de plat importé');
  }
  const hash = crypto.createHash('sha256').update(`${source.trim()}:${externalId.trim()}`).digest('hex');
  return `item_${hash.slice(0, 32)}`;
}

/**
 * Strips HTML tags from strings
 */
export function stripHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  return html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes header keys: lowercase, trim, remove accents and special chars
 */
function normalizeHeaderKey(key: string): string {
  return key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Parses raw CSV buffer into array of key-value records
 */
export function parseCsvBuffer(buffer: Buffer): Array<Record<string, string>> {
  let content = buffer.toString('utf8');
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  // Detect delimiter (; or ,) from first non-empty line
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

  if (rawRecords.length === 0) {
    return [];
  }

  // Validate headers
  const headers = Object.keys(rawRecords[0] || {});
  if (headers.length > MAX_IMPORT_COLUMNS) {
    throw new Error(`Le fichier CSV dépasse la limite de ${MAX_IMPORT_COLUMNS} colonnes (${headers.length} détectées)`);
  }

  const normalizedHeaders = new Set<string>();
  for (const h of headers) {
    const norm = normalizeHeaderKey(h);
    if (norm && normalizedHeaders.has(norm)) {
      throw new Error(`En-tête de colonne en double détecté dans le fichier CSV: "${h}"`);
    }
    if (norm) normalizedHeaders.add(norm);
  }

  return rawRecords;
}

/**
 * Parses XLSX buffer into array of key-value records from the first worksheet
 */
export async function parseXlsxBuffer(buffer: Buffer): Promise<Array<Record<string, string>>> {
  await assertXlsxArchiveWithinLimits(buffer);

  const workbook = new ExcelJS.Workbook();
  const xlsxBuffer = Buffer.from(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(xlsxBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const rowCount = worksheet.rowCount;
  if (rowCount > MAX_IMPORT_ROWS + 1) {
    throw new Error(`Le fichier XLSX dépasse la limite autorisée de ${MAX_IMPORT_ROWS} lignes (${rowCount - 1} lignes de données)`);
  }

  const columnCount = worksheet.columnCount;
  if (columnCount > MAX_IMPORT_COLUMNS) {
    throw new Error(`Le fichier XLSX dépasse la limite de ${MAX_IMPORT_COLUMNS} colonnes (${columnCount} détectées)`);
  }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value || '').trim();
  });

  const normalizedHeaders = new Set<string>();
  for (const h of headers.filter(Boolean)) {
    const norm = normalizeHeaderKey(h);
    if (norm && normalizedHeaders.has(norm)) {
      throw new Error(`En-tête de colonne en double détecté dans le fichier XLSX: "${h}"`);
    }
    if (norm) normalizedHeaders.add(norm);
  }

  const records: Array<Record<string, string>> = [];

  for (let r = 2; r <= rowCount; r++) {
    const row = worksheet.getRow(r);
    let hasData = false;
    const record: Record<string, string> = {};

    headers.forEach((header, idx) => {
      if (!header) return;
      const cell = row.getCell(idx + 1);
      let val = '';
      if (cell.value !== null && cell.value !== undefined) {
        if (typeof cell.value === 'object') {
          if ('text' in cell.value && typeof cell.value.text === 'string') {
            val = cell.value.text;
          } else if ('result' in cell.value && cell.value.result !== undefined) {
            val = String(cell.value.result);
          } else {
            val = String(cell.text || '');
          }
        } else {
          val = String(cell.value);
        }
      }
      val = val.trim();
      if (val.length > 0) hasData = true;
      record[header] = val;
    });

    if (hasData) {
      records.push(record);
    }
  }

  return records;
}

/**
 * Normalizes and validates a raw menu row from CSV / XLSX
 */
export function normalizeMenuRow(row: Record<string, unknown>, rowNumber: number): ParsedMenuRow {
  let name = '';
  let description = '';
  let rawPrice = '';
  let category = '';
  let externalId = '';
  let rawPrepTime = '';
  let rawAvailable = '';
  let rawDate = '';

  for (const [key, val] of Object.entries(row)) {
    const normKey = normalizeHeaderKey(key);
    const strVal = val !== undefined && val !== null ? String(val).trim() : '';

    if (['name', 'nom', 'titre', 'plat', 'item', 'intitule', 'libelle'].includes(normKey)) {
      name = strVal;
    } else if (['description', 'desc', 'details', 'detail'].includes(normKey)) {
      description = strVal;
    } else if (['price', 'prix', 'tarif', 'amount', 'prixunitaire'].includes(normKey)) {
      rawPrice = strVal;
    } else if (['category', 'categorie', 'type', 'section', 'rayon'].includes(normKey)) {
      category = strVal;
    } else if (['externalid', 'external_id', 'idexterne', 'sku', 'id', 'reference', 'ref'].includes(normKey)) {
      externalId = strVal;
    } else if (['preparationtime', 'preparation_time', 'tempspreparation', 'tempsdepreparation', 'preptime', 'duree', 'dureepreparation'].includes(normKey)) {
      rawPrepTime = strVal;
    } else if (['isavailable', 'is_available', 'disponible', 'disponibilite', 'actif', 'active'].includes(normKey)) {
      rawAvailable = strVal;
    } else if (['sourceupdatedat', 'source_updated_at', 'datemaj', 'updatedat'].includes(normKey)) {
      rawDate = strVal;
    }
  }

  if (!externalId) {
    throw new Error(`Ligne ${rowNumber}: L'identifiant externe (externalId/sku/id) est manquant`);
  }

  if (!name) {
    throw new Error(`Ligne ${rowNumber}: Le nom du plat est manquant`);
  }

  // Parse price: handle commas and currency symbols
  const cleanedPriceStr = rawPrice
    .replace(/[€$£]/g, '')
    .replace(/FCFA/gi, '')
    .replace(/EUR/gi, '')
    .replace(/\s+/g, '')
    .replace(',', '.');
  const price = parseFloat(cleanedPriceStr);

  if (isNaN(price) || price <= 0) {
    throw new Error(`Ligne ${rowNumber}: Prix invalide "${rawPrice}" pour le plat "${name}"`);
  }

  // Parse availability
  let isAvailable = true;
  if (rawAvailable) {
    const low = rawAvailable.toLowerCase();
    if (['false', '0', 'non', 'no', 'faux', 'inactif', 'inactive'].includes(low)) {
      isAvailable = false;
    }
  }

  // Parse prep time
  let preparationTime: number | undefined = undefined;
  if (rawPrepTime) {
    const parsed = parseInt(rawPrepTime, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 1440) {
      preparationTime = parsed;
    }
  }

  // Validate with Zod schema
  const validation = MenuRowZodSchema.safeParse({
    name,
    description: stripHtml(description),
    price,
    category: category || 'Général',
    externalId,
    preparationTime,
    isAvailable,
  });

  if (!validation.success) {
    const errDetail = validation.error.issues.map((i) => i.message).join(', ');
    throw new Error(`Ligne ${rowNumber} (${name}): ${errDetail}`);
  }

  let sourceUpdatedAt: Date | undefined = undefined;
  if (rawDate) {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      sourceUpdatedAt = d;
    }
  }

  return {
    rowNumber,
    name: validation.data.name,
    description: validation.data.description,
    price: validation.data.price,
    category: validation.data.category,
    externalId: validation.data.externalId,
    preparationTime: validation.data.preparationTime,
    isAvailable: validation.data.isAvailable,
    sourceUpdatedAt,
  };
}

/**
 * Checks if an error during import worker execution is transient and retryable
 */
export function isRetryableMenuImportError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const code = (error as { code?: string | number })?.code;

  if (code === 'RESOURCE_EXHAUSTED' || code === 'UNAVAILABLE' || code === 'DEADLINE_EXCEEDED') {
    return true;
  }
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('network')) {
    return true;
  }
  if (msg.includes('429') || msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
    return true;
  }
  return false;
}

/**
 * Callable Function: startMenuFileImport
 */
export const startMenuFileImport = onCall(
  { region: 'europe-west1' },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }

    const validation = StartMenuFileImportSchema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', 'Données de requête invalides', validation.error.format());
    }

    const { restaurantId, importId, filePath, type } = validation.data;
    const db = admin.firestore();

    // Verify restaurant ownership
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    if (!restaurantDoc.exists || restaurantDoc.data()?.ownerId !== request.auth.uid) {
      throw new HttpsError('permission-denied', "Vous n'êtes pas autorisé à importer un menu pour ce restaurant");
    }

    // Verify file path structure
    const expectedExtension = type === 'csv' ? 'csv' : 'xlsx';
    const expectedPath = `menu-imports/${restaurantId}/${importId}.${expectedExtension}`;
    if (filePath !== expectedPath) {
      throw new HttpsError('invalid-argument', `Chemin de fichier inattendu: attendu ${expectedPath}`);
    }

    // Verify file exists in Storage
    const bucket = admin.storage().bucket();
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError('not-found', "Le fichier téléversé n'a pas été trouvé dans le stockage");
    }

    const [metadata] = await file.getMetadata();
    const size = parseInt(String(metadata.size || '0'), 10);
    if (size <= 0 || size > 15 * 1024 * 1024) {
      throw new HttpsError('invalid-argument', 'La taille du fichier doit être comprise entre 1 octet et 15 Mo');
    }

    const importDocRef = db.doc(`restaurants/${restaurantId}/menu_imports/${importId}`);
    const existingDoc = await importDocRef.get();
    if (existingDoc.exists) {
      throw new HttpsError('already-exists', "Un job d'importation avec cet identifiant existe déjà");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await importDocRef.set({
      id: importId,
      restaurantId,
      type,
      status: 'pending',
      filePath,
      totalItems: 0,
      processedItems: 0,
      failedItems: 0,
      errors: [],
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return { importId };
  }
);

/**
 * Shared Idempotent Worker Logic for Menu Imports & Sync
 */
export async function executeMenuImportJob(restaurantId: string, importId: string): Promise<void> {
  const db = admin.firestore();
  const jobRef = db.doc(`restaurants/${restaurantId}/menu_imports/${importId}`);

  let jobRecord: MenuImportJobRecord | null = null;

  // 1. Transactional Lease Claim
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(jobRef);
    if (!snap.exists) return;

    const data = snap.data() as MenuImportJobRecord;
    if (data.status === 'completed' || data.status === 'failed') {
      return;
    }

    const now = Date.now();
    if (data.status === 'processing') {
      const leaseExpiresAt = data.leaseExpiresAt ? data.leaseExpiresAt.toMillis() : 0;
      if (leaseExpiresAt > now) {
        // Active lease held by another instance
        return;
      }
    }

    const currentAttempts = (data.attemptCount || 0) + 1;
    if (currentAttempts > MAX_ATTEMPTS) {
      transaction.update(jobRef, {
        status: 'failed',
        attemptCount: currentAttempts,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        errors: admin.firestore.FieldValue.arrayUnion({
          message: `Échec définitif: nombre maximal de tentatives atteint (${MAX_ATTEMPTS})`,
        }),
      });
      return;
    }

    const leaseExpiresAt = admin.firestore.Timestamp.fromMillis(now + 10 * 60 * 1000); // 10 minutes lease
    transaction.update(jobRef, {
      status: 'processing',
      attemptCount: currentAttempts,
      leaseExpiresAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    jobRecord = {
      ...data,
      attemptCount: currentAttempts,
      leaseExpiresAt,
    };
  });

  if (!jobRecord) {
    return;
  }

  const activeJob: MenuImportJobRecord = jobRecord;

  try {
    if (activeJob.type === 'woocommerce') {
      await syncWooCommerceMenu(activeJob);
      return;
    }

    // CSV or Excel file import
    if (!activeJob.filePath) {
      throw new Error("Chemin de fichier d'importation manquant dans le document du job");
    }

    const bucket = admin.storage().bucket();
    const file = bucket.file(activeJob.filePath);
    const [fileBuffer] = await file.download();

    let rawRecords: Array<Record<string, string>> = [];
    if (activeJob.type === 'csv') {
      rawRecords = parseCsvBuffer(fileBuffer);
    } else {
      rawRecords = await parseXlsxBuffer(fileBuffer);
    }

    await jobRef.update({
      totalItems: rawRecords.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    let processedCount = 0;
    let failedCount = 0;
    const errors: MenuImportError[] = [];

    // Process rows sequentially or in batches with collision protection
    for (let i = 0; i < rawRecords.length; i++) {
      const rawRow = rawRecords[i];
      const rowNum = i + 2;

      try {
        const parsed = normalizeMenuRow(rawRow, rowNum);
        const itemId = computeImportedMenuItemId(activeJob.type, parsed.externalId);
        const itemRef = db.doc(`restaurants/${restaurantId}/menu_items/${itemId}`);

        // Read existing item inside transaction for strict collision check
        await db.runTransaction(async (t) => {
          const itemSnap = await t.get(itemRef);
          if (itemSnap.exists) {
            const existingData = itemSnap.data() || {};
            const existingSource = existingData.source;

            // Protection: never overwrite manual or legacy items
            if (!existingSource || existingSource === 'manual') {
              throw new Error(`Le plat avec l'identifiant ${itemId} a été créé manuellement et ne peut pas être écrasé par un import`);
            }

            // Protection: never overwrite items from a different source
            if (existingSource !== activeJob.type || existingData.externalId !== parsed.externalId) {
              throw new Error(`Collision d'identifiant détectée avec une autre source (${existingSource})`);
            }

            t.set(
              itemRef,
              {
                name: parsed.name,
                description: parsed.description,
                price: parsed.price,
                category: parsed.category,
                preparationTime: parsed.preparationTime ?? admin.firestore.FieldValue.delete(),
                isAvailable: parsed.isAvailable,
                source: activeJob.type,
                externalId: parsed.externalId,
                sourceUpdatedAt: parsed.sourceUpdatedAt ? admin.firestore.Timestamp.fromDate(parsed.sourceUpdatedAt) : admin.firestore.FieldValue.delete(),
                lastImportId: importId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          } else {
            t.set(itemRef, {
              id: itemId,
              restaurantId,
              name: parsed.name,
              description: parsed.description,
              price: parsed.price,
              category: parsed.category,
              preparationTime: parsed.preparationTime ?? null,
              isAvailable: parsed.isAvailable,
              source: activeJob.type,
              externalId: parsed.externalId,
              sourceUpdatedAt: parsed.sourceUpdatedAt ? admin.firestore.Timestamp.fromDate(parsed.sourceUpdatedAt) : null,
              lastImportId: importId,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        });

        processedCount++;
      } catch (err: unknown) {
        failedCount++;
        if (errors.length < MAX_ERRORS_STORED) {
          errors.push({
            row: rowNum,
            item: String(rawRow?.name || rawRow?.nom || `Ligne ${rowNum}`),
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Update progress every PROGRESS_BATCH_SIZE rows
      if ((i + 1) % PROGRESS_BATCH_SIZE === 0 || i === rawRecords.length - 1) {
        await jobRef.update({
          processedItems: processedCount,
          failedItems: failedCount,
          errors,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    // Mark job completed
    await jobRef.update({
      status: 'completed',
      processedItems: processedCount,
      failedItems: failedCount,
      errors,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Cleanup storage file on completed job
    try {
      await file.delete();
    } catch {
      // Non-blocking cleanup
    }
  } catch (error: unknown) {
    const isRetryable = isRetryableMenuImportError(error);
    const attempts = activeJob.attemptCount || 1;

    if (isRetryable && attempts < MAX_ATTEMPTS) {
      await jobRef.update({
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        errors: admin.firestore.FieldValue.arrayUnion({
          message: `Erreur temporaire (tentative ${attempts}/${MAX_ATTEMPTS}): ${error instanceof Error ? error.message : String(error)}`,
        }),
      });
      // Rethrow to trigger Firebase onDocumentCreated retry
      throw error;
    } else {
      await jobRef.update({
        status: 'failed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        errors: admin.firestore.FieldValue.arrayUnion({
          message: error instanceof Error ? error.message : String(error),
        }),
      });
    }
  }
}

/**
 * Synchronizes WooCommerce catalog into Firestore Menu Items
 */
export async function syncWooCommerceMenu(job: MenuImportJobRecord): Promise<SyncSummary> {
  const db = admin.firestore();
  const restaurantId = job.restaurantId;
  const importId = job.id;
  const jobRef = db.doc(`restaurants/${restaurantId}/menu_imports/${importId}`);

  // Fetch private integration credentials
  const integrationSnap = await db.doc(`restaurants/${restaurantId}/private_integrations/woocommerce`).get();
  if (!integrationSnap.exists) {
    throw new Error('Intégration WooCommerce non configurée pour ce restaurant');
  }

  const integData = integrationSnap.data() || {};
  const encryptedCredentials = integData.encryptedCredentials;
  if (!encryptedCredentials) {
    throw new Error('Identifiants chiffrés WooCommerce introuvables');
  }

  const masterKey = encryptionMasterKey.value();
  const decryptedJson = await decryptSensitiveData(encryptedCredentials, masterKey);
  const { siteUrl, consumerKey, consumerSecret } = JSON.parse(decryptedJson);

  const target = await validateWooCommerceTarget(siteUrl);

  const seenExternalIds = new Set<string>();
  let page = 1;
  let hasMore = true;
  let totalProcessed = 0;
  let totalFailed = 0;
  let totalItemsEstimated = 0;
  const errors: MenuImportError[] = [];

  while (hasMore && seenExternalIds.size < MAX_IMPORT_ROWS) {
    const response = await requestWooCommerce(
      target,
      `/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish`,
      { consumerKey, consumerSecret }
    );

    if (response.status !== 200) {
      throw new Error(`Échec de récupération des produits WooCommerce (HTTP ${response.status}): ${response.statusText}`);
    }

    const totalHeader = response.headers.get('x-wp-total');
    if (totalHeader) {
      totalItemsEstimated = parseInt(totalHeader, 10);
      if (!isNaN(totalItemsEstimated)) {
        await jobRef.update({
          totalItems: totalItemsEstimated,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    const products = (await response.json()) as Array<{
      id: number | string;
      name: string;
      description?: string;
      short_description?: string;
      price?: string | number;
      regular_price?: string | number;
      status?: string;
      categories?: Array<{ id: number; name: string; slug: string }>;
      images?: Array<{ id: number; src: string; name?: string; alt?: string }>;
    }>;

    if (!Array.isArray(products) || products.length === 0) {
      hasMore = false;
      break;
    }

    for (const prod of products) {
      const externalId = String(prod.id);
      seenExternalIds.add(externalId);

      try {
        const rawPrice = prod.price || prod.regular_price || '0';
        const price = parseFloat(String(rawPrice));
        if (isNaN(price) || price <= 0) {
          throw new Error(`Prix invalide pour le produit WooCommerce #${externalId}`);
        }

        const name = (prod.name || '').trim();
        if (!name) {
          throw new Error(`Nom manquant pour le produit WooCommerce #${externalId}`);
        }

        const desc = stripHtml(prod.description || prod.short_description || '');
        const primaryCategory = prod.categories?.[0]?.name?.trim() || 'Général';
        const primaryImageUrl = prod.images?.[0]?.src?.trim() || undefined;

        const itemId = computeImportedMenuItemId('woocommerce', externalId);
        const itemRef = db.doc(`restaurants/${restaurantId}/menu_items/${itemId}`);

        await db.runTransaction(async (t) => {
          const itemSnap = await t.get(itemRef);
          if (itemSnap.exists) {
            const existingData = itemSnap.data() || {};
            // Never overwrite manual items
            if (!existingData.source || existingData.source === 'manual') {
              throw new Error(`Le plat ${itemId} a été créé manuellement et ne peut être modifié par WooCommerce`);
            }
            if (existingData.source !== 'woocommerce' || existingData.externalId !== externalId) {
              throw new Error(`Collision d'identifiant détectée avec la source ${existingData.source}`);
            }

            t.set(
              itemRef,
              {
                name,
                description: desc.slice(0, 1000),
                price,
                category: primaryCategory.slice(0, 80),
                imageUrl: primaryImageUrl || admin.firestore.FieldValue.delete(),
                isAvailable: true,
                source: 'woocommerce',
                externalId,
                lastImportId: importId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          } else {
            t.set(itemRef, {
              id: itemId,
              restaurantId,
              name,
              description: desc.slice(0, 1000),
              price,
              category: primaryCategory.slice(0, 80),
              imageUrl: primaryImageUrl || null,
              isAvailable: true,
              source: 'woocommerce',
              externalId,
              lastImportId: importId,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        });

        totalProcessed++;
      } catch (err: unknown) {
        totalFailed++;
        if (errors.length < MAX_ERRORS_STORED) {
          errors.push({
            item: `Produit WooCommerce #${externalId}`,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    await jobRef.update({
      processedItems: totalProcessed,
      failedItems: totalFailed,
      errors,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const totalPagesHeader = response.headers.get('x-wp-totalpages');
    const totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : 1;
    if (page >= totalPages || products.length < 100) {
      hasMore = false;
    } else {
      page++;
    }
  }

  // Deactivate missing WooCommerce items only after FULL successful sync
  let deactivatedCount = 0;
  const existingWcItemsSnap = await db
    .collection(`restaurants/${restaurantId}/menu_items`)
    .where('source', '==', 'woocommerce')
    .limit(1000)
    .get();

  const batch = db.batch();
  for (const docSnap of existingWcItemsSnap.docs) {
    const data = docSnap.data();
    if (data.externalId && !seenExternalIds.has(String(data.externalId)) && data.isAvailable !== false) {
      batch.update(docSnap.ref, {
        isAvailable: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      deactivatedCount++;
    }
  }
  if (deactivatedCount > 0) {
    await batch.commit();
  }

  await jobRef.update({
    status: 'completed',
    totalItems: seenExternalIds.size,
    processedItems: totalProcessed,
    failedItems: totalFailed,
    errors,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    totalItems: seenExternalIds.size,
    processedItems: totalProcessed,
    failedItems: totalFailed,
    deactivatedItems: deactivatedCount,
  };
}

/**
 * Cloud Function Trigger: processMenuImportWorker
 */
export const processMenuImportWorker = onDocumentCreated(
  {
    document: 'restaurants/{restaurantId}/menu_imports/{importId}',
    region: 'europe-west1',
    secrets: [encryptionMasterKey],
    retry: true,
  },
  async (event) => {
    const { restaurantId, importId } = event.params;
    if (!restaurantId || !importId) return;

    await executeMenuImportJob(restaurantId, importId);
  }
);
