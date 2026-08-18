import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import type { MenuImportImageAsset } from './menuImportAssets.js';

export interface MenuImportImageUpload {
  url: string;
  storagePath: string;
}

function getContentType(extension: MenuImportImageAsset['extension']): string {
  if (extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'gif') return 'image/gif';
  return 'image/webp';
}

export async function uploadMenuItemImage(
  restaurantId: string,
  itemId: string,
  asset: MenuImportImageAsset,
): Promise<MenuImportImageUpload> {
  const bucket = admin.storage().bucket();
  const storagePath = `menu-images/${restaurantId}/${itemId}/import.${asset.extension}`;
  const token = crypto.randomUUID();
  const file = bucket.file(storagePath);

  await file.save(asset.buffer, {
    resumable: false,
    metadata: {
      contentType: getContentType(asset.extension),
      cacheControl: 'public,max-age=31536000,immutable',
      metadata: {
        firebaseStorageDownloadTokens: token,
        originalName: asset.originalName,
      },
    },
  });

  return {
    url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`,
    storagePath,
  };
}
