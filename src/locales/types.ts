import { Preferences } from '@capacitor/preferences';
import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';

export type Locale = 'fr' | 'en';

export const SUPPORTED_LOCALES: readonly Locale[] = ['fr', 'en'] as const;
export const DEFAULT_LOCALE: Locale = 'fr';
export const LANGUAGE_STORAGE_KEY = 'medjira_language';

export interface LocaleOption {
  code: Locale;
  label: string;
  flag: string;
  nativeName?: string;
}

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { code: 'fr', label: 'Français', flag: '🇫🇷', nativeName: 'FR' },
  { code: 'en', label: 'English', flag: '🇬🇧', nativeName: 'EN' },
] as const;

export type TranslationParams = Record<string, string | number>;

/**
 * Type utilitaire récursif pour extraire toutes les clés au format dot-notation (ex: "taxi.pickup").
 */
export type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

/**
 * Type récursif transformant toutes les valeurs en string.
 */
export type DeepString<T> = {
  [K in keyof T]: T[K] extends object ? DeepString<T[K]> : string;
};

/**
 * Formate un template en remplaçant les variables entre accolades simples ou doubles ({var} ou {{var}}).
 * Fonctionne de façon sécurisée sans interpréter les caractères regex spéciaux ($&, $$, $1, etc.) dans les valeurs.
 */
export function formatTranslation(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{\{?([a-zA-Z0-9_-]+)\}?\}/g, (match, key) => {
    const val = params[key];
    return val !== undefined ? String(val) : match;
  });
}

export const interpolate = formatTranslation;

/**
 * Récupère une valeur imbriquée dans un objet à partir d'un chemin séparé par des points ("a.b.c").
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const segments = path.split('.');
  let current: unknown = obj;
  for (const seg of segments) {
    if (current && typeof current === 'object' && seg in current) {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Détecte la langue initiale selon l'ordre :
 * 1. Préférence stockée dans Capacitor Preferences
 * 2. Langue du système mobile si sur app native (Capacitor Device)
 * 3. Langue du navigateur (navigator.language)
 * 4. Fallback 'fr'
 */
export async function detectInitialLocale(): Promise<Locale> {
  try {
    const { value: storedPref } = await Preferences.get({ key: LANGUAGE_STORAGE_KEY });
    if (storedPref) {
      const lower = storedPref.toLowerCase().trim();
      if (lower.startsWith('en')) return 'en';
      if (lower.startsWith('fr')) return 'fr';
    }

    if (Capacitor.isNativePlatform()) {
      try {
        const { value: deviceLang } = await Device.getLanguageCode();
        if (deviceLang) {
          const lower = deviceLang.toLowerCase().trim();
          if (lower.startsWith('en')) return 'en';
          if (lower.startsWith('fr')) return 'fr';
        }
      } catch {
        // Ignorer et continuer
      }
    }

    if (typeof navigator !== 'undefined') {
      const browserLang = navigator.language || (navigator.languages && navigator.languages[0]);
      if (browserLang) {
        const lower = browserLang.toLowerCase().trim();
        if (lower.startsWith('en')) return 'en';
        if (lower.startsWith('fr')) return 'fr';
      }
    }
  } catch {
    // Fallback silencieux
  }

  return DEFAULT_LOCALE;
}

/**
 * Persiste la langue sélectionnée dans Capacitor Preferences.
 */
export async function persistLocale(locale: Locale): Promise<void> {
  try {
    await Preferences.set({ key: LANGUAGE_STORAGE_KEY, value: locale });
  } catch (e) {
    console.warn('[i18n] Échec de la persistance de la langue:', e);
  }
}
