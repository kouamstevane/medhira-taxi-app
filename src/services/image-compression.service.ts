/**
 * Service de compression d'images asynchrone
 * Utilise l'API Canvas avec requestIdleCallback pour éviter de bloquer l'UI
 * 
 * @module ImageCompressionService
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 - 1.0
  outputFormat?: 'image/webp' | 'image/jpeg' | 'image/png';
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
  private readonly DEFAULT_OPTIONS: Required<CompressionOptions> = {
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 0.7,
    outputFormat: 'image/webp',
  };

  /**
   * Compresse une image de manière asynchrone sans bloquer le thread principal
   * Utilise requestIdleCallback pour exécuter la compression pendant les temps d'inactivité du navigateur
   * 
   * @param file - Le fichier image à compresser
   * @param options - Options de compression
   * @returns Promise<CompressionResult> - Le fichier compressé avec les statistiques
   */
  async compressImage(
    file: File,
    options: CompressionOptions = {}
  ): Promise<CompressionResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const originalSize = file.size;

    return new Promise((resolve, reject) => {
      // Vérifier que le fichier est une image
      if (!file.type.startsWith('image/')) {
        reject(new Error('Le fichier n\'est pas une image'));
        return;
      }

      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        // Calculer les nouvelles dimensions
        const { width, height } = this.calculateDimensions(
          img.width,
          img.height,
          opts.maxWidth,
          opts.maxHeight
        );

        // Utiliser requestIdleCallback pour éviter de bloquer l'UI
        const compress = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              reject(new Error('Impossible de créer le contexte Canvas'));
              return;
            }

            // Dessiner l'image redimensionnée
            ctx.drawImage(img, 0, 0, width, height);

            // Convertir en blob avec compression
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Échec de la compression'));
                  return;
                }

                const compressedFile = new File(
                  [blob],
                  this.generateFileName(file.name, opts.outputFormat),
                  {
                    type: opts.outputFormat,
                    lastModified: Date.now(),
                  }
                );

                resolve({
                  file: compressedFile,
                  originalSize,
                  compressedSize: compressedFile.size,
                  compressionRatio: ((1 - compressedFile.size / originalSize) * 100),
                });
              },
              opts.outputFormat,
              opts.quality
            );
          } catch (error) {
            reject(error);
          }
        };

        // Utiliser requestIdleCallback si disponible, sinon setTimeout
        // Ajouter un timeout de sécurité au cas où le callback n'est jamais appelé
        let timeoutId: NodeJS.Timeout;
        let callbackCalled = false;

        const safeCompress = () => {
          if (callbackCalled) return; // Éviter les appels multiples
          callbackCalled = true;
          clearTimeout(timeoutId);
          compress();
        };

        // Timeout de sécurité de 5 secondes
        timeoutId = setTimeout(() => {
          if (!callbackCalled) {
            callbackCalled = true;
            reject(new Error('Timeout lors de la compression de l\'image'));
          }
        }, 5000);

        if ('requestIdleCallback' in window) {
          (window as unknown as WindowWithIdleCallback).requestIdleCallback(safeCompress, { timeout: 2000 });
        } else {
          setTimeout(safeCompress, 0);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Impossible de charger l\'image'));
      };

      img.src = url;
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
   * 
   * @param files - Les fichiers à compresser
   * @param options - Options de compression
   * @param concurrency - Nombre maximum de compressions simultanées (défaut: 3)
   * @returns Promise<CompressionResult[]>
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

      // Continuer avec le fichier suivant
      if (queue.length > 0) {
        await processNext();
      }
    };

    // Lancer plusieurs workers en parallèle
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
  estimateCompressedSize(file: File, quality: number = 0.7): number {
    // Estimation très approximative basée sur la qualité
    return Math.round(file.size * quality * 0.8);
  }
}

// Exporter une instance singleton
export const imageCompressionService = new ImageCompressionService();

// Exporter le type pour TypeScript
export default ImageCompressionService;
