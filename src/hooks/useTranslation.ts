'use client';

import { useCallback } from 'react';
import { useI18n } from '@/context/I18nContext';
import type { TranslationKey, TranslationParams, Locale } from '@/locales';

export interface UseTranslationReturn {
  t: (key: TranslationKey, params?: TranslationParams) => string;
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  isLoaded: boolean;
  dir: 'ltr' | 'rtl';
}

/**
 * Hook unifié d'internationalisation pour Medjira Taxi App.
 * Permet d'accéder aux traductions type-safe (FR/EN), de changer de langue
 * et de supporter optionnellement un namespace par défaut.
 * 
 * @example
 * ```tsx
 * // Utilisation directe
 * const { t, locale, setLocale } = useTranslation();
 * return <h1>{t('taxi.title')}</h1>;
 * 
 * // Utilisation avec namespace
 * const { t } = useTranslation('taxi');
 * return <button>{t('bookNow')}</button>; // Résolu en taxi.bookNow
 * ```
 */
export function useTranslation(namespace?: string): UseTranslationReturn {
  const { t: baseT, locale, setLocale, isLoaded, dir } = useI18n();

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams): string => {
      if (!namespace) return baseT(key, params);
      const topLevelNamespaces = [
        'common', 'auth', 'taxi', 'colis', 'food', 'client',
        'driver', 'wallet', 'profile', 'errors', 'personalDriver',
        'notifications', 'history', 'restaurant'
      ];
      const hasNamespacePrefix = topLevelNamespaces.some((ns) => key.startsWith(`${ns}.`));
      const resolvedKey = hasNamespacePrefix ? key : (`${namespace}.${key}` as TranslationKey);
      return baseT(resolvedKey, params);
    },
    [baseT, namespace]
  );

  return {
    t,
    locale,
    setLocale,
    isLoaded,
    dir,
  };
}
