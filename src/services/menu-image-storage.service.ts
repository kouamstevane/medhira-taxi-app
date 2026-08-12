/**
 * Service de stockage Firebase Storage pour les images des articles du menu.
 * Supporte le chargement resumable (uploadBytesResumable), progression, pause, reprise,
 * annulation et suppression tolérante (object-not-found).
 * 
 * @module MenuImageStorageService
 */

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTask,
} from 'firebase/storage';
import { getFirebaseStorage } from '../config/firebase';

export interface UploadMenuImageInput {
  restaurantId: string;
  itemId: string;
  file: File;
  uploadId?: string;
  onProgress?: (progress: number) => void;
}

export interface UploadMenuTask {
  uploadId: string;
  path: string;
  task: UploadTask;
  getDownloadURL: () => Promise<string>;
  pause: () => boolean;
  resume: () => boolean;
  cancel: () => boolean;
}

/**
 * Génère un identifiant unique pour un nouvel article de menu.
 */
export function createMenuItemId(restaurantId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `item_${timestamp}_${random}`;
}

/**
 * Génère le chemin de stockage Firebase Storage selon la convention :
 * menu-images/{restaurantId}/{itemId}/{uploadId}.webp
 */
export function createMenuImagePath(
  restaurantId: string,
  itemId: string,
  uploadId: string
): string {
  return `menu-images/${restaurantId}/${itemId}/${uploadId}.webp`;
}

/**
 * Détermine si une erreur Firebase Storage correspond à un objet non trouvé.
 */
export function isStorageObjectNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === 'storage/object-not-found';
}

/**
 * Démarre un upload resumable d'image de menu dans Firebase Storage.
 */
export function uploadMenuImage(input: UploadMenuImageInput): UploadMenuTask {
  const uploadId = input.uploadId || `up_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const path = createMenuImagePath(input.restaurantId, input.itemId, uploadId);
  const storage = getFirebaseStorage();
  const storageRef = ref(storage, path);

  const metadata = {
    contentType: 'image/webp',
    cacheControl: 'public,max-age=31536000,immutable',
  };

  const task = uploadBytesResumable(storageRef, input.file, metadata);

  if (input.onProgress) {
    task.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0) {
          const progress = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          input.onProgress?.(progress);
        }
      },
      (error) => {
        // Log Error in upload task listener
        console.error('[MenuImageStorage] Upload task error:', {
          path,
          error,
        });
      }
    );
  }

  return {
    uploadId,
    path,
    task,
    getDownloadURL: async () => {
      return getDownloadURL(storageRef);
    },
    pause: () => task.pause(),
    resume: () => task.resume(),
    cancel: () => task.cancel(),
  };
}

/**
 * Récupère l'URL de téléchargement publique pour une image de menu.
 */
export function getMenuImageDownloadUrl(path: string): Promise<string> {
  const storage = getFirebaseStorage();
  const storageRef = ref(storage, path);
  return getDownloadURL(storageRef);
}

/**
 * Supprime une image de menu de Firebase Storage.
 * Tolère l'absence du fichier (storage/object-not-found).
 */
export async function deleteMenuImage(path: string): Promise<void> {
  if (!path || typeof path !== 'string') return;
  const storage = getFirebaseStorage();
  const storageRef = ref(storage, path);

  try {
    await deleteObject(storageRef);
  } catch (error) {
    if (isStorageObjectNotFound(error)) {
      // Tolérer la suppression d'un objet inexistant
      return;
    }
    // Analyser le chemin pour journaliser les détails
    const parts = path.split('/');
    const restaurantId = parts[1] || 'unknown';
    const itemId = parts[2] || 'unknown';
    const uploadIdWithExt = parts[3] || 'unknown';
    const uploadId = uploadIdWithExt.replace(/\.[^/.]+$/, '');

    console.error('[MenuImageStorage] Error deleting menu image:', {
      restaurantId,
      itemId,
      uploadId,
      imageStoragePath: path,
      error,
    });
  }
}
