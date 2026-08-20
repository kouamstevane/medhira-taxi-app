'use client';

import { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
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

const labels: Record<RestaurantImageKind, { title: string; hint: string; empty: string }> = {
  logo: {
    title: 'Logo du restaurant',
    hint: 'Carré, JPEG, PNG ou WebP, 2 Mo maximum',
    empty: 'Ajoutez votre logo',
  },
  cover: {
    title: 'Photo de couverture',
    hint: 'Format horizontal, JPEG, PNG ou WebP, 2 Mo maximum',
    empty: 'Ajoutez une photo de couverture',
  },
};

export function RestaurantVisualPicker({
  kind,
  currentUrl,
  onChange,
  disabled = false,
}: RestaurantVisualPickerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl ?? null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = labels[kind];

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
          <p className="text-sm font-semibold text-white">{label.title}</p>
          <p className="text-xs text-gray-400">{label.hint}</p>
        </div>
        {previewUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="text-xs text-gray-400 hover:text-white disabled:opacity-50"
          >
            Supprimer
          </button>
        )}
      </div>

      <label
        className={`relative flex cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/20 bg-white/[0.04] transition hover:border-primary/70 ${
          kind === 'logo' ? 'aspect-square max-w-[220px]' : 'aspect-video'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={label.title} className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-gray-400">
            <MaterialIcon name="add_photo_alternate" size="xl" />
            <span className="text-sm">{label.empty}</span>
          </span>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => handleFileChange(event.target.files?.[0])}
          aria-label={`Choisir ${kind === 'logo' ? 'le logo' : 'la photo de couverture'}`}
        />
      </label>

      {previewUrl && (
        <p className="text-xs text-gray-400">Cliquez sur l’image pour la remplacer.</p>
      )}
      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
    </div>
  );
}
