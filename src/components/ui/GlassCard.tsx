'use client';

import { cn } from '@/lib/utils';

interface GlassCardProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly variant?: 'default' | 'elevated' | 'bordered';
  readonly onClick?: () => void;
}

export function GlassCard({ children, className, variant = 'default', onClick }: GlassCardProps) {
  const variants = {
    default: 'glass-card rounded-xl',
    elevated: 'glass-card rounded-2xl shadow-xl shadow-black/20',
    bordered: 'glass-card rounded-2xl border-l-4 border-l-primary shadow-lg shadow-primary/5',
  } as const;

  return (
    <div
      className={cn(variants[variant], className)}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}
