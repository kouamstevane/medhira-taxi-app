import { db, functions, getFirebaseStorage } from '@/config/firebase';
import {
  FIRESTORE_COLLECTIONS,
  FIRESTORE_SUBCOLLECTIONS,
  getMenuImportStoragePath,
} from '@/types/firestore-collections';
import type { MenuImportJob, MenuImportPreview } from '@/types/food-delivery';
import { collection, doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytesResumable } from 'firebase/storage';

export interface MenuImportUploadResult {
  importId: string;
  filePath: string;
  type: 'csv' | 'excel';
}

export interface MenuImportUploadOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface MenuImportFileInput {
  restaurantId: string;
  importId: string;
  filePath: string;
  type: 'csv' | 'excel';
}

export interface StartMenuImportInput extends MenuImportFileInput {
  reviewConfirmed: true;
  includedRowNumbers: number[];
}

export const MENU_IMPORT_UPLOAD_TIMEOUT_MS = 30_000;

export interface StoreConnectionParams {
  restaurantId: string;
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

/**
 * Uploads a CSV or XLSX file to Storage with progress reporting
 */
export async function uploadMenuImportFile(
  restaurantId: string,
  file: File,
  onProgress?: (progress: number) => void,
  options: MenuImportUploadOptions = {}
): Promise<MenuImportUploadResult> {
  if (!restaurantId || !restaurantId.trim()) {
    throw new Error('Identifiant du restaurant requis pour le téléversement');
  }

  if (!file) {
    throw new Error('Aucun fichier sélectionné');
  }

  const fileName = file.name.toLowerCase();
  const isCsv = fileName.endsWith('.csv');
  const isXlsx = fileName.endsWith('.xlsx');

  if (!isCsv && !isXlsx) {
    throw new Error('Format de fichier non supporté. Veuillez sélectionner un fichier .csv ou .xlsx');
  }

  const maxSizeBytes = 15 * 1024 * 1024; // 15 MiB
  if (file.size > maxSizeBytes) {
    throw new Error('La taille du fichier dépasse la limite autorisée de 15 Mo');
  }
  if (file.size === 0) {
    throw new Error('Le fichier sélectionné est vide');
  }

  const type: 'csv' | 'excel' = isCsv ? 'csv' : 'excel';
  const extension: 'csv' | 'xlsx' = isCsv ? 'csv' : 'xlsx';

  // Generate deterministic unique doc ID
  const importId = doc(
    collection(db, FIRESTORE_COLLECTIONS.RESTAURANTS, restaurantId, FIRESTORE_SUBCOLLECTIONS.MENU_IMPORTS)
  ).id;

  const filePath = getMenuImportStoragePath(restaurantId, importId, extension);
  const storage = getFirebaseStorage();
  const storageRef = ref(storage, filePath);

  const contentType = isCsv
    ? 'text/csv'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      const error = new Error('Téléversement annulé');
      error.name = 'AbortError';
      reject(error);
      return;
    }

    let settled = false;
    const uploadTask = uploadBytesResumable(storageRef, file, { contentType });
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', handleAbort);
    };
    const rejectUpload = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const handleAbort = () => {
      if (settled) return;
      uploadTask.cancel();
      const error = new Error('Téléversement annulé');
      error.name = 'AbortError';
      rejectUpload(error);
    };

    options.signal?.addEventListener('abort', handleAbort, { once: true });
    const timeoutId = setTimeout(() => {
      uploadTask.cancel();
      rejectUpload(new Error('Le téléversement du fichier a expiré'));
    }, options.timeoutMs ?? MENU_IMPORT_UPLOAD_TIMEOUT_MS);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes > 0) {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(progress);
        }
      },
      (error: { code?: string; message: string }) => {
        if (error.code === 'storage/canceled') {
          const cancelledError = new Error('Téléversement annulé');
          cancelledError.name = 'AbortError';
          rejectUpload(cancelledError);
          return;
        }
        rejectUpload(new Error(`Échec du téléversement du fichier: ${error.message}`));
      },
      () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({
          importId,
          filePath,
          type,
        });
      }
    );
  });
}

