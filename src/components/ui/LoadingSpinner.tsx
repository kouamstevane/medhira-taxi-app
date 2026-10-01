/**
 * Composant LoadingSpinner
 * 
 * Indicateur de chargement réutilisable avec différentes tailles.
 * 
 * @component
 */

'use client';

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  fullScreen?: boolean;
  label?: string;
}

/**
 * Spinner de chargement animé
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = '#f29200',
  fullScreen = false,
  label,
}) => {
  const { t } = useTranslation();
  const loadingText = label || t('common.loading');
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  };

  const spinner = (
    <div
      className={`animate-spin rounded-full border-t-2 border-b-2 ${sizeClasses[size]}`}
      style={{ borderColor: color }}
      role="status"
      aria-label={loadingText}
    >
      <span className="sr-only">{loadingText}</span>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#e6e6e6]">
        {spinner}
      </div>
    );
  }

  return spinner;
};
