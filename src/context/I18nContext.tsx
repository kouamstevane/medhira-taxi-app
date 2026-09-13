'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  type Locale,
  type TranslationKey,
  type TranslationParams,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  getTranslation,
  detectInitialLocale,
  persistLocale,
} from '@/locales';

export interface I18nContextValue {
  locale: Locale;
  setLocale: (newLocale: Locale) => Promise<void>;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  isLoaded: boolean;
  dir: 'ltr' | 'rtl';
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: Locale;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale || DEFAULT_LOCALE);
  const [isLoaded, setIsLoaded] = useState(Boolean(initialLocale));

  // Synchronise l'attribut lang sur le document HTML
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = 'ltr';
    }
  }, [locale]);

  // Initialisation et auto-détection si pas d'initialLocale
  useEffect(() => {
    if (initialLocale) {
      return;
    }

    let isCancelled = false;

    async function initializeLanguage() {
      const detected = await detectInitialLocale();
      if (!isCancelled) {
        setLocaleState(detected);
        setIsLoaded(true);
      }
    }

    void initializeLanguage();

    return () => {
      isCancelled = true;
    };
  }, [initialLocale]);

  const setLocale = useCallback(async (newLocale: Locale) => {
    if (!SUPPORTED_LOCALES.includes(newLocale)) return;
    setLocaleState(newLocale);
    await persistLocale(newLocale);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams): string => {
      return getTranslation(locale, key, params);
    },
    [locale]
  );

  const contextValue = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      isLoaded,
      dir: 'ltr',
    }),
    [locale, setLocale, t, isLoaded]
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    // Fallback gracieux si utilisé en dehors du provider
    return {
      locale: DEFAULT_LOCALE,
      setLocale: async () => {},
      t: (key: TranslationKey, params?: TranslationParams) => getTranslation(DEFAULT_LOCALE, key, params),
      isLoaded: true,
      dir: 'ltr',
    };
  }
  return context;
}
