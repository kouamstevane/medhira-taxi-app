import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebaseStorage } from '@/config/firebase';
import {
  getRestaurantImagePath,
  type RestaurantImageKind,
} from '@/utils/restaurant-image';

export interface UploadRestaurantImageInput {
  restaurantId: string;
  kind: RestaurantImageKind;
  blob: Blob;
  uploadId?: string;
}

export interface UploadedRestaurantImage {
  path: string;
  url: string;
}

export function createRestaurantImageUploadId(): string {
  return `up_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function isRestaurantImageObjectNotFound(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && (error as { code?: string }).code === 'storage/object-not-found',
  );
}

export function getRestaurantImageStorageErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';

  if (code === 'storage/unauthenticated') {
    return 'Votre session Firebase a expiré. Reconnectez-vous avant de modifier les visuels du restaurant.';
  }
  if (code === 'storage/unauthorized') {
    return 'Vous n’avez pas les droits pour modifier les visuels de ce restaurant.';
  }
  if (code === 'storage/canceled') {
    return 'Le chargement du visuel a été annulé.';
  }
  return 'Impossible d’enregistrer le visuel du restaurant. Vérifiez le fichier et réessayez.';
}

export async function uploadRestaurantImage(
  input: UploadRestaurantImageInput,
): Promise<UploadedRestaurantImage> {
  const uploadId = input.uploadId ?? createRestaurantImageUploadId();
  const path = getRestaurantImagePath(input.restaurantId, input.kind, uploadId);
  const storageRef = ref(getFirebaseStorage(), path);

  await uploadBytes(storageRef, input.blob, {
    contentType: 'image/webp',
    cacheControl: 'public,max-age=31536000,immutable',
  });

  return {
    path,
    url: await getDownloadURL(storageRef),
  };
}

export async function deleteRestaurantImage(path: string | null | undefined): Promise<void> {
  if (!path) return;

  try {
    await deleteObject(ref(getFirebaseStorage(), path));
  } catch (error) {
    if (isRestaurantImageObjectNotFound(error)) return;
    throw error;
  }
}
