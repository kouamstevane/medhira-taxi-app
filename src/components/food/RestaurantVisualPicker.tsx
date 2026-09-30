'use client';

import { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';
import {
  validateRestaurantImageFile,
  type RestaurantImageKind,
} from '@/utils/restaurant-image';

interface RestaurantVisualPickerProps {
  kind: RestaurantImageKind;
  currentUrl?: string | null;
  onChange: (file: File | null, action: 'replace' | 'remove') => void;
  disabled?: boolean;
}

export function RestaurantVisualPicker({
  kind,
  currentUrl,
  onChange,
  disabled = false,
}: RestaurantVisualPickerProps) {
  const { t } = useTranslation('restaurant');
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl ?? null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const label = kind === 'logo'
    ? {
        title: t('logoTitle'),
        hint: t('logoHint'),
        empty: t('logoEmpty'),
        aria: t('chooseLogoAria'),
      }
    : {
        title: t('coverTitle'),
        hint: t('coverHint'),
        empty: t('coverEmpty'),
        aria: t('chooseCoverAria'),
      };

  useEffect(() => () => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
  }, [localPreviewUrl]);

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    const validationError = validateRestaurantImageFile(file, kind);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    const nextPreviewUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(nextPreviewUrl);
    setPreviewUrl(nextPreviewUrl);
    setError(null);
    onChange(file, 'replace');
  };

  const handleRemove = () => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    setPreviewUrl(null);
    setError(null);
    onChange(null, 'remove');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-300">{label.title}</p>
          <p className="text-xs text-gray-400">{label.hint}</p>
        </div>
        {previewUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="text-xs text-gray-400 hover:text-white disabled:opacity-50"
          >
            {t('delete')}
          </button>
        )}
      </div>

      <label
        className={`group relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/10 bg-white/[0.02] transition-all duration-200 hover:border-primary/50 hover:bg-white/[0.04] ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        {previewUrl ? (
          <div className="relative h-full w-full">
            <img
              src={previewUrl}
              alt={label.title}
              className={`h-full w-full ${kind === 'logo' ? 'object-contain p-6' : 'object-cover'}`}
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="flex items-center gap-1.5 bg-black/80 text-white text-xs px-3 py-1.5 rounded-full border border-white/20 shadow-md">
                <MaterialIcon name="edit" size="sm" />
                {t('clickToReplaceImage')}
              </span>
            </div>
          </div>
        ) : (
          <span className="flex flex-col items-center gap-2 text-gray-400 group-hover:text-gray-200 transition-colors px-3 text-center">
            <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-primary group-hover:scale-105 group-hover:border-primary/40 transition-all duration-200 shadow-sm">
              <MaterialIcon name="photo_camera" size="sm" />
            </div>
            <span className="text-xs font-medium text-gray-300">{label.empty}</span>
          </span>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => handleFileChange(event.target.files?.[0])}
          aria-label={label.aria}
        />
      </label>

      {previewUrl && (
        <p className="text-xs text-gray-400">{t('clickToReplaceImage')}</p>
      )}
      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
    </div>
  );
}
