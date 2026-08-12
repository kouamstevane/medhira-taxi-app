/**
 * Service de compression d'images asynchrone
 * Utilise l'API Canvas avec requestIdleCallback et support de WebP, limite 500 Ko, timeout et AbortSignal.
 * 
 * @module ImageCompressionService
 */

import {
  MENU_IMAGE_MAX_BYTES,
  MENU_IMAGE_MAX_INPUT_BYTES,
  MENU_IMAGE_MAX_DIMENSION,
  MENU_IMAGE_MAX_PIXELS,
  MENU_IMAGE_MAX_OUTPUT_DIMENSION,
} from '../utils/menu-image';

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 - 1.0
  outputFormat?: 'image/webp' | 'image/jpeg' | 'image/png';
  maxOutputBytes?: number; // Défaut: 500 * 1024 (512_000)
  qualityAttempts?: number; // Max 3
  timeoutMs?: number; // Défaut: 10000ms
  signal?: AbortSignal;
}

interface WindowWithIdleCallback extends Window {
  requestIdleCallback(callback: IdleRequestCallback, options?: IdleRequestOptions): number;
  cancelIdleCallback(id: number): void;
}

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

/**
 * Service de compression d'images
 */
class ImageCompressionService {
  private readonly DEFAULT_OPTIONS: Required<Omit<CompressionOptions, 'signal'>> = {
    maxWidth: MENU_IMAGE_MAX_OUTPUT_DIMENSION,
    maxHeight: MENU_IMAGE_MAX_OUTPUT_DIMENSION,
    quality: 0.85,
    outputFormat: 'image/webp',
    maxOutputBytes: MENU_IMAGE_MAX_BYTES,
    qualityAttempts: 3,
    timeoutMs: 10000,
  };

  /**
   * Compresse une image de manière asynchrone sans bloquer le thread principal.
   * Valide l'entrée (10 Mo, 6000px, 16 MP), effectue jusqu'à 3 essais de qualité WebP
   * et échoue au-dessus de maxOutputBytes (500 Ko) sans fallback original.
   */
  async compressImage(
    file: File,
    options: CompressionOptions = {}
  ): Promise<CompressionResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const maxOutputBytes = opts.maxOutputBytes;
    const maxAttempts = Math.min(Math.max(opts.qualityAttempts, 1), 3);
    const originalSize = file.size;

    return new Promise((resolve, reject) => {
      // 1. Vérification du signal AbortSignal avant tout traitement
      if (opts.signal?.aborted) {
        return reject(new Error('Compression d image annulée (aborted)'));
      }

      // 2. Validation du type MIME
      if (!file.type.startsWith('image/')) {
        return reject(new Error("Le fichier n'est pas une image"));
      }

      // 3. Validation de la taille du fichier d'entrée (10 Mo max)
      if (file.size > MENU_IMAGE_MAX_INPUT_BYTES) {
        return reject(
          new Error("Le fichier dépasse la taille maximale autorisée de 10 Mo")
        );
      }

      let timerId: ReturnType<typeof setTimeout> | null = null;
      let objectUrl: string | null = null;
      let isSettled = false;

      const cleanup = () => {
        if (timerId) {
          clearTimeout(timerId);
          timerId = null;
        }
        if (objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {
            // Ignorer si déjà révoqué
          }
          objectUrl = null;
        }
        if (opts.signal) {
          opts.signal.removeEventListener('abort', onAbort);
        }
      };

      const safeReject = (err: Error) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        reject(err);
      };

      const safeResolve = (result: CompressionResult) => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        resolve(result);
      };

      const onAbort = () => {
        safeReject(new Error('Compression d image annulée (aborted)'));
      };

      if (opts.signal) {
        opts.signal.addEventListener('abort', onAbort);
      }

      // Timeout de sécurité global
      timerId = setTimeout(() => {
        safeReject(new Error('Timeout lors de la compression de l image'));
      }, opts.timeoutMs);

      const img = new Image();
      try {
        objectUrl = URL.createObjectURL(file);
      } catch (err) {
        return safeReject(err instanceof Error ? err : new Error('Erreur création ObjectURL'));
      }