/**
 * Calls Cloud Function to validate file in Storage and create pending import job
 */
export async function startMenuFileImport(
  input: StartMenuImportInput
): Promise<{ importId: string }> {
  const callable = httpsCallable<
    StartMenuImportInput,
    { importId: string }
  >(functions, 'startMenuFileImport');

  const response = await callable({
    restaurantId: input.restaurantId,
    importId: input.importId,
    filePath: input.filePath,
    type: input.type,
    reviewConfirmed: input.reviewConfirmed,
    includedRowNumbers: input.includedRowNumbers,
  });

  return response.data;
}

export async function previewMenuFileImport(input: MenuImportFileInput): Promise<MenuImportPreview> {
  const callable = httpsCallable<MenuImportFileInput, MenuImportPreview>(functions, 'previewMenuFileImport');
  const response = await callable(input);
  return response.data;
}

/**
 * Subscribes to real-time status and progress updates of a menu import job
 */
export function listenToImportProgress(
  restaurantId: string,
  importId: string,
  onChange: (job: MenuImportJob) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const jobDocRef = doc(
    db,
    FIRESTORE_COLLECTIONS.RESTAURANTS,
    restaurantId,
    FIRESTORE_SUBCOLLECTIONS.MENU_IMPORTS,
    importId
  );

  return onSnapshot(
    jobDocRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        onChange({
          id: docSnap.id,
          restaurantId,
          type: data.type,
          status: data.status,
          filePath: data.filePath,
          integrationId: data.integrationId,
          totalItems: data.totalItems || 0,
          processedItems: data.processedItems || 0,
          failedItems: data.failedItems || 0,
          errors: data.errors || [],
          attemptCount: data.attemptCount,
          leaseExpiresAt: data.leaseExpiresAt,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          completedAt: data.completedAt,
        });
      }
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        console.error('[listenToImportProgress] Snapshot error:', error);
      }
    }
  );
}

/**
 * Downloads a sample CSV template with UTF-8 BOM and correct headers
 */
export function downloadSampleCsvTemplate(): void {
  const headers = 'externalId,name,description,price,category,preparationTime,isAvailable\n';
  const sample1 =
    'SKU-001,Burger Classic,"Steak haché du boucher, sauce maison, cheddar affiné",12.50,Plats,15,true\n';
  const sample2 =
    'SKU-002,Tiramisu Traditionnel,"Dessert italien artisanal au mascarpone et café",6.00,Desserts,5,true\n';
  const sample3 =
    'SKU-003,Limonade Maison,"Citron pressé frais, menthe et eau pétillante",4.50,Boissons,5,true\n';

  const csvContent = '\uFEFF' + headers + sample1 + sample2 + sample3;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'modele-import-menu.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Tests connectivity with WooCommerce remote store
 */
export async function testStoreConnection(
  params: StoreConnectionParams
): Promise<{ success: boolean; message: string }> {
  const callable = httpsCallable<StoreConnectionParams, { success: boolean; message: string }>(
    functions,
    'testStoreConnection'
  );
  const response = await callable(params);
  return response.data;
}

/**
 * Saves and encrypts WooCommerce integration settings on the server
 */
export async function saveStoreIntegration(
  params: StoreConnectionParams
): Promise<{ success: boolean; message: string }> {
  const callable = httpsCallable<StoreConnectionParams, { success: boolean; message: string }>(
    functions,
    'saveStoreIntegration'
  );
  const response = await callable(params);
  return response.data;
}

/**
 * Triggers a catalog sync job for a saved store integration
 */
export async function startRestaurantStoreSync(params: {
  restaurantId: string;
  integrationId: 'woocommerce';
}): Promise<{ importId: string }> {
  const callable = httpsCallable<
    { restaurantId: string; integrationId: 'woocommerce' },
    { importId: string }
  >(functions, 'startRestaurantStoreSync');
  const response = await callable(params);
  return response.data;
}
