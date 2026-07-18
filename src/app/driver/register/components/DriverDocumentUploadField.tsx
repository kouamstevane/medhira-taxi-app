'use client';

import React from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  driverUploadEmptyClassName,
  driverUploadLoadedClassName,
} from './driverOnboardingStyles';

interface DriverDocumentUploadFieldProps {
  label: string;
  inputId: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  accept?: string;
  required?: boolean;
  optionalLabel?: string;
  file?: File | null;
  loading?: boolean;
  helperText?: string;
  emptyHint?: string;
  emptyStateClassName?: string;
  onRemove?: () => void;
}

export function DriverDocumentUploadField({
  label,
  inputId,
  onChange,
  accept = 'image/*,application/pdf',
  required = true,
  optionalLabel,
  file,
  loading = false,
  helperText,
  emptyHint = 'Image ou PDF (Max 10Mo)',
  emptyStateClassName,
  onRemove,
}: DriverDocumentUploadFieldProps) {
  return (
    <div className="border border-white/[0.06] rounded-xl p-4 bg-[#1A1A1A]">
      <label htmlFor={inputId} className="block text-sm font-medium text-[#9CA3AF] mb-2">
        {label}{' '}
        {required ? (
          <span className="text-red-500">*</span>
        ) : (
          <span className="text-[#4B5563] text-xs">{optionalLabel ?? '(facultatif)'}</span>
        )}
      </label>

      {file ? (
        <div className={driverUploadLoadedClassName}>
          <span className="text-sm font-medium truncate max-w-[180px] text-slate-300">
            {file.name}
          </span>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="text-red-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              Supprimer
            </button>
          ) : null}
        </div>
      ) : (
        <div
          data-testid={`${inputId}-empty-state`}
          className={cn(driverUploadEmptyClassName, 'w-full h-24 md:h-36', emptyStateClassName)}
        >
          <input
            type="file"
            id={inputId}
            accept={accept}
            onChange={onChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          {loading ? (
            <Loader2 className="animate-spin text-[#f29200] w-8 h-8 mb-2" />
          ) : (
            <UploadCloud className="text-slate-500 w-8 h-8 mb-2" />
          )}
          <span className="text-sm font-medium text-[#9CA3AF]">Cliquez pour ajouter</span>
          <span className="text-xs text-[#4B5563] mt-1">{emptyHint}</span>
        </div>
      )}

      {helperText ? (
        <p className="text-xs text-[#9CA3AF] mt-2">{helperText}</p>
      ) : null}
    </div>
  );
}