      img.onload = () => {
        if (isSettled) return;

        // 4. Validation des dimensions avant Canvas (6000px max et 16 Mégapixels max)
        if (img.width > MENU_IMAGE_MAX_DIMENSION || img.height > MENU_IMAGE_MAX_DIMENSION) {
          return safeReject(
            new Error(`Dimension de l'image trop grande (${img.width}x${img.height}px, maximum ${MENU_IMAGE_MAX_DIMENSION}px par côté)`)
          );
        }

        if (img.width * img.height > MENU_IMAGE_MAX_PIXELS) {
          return safeReject(
            new Error(`Résolution de l'image trop élevée (${(img.width * img.height / 1_000_000).toFixed(1)} MP, maximum 16 mégapixels)`)
          );
        }

        // Calcul des nouvelles dimensions (max 1200px)
        const { width, height } = this.calculateDimensions(
          img.width,
          img.height,
          opts.maxWidth,
          opts.maxHeight
        );

        const executeCompression = () => {
          if (isSettled) return;

          try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              return safeReject(new Error('Impossible de créer le contexte Canvas'));
            }

            ctx.drawImage(img, 0, 0, width, height);

            // Qualités dégressives sur 3 essais max (ex: [0.85, 0.65, 0.45])
            const baseQuality = opts.quality;
            const qualities = [
              baseQuality,
              Math.max(0.4, baseQuality * 0.75),
              Math.max(0.2, baseQuality * 0.5),
            ].slice(0, maxAttempts);

            let attemptIndex = 0;

            const tryNextQuality = () => {
              if (isSettled) return;

              if (attemptIndex >= qualities.length) {
                return safeReject(
                  new Error(
                    `Taille de l'image compressée supérieure à la limite de ${Math.round(maxOutputBytes / 1024)} Ko après ${qualities.length} essais`
                  )
                );
              }

              const currentQuality = qualities[attemptIndex];
              attemptIndex++;

              canvas.toBlob(
                (blob) => {
                  if (isSettled) return;

                  if (!blob) {
                    return safeReject(new Error('Échec de la génération du Blob image'));
                  }

                  if (blob.size <= maxOutputBytes) {
                    const compressedFile = new File(
                      [blob],
                      this.generateFileName(file.name, opts.outputFormat),
                      {
                        type: opts.outputFormat,
                        lastModified: Date.now(),
                      }
                    );

                    return safeResolve({
                      file: compressedFile,
                      originalSize,
                      compressedSize: compressedFile.size,
                      compressionRatio: (1 - compressedFile.size / originalSize) * 100,
                    });
                  } else {
                    // Blob trop grand -> essayer la qualité suivante
                    tryNextQuality();
                  }
                },
                opts.outputFormat,
                currentQuality
              );
            };

            tryNextQuality();
          } catch (error) {
            safeReject(error instanceof Error ? error : new Error(String(error)));
          }
        };

        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          (window as unknown as WindowWithIdleCallback).requestIdleCallback(
            () => executeCompression(),
            { timeout: 2000 }
          );
        } else {
          setTimeout(executeCompression, 0);
        }
      };

      img.onerror = () => {
        safeReject(new Error("Impossible de charger l'image pour la compression"));
      };

      img.src = objectUrl;
    });
  }

  /**
   * Calcule les nouvelles dimensions en conservant le ratio d'aspect
   */
  private calculateDimensions(
    width: number,
    height: number,
    maxWidth: number,
    maxHeight: number
  ): { width: number; height: number } {
    let newWidth = width;
    let newHeight = height;

    if (width > height) {
      if (width > maxWidth) {
        newHeight = (height * maxWidth) / width;
        newWidth = maxWidth;
      }
    } else {
      if (height > maxHeight) {
        newWidth = (width * maxHeight) / height;
        newHeight = maxHeight;
      }
    }

    return { width: Math.round(newWidth), height: Math.round(newHeight) };
  }

  /**
   * Génère un nouveau nom de fichier avec l'extension appropriée
   */
  private generateFileName(originalName: string, format: string): string {
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
    const ext = format.split('/')[1];
    return `${nameWithoutExt}_compressed.${ext}`;
  }

  /**
   * Compresse plusieurs images en parallèle avec une limite de concurrence
   */
  async compressMultiple(
    files: File[],
    options: CompressionOptions = {},
    concurrency: number = 3
  ): Promise<CompressionResult[]> {
    const results: CompressionResult[] = [];
    const queue = [...files];

    const processNext = async (): Promise<void> => {
      if (queue.length === 0) return;
      
      const file = queue.shift()!;
      const result = await this.compressImage(file, options);
      results.push(result);

      if (queue.length > 0) {
        await processNext();
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => processNext());
    await Promise.all(workers);

    return results;
  }

  /**
   * Vérifie si un fichier peut être compressé
   */
  canCompress(file: File): boolean {
    return file.type.startsWith('image/');
  }

  /**
   * Estime la taille après compression (approximation)
   */
  estimateCompressedSize(file: File, quality: number = 0.85): number {
    return Math.round(file.size * quality * 0.8);
  }
}

export const imageCompressionService = new ImageCompressionService();
export default ImageCompressionService;
