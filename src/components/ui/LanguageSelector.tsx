'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { LOCALE_OPTIONS, type Locale } from '@/locales';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

interface LanguageSelectorProps {
  variant?: 'toggle' | 'dropdown' | 'pill' | 'compact';
  className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  variant = 'toggle',
  className = '',
}) => {
  const { locale, setLocale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = async (newLocale: Locale) => {
    if (newLocale === locale) {
      setIsOpen(false);
      return;
    }

    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Ignore if haptics unavailable
    }

    await setLocale(newLocale);
    setIsOpen(false);
  };

  if (variant === 'toggle') {
    return (
      <div
        role="group"
        aria-label="Language selection"
        className={`inline-flex items-center rounded-xl bg-white/[0.06] p-1 border border-white/[0.08] ${className}`}
      >
        {LOCALE_OPTIONS.map((opt) => {
          const isActive = locale === opt.code;
          return (
            <button
              key={opt.code}
              type="button"
              onClick={() => handleSelect(opt.code)}
              aria-pressed={isActive}
              className={`min-w-[44px] min-h-[44px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-95 ${
                isActive
                  ? 'bg-primary text-black shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <span>{opt.flag}</span>
              <span>{opt.code.toUpperCase()}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'pill' || variant === 'compact') {
    const nextLocale: Locale = locale === 'fr' ? 'en' : 'fr';
    const currentOpt = LOCALE_OPTIONS.find((o) => o.code === locale) ?? LOCALE_OPTIONS[0];

    return (
      <button
        type="button"
        onClick={() => handleSelect(nextLocale)}
        aria-label={`Current language: ${currentOpt.label}. Click to switch to ${nextLocale.toUpperCase()}`}
        className={`min-h-[44px] min-w-[44px] px-2 font-sans text-[11px] font-semibold tracking-[0.18em] text-primary/80 transition-colors hover:text-primary active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0c0d] ${className}`}
      >
        {locale.toUpperCase()}
      </button>
    );
  }

  // Dropdown variant
  const currentOpt = LOCALE_OPTIONS.find((o) => o.code === locale) ?? LOCALE_OPTIONS[0];

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Select language"
        className="min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-sm text-white flex items-center gap-2 transition-all active:scale-95"
      >
        <span className="text-base">{currentOpt.flag}</span>
        <span className="font-medium text-xs sm:text-sm">{currentOpt.label}</span>
        <MaterialIcon
          name="expand_more"
          className={`text-slate-400 transition-transform duration-200 text-lg ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-44 rounded-2xl bg-[#1c1b1a] border border-white/[0.08] shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          {LOCALE_OPTIONS.map((opt) => {
            const isSelected = locale === opt.code;
            return (
              <button
                key={opt.code}
                role="menuitem"
                type="button"
                onClick={() => handleSelect(opt.code)}
                className={`w-full min-h-[44px] px-3.5 py-2 text-left flex items-center justify-between text-sm transition-colors ${
                  isSelected
                    ? 'bg-primary/15 text-primary font-semibold'
                    : 'text-slate-200 hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{opt.flag}</span>
                  <span>{opt.label}</span>
                </div>
                {isSelected && (
                  <MaterialIcon name="check" className="text-primary text-base" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
