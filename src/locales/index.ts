import { fr, type TranslationSchema } from './fr';
import { en } from './en';
import {
  type Locale,
  type NestedKeyOf,
  type TranslationParams,
  formatTranslation,
  getNestedValue,
  DEFAULT_LOCALE,
} from './types';

export * from './types';
export { fr } from './fr';
export { en } from './en';

export const translations: Record<Locale, TranslationSchema> = {
  fr,
  en,
};

export type TranslationKey = NestedKeyOf<TranslationSchema> | (string & {});

/**
 * Résout une clé en notation pointée (ex: "taxi.pickup") dans le dictionnaire donné,
 * avec fallback automatique sur la locale par défaut (fr) si nécessaire,
 * et applique l'interpolation des paramètres {var} et {{var}}.
 */
export function getTranslation(
  locale: Locale,
  key: string,
  params?: TranslationParams
): string {
  const currentDict = translations[locale] || translations[DEFAULT_LOCALE];
  const value = getNestedValue(currentDict, key);

  if (typeof value === 'string') {
    return formatTranslation(value, params);
  }

  // Fallback dans la langue par défaut (FR) si introuvable dans la langue courante
  if (locale !== DEFAULT_LOCALE) {
    const fallbackVal = getNestedValue(translations[DEFAULT_LOCALE], key);
    if (typeof fallbackVal === 'string') {
      return formatTranslation(fallbackVal, params);
    }
  }

  // Si non trouvé (sécurité absolue), renvoyer la clé elle-même
  return key;
}

/**
 * Traduction hors React (services, utilitaires, validations zod, etc.).
 * La locale active est lue depuis <html lang> (synchronisé par I18nProvider) ;
 * côté serveur ou sans DOM, la locale par défaut est utilisée.
 */
export function translate(key: TranslationKey, params?: TranslationParams): string {
  const htmlLang =
    typeof document !== 'undefined' ? document.documentElement.lang.toLowerCase().split('-')[0] : '';
  const locale: Locale = (Object.keys(translations) as Locale[]).includes(htmlLang as Locale)
    ? (htmlLang as Locale)
    : DEFAULT_LOCALE;
  return getTranslation(locale, key, params);
}

/**
 * Traduction dans la locale par défaut (fr), indépendante de la langue de l'utilisateur.
 * Pour les libellés persistés en base et relus par l'équipe (motifs d'annulation, d'échec).
 */
export function translateDefault(key: TranslationKey, params?: TranslationParams): string {
  return getTranslation(DEFAULT_LOCALE, key, params);
}
