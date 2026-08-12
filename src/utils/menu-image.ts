/**
 * Contrat d'image et utilitaires pour les articles du menu
 * @module utils/menu-image
 */

export type MenuImageState =
  | 'image-none'
  | 'image-unchanged'
  | 'external-url'
  | 'upload'
  | 'remove';

export const MENU_IMAGE_MAX_BYTES = 500 * 1024; // 512 000 octets
export const MENU_IMAGE_MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 Mo
export const MENU_IMAGE_MAX_DIMENSION = 6000; // 6000px max par côté
export const MENU_IMAGE_MAX_PIXELS = 16_000_000; // 16 Mégapixels max
export const MENU_IMAGE_MAX_OUTPUT_DIMENSION = 1200; // 1200px max pour le WebP généré

/**
 * Détecte les URLs de partage connues (Google Photos, Google Drive share links, Dropbox share, etc.)
 * qui ne sont pas des liens d'image directs.
 */
export function isKnownShareUrl(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const lower = value.toLowerCase();
  return (
    lower.includes('photos.google.com') ||
    lower.includes('share.google') ||
    lower.includes('drive.google.com/file') ||
    lower.includes('drive.google.com/open') ||
    lower.includes('dropbox.com/s/') ||
    lower.includes('dropbox.com/sh/') ||
    lower.includes('onedrive.live.com') ||
    lower.includes('icloud.com/photos')
  );
}

/**
 * Valide une URL d'image externe pour un article de menu.
 */
export function validateMenuImageUrl(value: string): { valid: boolean; error?: string } {
  if (!value || typeof value !== 'string') {
    return { valid: false, error: "L'URL est requise" };
  }

  const trimmed = value.trim();

  if (trimmed.length > 2048) {
    return { valid: false, error: "L'URL est trop longue (maximum 2048 caractères)" };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Format d URL invalide' };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { valid: false, error: 'L URL doit utiliser le protocole http ou https' };
  }

  if (isKnownShareUrl(trimmed)) {
    return {
      valid: false,
      error:
        'Les liens de partage (Google Photos, Drive, Dropbox, etc.) ne sont pas supportés. Utilisez un lien direct vers l image ou importez un fichier.',
    };
  }

  return { valid: true };
}

/**
 * Vérifie si l'URL ou le path provient de Firebase Storage.
 * Le paramètre `imageStoragePath` est le signal prioritaire.
 */
export function isFirebaseStorageImageUrl(value?: string, imageStoragePath?: string): boolean {
  if (imageStoragePath && imageStoragePath.trim() !== '') {
    return true;
  }
  if (!value || typeof value !== 'string') return false;
  const lower = value.toLowerCase();
  return (
    lower.includes('firebasestorage.googleapis.com') ||
    lower.includes(':9199') ||
    lower.includes('/v0/b/')
  );
}

/**
 * Détermine s'il faut utiliser la balise <img> native au lieu de next/image
 * (notamment pour les URLs de l'émulateur Firebase Storage local qui ne peuvent pas être optimisées par Next.js).
 */
export function shouldUseNativeImageForFirebaseUrl(value?: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const lower = value.toLowerCase();
  return (
    lower.includes('127.0.0.1:9199') ||
    lower.includes('localhost:9199') ||
    (lower.includes(':9199') && (lower.includes('127.0.0.1') || lower.includes('localhost')))
  );
}

/**
 * Valide qu'une URL d'image externe peut être effectivement chargée par le navigateur dans un délai donné.
 * Supporte le timeout et AbortSignal.
 */
export function validateExternalImageLoad(
  url: string,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const signal = options?.signal;
    if (signal?.aborted) {
      return reject(new Error('Validation d image annulée (aborted)'));
    }

    const timeoutMs = options?.timeoutMs ?? 5000;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let img: HTMLImageElement | null = null;

    const cleanup = () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (img) {
        img.onload = null;
        img.onerror = null;
        img.src = '';
        img = null;
      }
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const onAbort = () => {
      cleanup();
      reject(new Error('Validation d image annulée par le signal'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort);
    }

    timerId = setTimeout(() => {
      cleanup();
      reject(new Error('Délai dépassé lors de la validation de l image (timeout)'));
    }, timeoutMs);

    // En environnement de test Node sans HTMLImageElement global complet, fallback basique ou Image mock
    if (typeof window !== 'undefined' && typeof window.Image !== 'undefined') {
      img = new window.Image();
      img.onload = () => {
        cleanup();
        resolve();
      };
      img.onerror = () => {
        cleanup();
        reject(new Error('Impossible de charger l image depuis cette URL'));
      };
      img.src = url;
    } else {
      // Entouré de tests sans DOM ou fetch
      cleanup();
      resolve();
    }
  });
}
