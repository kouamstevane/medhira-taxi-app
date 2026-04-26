'use client';

import { cn } from '@/lib/utils';

interface MaterialIconProps {
  readonly name: string;
  readonly className?: string;
  readonly filled?: boolean;
  readonly size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = {
  sm: 'text-[16px]',
  md: 'text-[20px]',
  lg: 'text-[24px]',
  xl: 'text-[32px]',
} as const;

export function MaterialIcon({ name, className, filled = false, size = 'lg' }: MaterialIconProps) {
  return (
    <span
      className={cn('material-symbols-outlined select-none', sizeMap[size], className)}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {name}
    </span>
  );
}
