'use client';

import React from 'react';
import Link from 'next/link';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

export type IconColorVariant =
  | 'sky'
  | 'purple'
  | 'amber'
  | 'pink'
  | 'emerald'
  | 'slate'
  | 'destructive';

interface ProfileMenuItemProps {
  readonly icon: string;
  readonly iconColorVariant?: IconColorVariant;
  readonly title: string;
  readonly subtitle?: string;
  readonly badge?: string;
  readonly onClick?: () => void;
  readonly href?: string;
  readonly isExternal?: boolean;
  readonly destructive?: boolean;
}

const variantStyles: Record<IconColorVariant, { bg: string; text: string }> = {
  sky: {
    bg: 'bg-sky-500/15 border-sky-500/25',
    text: 'text-sky-400',
  },
  purple: {
    bg: 'bg-purple-500/15 border-purple-500/25',
    text: 'text-purple-300',
  },
  amber: {
    bg: 'bg-amber-500/15 border-amber-500/25',
    text: 'text-amber-400',
  },
  pink: {
    bg: 'bg-pink-500/15 border-pink-500/25',
    text: 'text-pink-400',
  },
  emerald: {
    bg: 'bg-emerald-500/15 border-emerald-500/25',
    text: 'text-emerald-400',
  },
  slate: {
    bg: 'bg-white/10 border-white/10',
    text: 'text-slate-300',
  },
  destructive: {
    bg: 'bg-red-500/15 border-red-500/25',
    text: 'text-red-400',
  },
};

export function ProfileMenuItem({
  icon,
  iconColorVariant = 'sky',
  title,
  subtitle,
  badge,
  onClick,
  href,
  isExternal = false,
  destructive = false,
}: ProfileMenuItemProps) {
  const variant = variantStyles[iconColorVariant] ?? variantStyles.sky;

  const content = (
    <div className="flex items-center gap-3.5 w-full py-2 px-1">
      {/* Icon with tinted rounded container */}
      <div
        className={`w-10 h-10 rounded-2xl flex items-center justify-center border shrink-0 ${variant.bg} ${variant.text}`}
      >
        <MaterialIcon name={icon} className="text-[20px]" />
      </div>

      {/* Title & subtitle */}
      <div className="flex-1 min-w-0 text-left">
        <p
          className={`text-[15px] font-medium leading-snug truncate ${
            destructive ? 'text-red-400' : 'text-slate-100'
          }`}
        >
          {title}
        </p>
        {subtitle && (
          <p className="text-xs text-slate-400 truncate mt-0.5 leading-tight">
            {subtitle}
          </p>
        )}
      </div>

      {/* Optional badge */}
      {badge && (
        <span className="shrink-0 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide rounded-full bg-white/10 text-white/90 border border-white/10">
          {badge}
        </span>
      )}

      {/* Right chevron */}
      <MaterialIcon
        name="chevron_right"
        className="text-slate-500 text-[20px] shrink-0"
      />
    </div>
  );

  const baseClasses =
    'flex items-center w-full min-h-[52px] rounded-2xl px-2 transition-all active:bg-white/[0.04] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

  if (href) {
    if (isExternal) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={baseClasses}
        >
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={baseClasses}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={baseClasses}
    >
      {content}
    </button>
  );
}
