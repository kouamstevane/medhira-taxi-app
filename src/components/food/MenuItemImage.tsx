'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  isFirebaseStorageImageUrl,
  shouldUseNativeImageForFirebaseUrl,
} from '@/utils/menu-image';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

export interface MenuItemImageProps {
  src?: string | null;
  imageStoragePath?: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

export function MenuItemImage({
  src,
  imageStoragePath,
  alt,
  className = '',
  sizes,
  width,
  height,
  fill = true,
  priority = false,
  onLoad,
  onError,
}: MenuItemImageProps) {
  const [hasError, setHasError] = useState(false);

  // Réinitialiser l'état d'erreur si la source de l'image change
  useEffect(() => {
    setHasError(false);
  }, [src, imageStoragePath]);

  const handleError = () => {
    setHasError(true);
    if (onError) onError();
  };

  if (!src || hasError) {
    return (
      <div
        data-testid="menu-item-image-placeholder"
        className={`flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 rounded-lg overflow-hidden ${
          fill ? 'w-full h-full absolute inset-0' : ''
        } ${className}`}
      >
        <MaterialIcon name="restaurant" className="text-2xl sm:text-3xl opacity-60" />
      </div>
    );
  }

  const isFirebase = isFirebaseStorageImageUrl(src, imageStoragePath);
  const useNativeForEmulator = isFirebase && shouldUseNativeImageForFirebaseUrl(src);

  if (isFirebase && !useNativeForEmulator) {
    return (
      <Image
        src={src}
        alt={alt}
        className={className}
        sizes={sizes ?? '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'}
        width={!fill ? (width ?? 300) : undefined}
        height={!fill ? (height ?? 200) : undefined}
        fill={fill}
        priority={priority}
        onError={handleError}
        onLoad={onLoad}
      />
    );
  }

  // URLs externes ou URLs locales de l'émulateur Firebase : rendu <img> natif
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`${fill ? 'w-full h-full object-cover' : ''} ${className}`}
      loading="lazy"
      decoding="async"
      onError={handleError}
      onLoad={onLoad}
    />
  );
}

export default MenuItemImage;
