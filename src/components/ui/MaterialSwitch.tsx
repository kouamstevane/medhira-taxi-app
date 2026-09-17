'use client';

import React from 'react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export interface MaterialSwitchProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledby?: string;
  className?: string;
  showThumbIcon?: boolean;
}

/**
 * MaterialSwitch - Google Material Design 3 (M3) Switch component.
 * Features:
 * - Official 52x32px track dimensions with 16px/24px dynamic morphing thumb
 * - Integrated checkmark icon on selected state
 * - 48x48px accessible touch target conforming to mobile WCAG requirements
 * - Light haptic feedback on mobile via @capacitor/haptics
 * - Full keyboard navigation (Space / Enter) and ARIA switch role
 */
export const MaterialSwitch: React.FC<MaterialSwitchProps> = ({
  id,
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  ariaLabelledby,
  className = '',
  showThumbIcon = true,
}) => {
  const handleToggle = () => {
    if (disabled) return;

    onChange(!checked);

    void (async () => {
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch {
        // Haptics unavailable on web or not supported by platform
      }
    })();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      disabled={disabled}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      className={`group relative inline-flex min-h-[48px] min-w-[52px] items-center justify-center p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 rounded-full transition ${
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
      } ${className}`}
    >
      {/* Material 3 Track */}
      <span
        className={`relative h-8 w-[52px] rounded-full border-2 transition-colors duration-200 ease-in-out ${
          checked
            ? 'border-primary bg-primary shadow-sm shadow-primary/30'
            : 'border-zinc-500 bg-zinc-800/80 group-hover:border-zinc-400'
        }`}
      >
        {/* Material 3 Dynamic Thumb */}
        <span
          className={`absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full transition-all duration-200 ease-in-out ${
            checked
              ? 'left-[22px] h-6 w-6 bg-white text-primary shadow-md'
              : 'left-[6px] h-4 w-4 bg-zinc-400 group-hover:bg-zinc-300'
          }`}
        >
          {showThumbIcon && checked && (
            <svg
              className="h-3.5 w-3.5 stroke-[3] text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
      </span>
    </button>
  );
};
