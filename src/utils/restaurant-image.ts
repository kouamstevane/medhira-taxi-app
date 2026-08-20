export type RestaurantImageKind = 'logo' | 'cover';

export interface RestaurantImageSelection {
  logo: File | null;
  cover: File | null;
}

const MAX_RESTAURANT_IMAGE_BYTES = 2 * 1024 * 1024;
const MANAGED_IMAGE_URL_HOST = 'firebasestorage.googleapis.com';

const getImageLabel = (kind: RestaurantImageKind): string => (
  kind === 'logo' ? 'logo' : 'photo de couverture'
);

export function validateRestaurantImageFile(
  file: Pick<File, 'type' | 'size'>,
  kind: RestaurantImageKind,
): string | null {
  if (!file.type.startsWith('image/')) {
    return `Le format du ${getImageLabel(kind)} doit être une image JPEG, PNG ou WebP.`;
  }

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return `Le format du ${getImageLabel(kind)} doit être JPEG, PNG ou WebP.`;
  }

  if (file.size > MAX_RESTAURANT_IMAGE_BYTES) {
    return `Le ${getImageLabel(kind)} ne doit pas dépasser 2 Mo.`;
  }

  return null;
}

export function getRestaurantImagePath(
  restaurantId: string,
  kind: RestaurantImageKind,
  uploadId: string,
): string {
  return `restaurant-images/${restaurantId}/${kind}-${uploadId}.webp`;
}

export function getRestaurantImagePathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== MANAGED_IMAGE_URL_HOST) return null;

    const match = /^\/v0\/b\/[^/]+\/o\/(.+)$/.exec(parsed.pathname);
    if (!match) return null;

    const storagePath = decodeURIComponent(match[1]);
    if (!/^restaurant-images\/[^/]+\/(logo|cover)-[a-zA-Z0-9_-]+\.webp$/.test(storagePath)) {
      return null;
    }

    return storagePath;
  } catch {
    return null;
  }
}

export async function prepareRestaurantImage(
  file: File,
  kind: RestaurantImageKind,
): Promise<Blob> {
  const validationError = validateRestaurantImageFile(file, kind);
  if (validationError) throw new Error(validationError);

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Impossible de lire le ${getImageLabel(kind)}.`));
      element.src = objectUrl;
    });

    const aspectRatio = kind === 'logo' ? 1 : 16 / 9;
    const sourceAspectRatio = image.width / image.height;
    let sourceWidth = image.width;
    let sourceHeight = image.height;
    let sourceX = 0;
    let sourceY = 0;

    if (sourceAspectRatio > aspectRatio) {
      sourceWidth = image.height * aspectRatio;
      sourceX = (image.width - sourceWidth) / 2;
    } else if (sourceAspectRatio < aspectRatio) {
      sourceHeight = image.width / aspectRatio;
      sourceY = (image.height - sourceHeight) / 2;
    }

    const outputWidth = kind === 'logo' ? 1024 : 1600;
    const outputHeight = Math.round(outputWidth / aspectRatio);
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Impossible de préparer le visuel.');

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      outputWidth,
      outputHeight,
    );

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.84);
    });

    if (!blob) throw new Error('Impossible de convertir le visuel en WebP.');
    if (blob.size > MAX_RESTAURANT_IMAGE_BYTES) {
      throw new Error(`Le ${getImageLabel(kind)} converti ne doit pas dépasser 2 Mo.`);
    }

    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
