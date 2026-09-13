import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import {
  translations,
  getTranslation,
  formatTranslation,
  getNestedValue,
  detectInitialLocale,
  persistLocale,
  LANGUAGE_STORAGE_KEY,
} from '@/locales';
import { I18nProvider } from '@/context/I18nContext';
import { useTranslation } from '@/hooks/useTranslation';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import { BottomNav } from '@/components/ui/BottomNav';
import { Preferences } from '@capacitor/preferences';
import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';

// Mock Capacitor plugins
jest.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('@capacitor/device', () => ({
  Device: {
    getLanguageCode: jest.fn(),
  },
}));

jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: jest.fn(() => false),
  },
}));

jest.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: jest.fn().mockResolvedValue(undefined),
  },
  ImpactStyle: {
    Light: 'LIGHT',
    Medium: 'MEDIUM',
    Heavy: 'HEAVY',
  },
}));

describe('i18n Core System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Dictionary Parity', () => {
    function getDeepKeys(obj: Record<string, unknown>, prefix = ''): string[] {
      return Object.entries(obj).flatMap(([key, value]) => {
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return getDeepKeys(value as Record<string, unknown>, newKey);
        }
        return [newKey];
      });
    }

    function extractPlaceholders(str: string): string[] {
      const matches = str.match(/\{\{?([a-zA-Z0-9_-]+)\}?\}/g) || [];
      return Array.from(new Set(matches.map((m) => m.replace(/[\{\}]/g, '')))).sort();
    }

    it('has identical top-level namespaces between fr and en', () => {
      const frNamespaces = Object.keys(translations.fr).sort();
      const enNamespaces = Object.keys(translations.en).sort();
      expect(enNamespaces).toEqual(frNamespaces);
    });

    it('has identical keys in all sub-dictionaries', () => {
      const namespaces = Object.keys(translations.fr) as Array<keyof typeof translations.fr>;

      for (const ns of namespaces) {
        const frKeys = Object.keys(translations.fr[ns]).sort();
        const enKeys = Object.keys(translations.en[ns]).sort();
        expect(enKeys).toEqual(frKeys);
      }
    });

    it('has deep key parity across all nested levels', () => {
      const frDeepKeys = getDeepKeys(translations.fr as unknown as Record<string, unknown>).sort();
      const enDeepKeys = getDeepKeys(translations.en as unknown as Record<string, unknown>).sort();
      expect(enDeepKeys).toEqual(frDeepKeys);
    });

    it('has matching interpolation placeholders in fr and en', () => {
      const frDeepKeys = getDeepKeys(translations.fr as unknown as Record<string, unknown>);
      for (const key of frDeepKeys) {
        const frVal = getNestedValue(translations.fr, key);
        const enVal = getNestedValue(translations.en, key);
        if (typeof frVal === 'string' && typeof enVal === 'string') {
          const frPlaceholders = extractPlaceholders(frVal);
          const enPlaceholders = extractPlaceholders(enVal);
          expect({ key, placeholders: enPlaceholders }).toEqual({ key, placeholders: frPlaceholders });
        }
      }
    });

    it('has non-empty translation values in both languages', () => {
      const frDeepKeys = getDeepKeys(translations.fr as unknown as Record<string, unknown>);
      for (const key of frDeepKeys) {
        const frVal = getNestedValue(translations.fr, key);
        const enVal = getNestedValue(translations.en, key);
        expect(typeof frVal).toBe('string');
        expect((frVal as string).trim().length).toBeGreaterThan(0);
        expect(typeof enVal).toBe('string');
        expect((enVal as string).trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('formatTranslation', () => {
    it('replaces double brace variables', () => {
      const template = 'Hello {{name}}, you have {{count}} rides';
      const result = formatTranslation(template, { name: 'Alex', count: 5 });
      expect(result).toBe('Hello Alex, you have 5 rides');
    });

    it('replaces single brace variables', () => {
      const template = 'Your order is arriving in {minutes} min';
      const result = formatTranslation(template, { minutes: 12 });
      expect(result).toBe('Your order is arriving in 12 min');
    });

    it('returns original string when params is undefined', () => {
      const template = 'No params here';
      expect(formatTranslation(template)).toBe(template);
    });

    it('safely replaces currency strings containing dollar signs without mangling', () => {
      const template = 'Fare is {{fare}} and tip is {tip}';
      const result = formatTranslation(template, { fare: '$25.00', tip: '$5.50' });
      expect(result).toBe('Fare is $25.00 and tip is $5.50');
    });

    it('handles special replacement tokens ($&, $$, $1) literally without regex interpretation', () => {
      const template = 'Special {{offer}}';
      const result = formatTranslation(template, { offer: 'Discount $& and $$ and $10' });
      expect(result).toBe('Special Discount $& and $$ and $10');
    });
  });

  describe('getNestedValue', () => {
    it('retrieves nested property by dot path', () => {
      const obj = { a: { b: { c: 'found' } } };
      expect(getNestedValue(obj, 'a.b.c')).toBe('found');
    });

    it('returns undefined for non-existent path', () => {
      const obj = { a: { b: 123 } };
      expect(getNestedValue(obj, 'a.b.c')).toBeUndefined();
      expect(getNestedValue(obj, 'x.y.z')).toBeUndefined();
    });
  });

  describe('getTranslation', () => {
    it('translates correctly in French', () => {
      expect(getTranslation('fr', 'common.confirm')).toBe('Confirmer');
      expect(getTranslation('fr', 'taxi.standard')).toBe('Standard');
    });

    it('translates correctly in English', () => {
      expect(getTranslation('en', 'common.confirm')).toBe('Confirm');
      expect(getTranslation('en', 'taxi.whereTo')).toBe('Where to?');
    });

    it('returns the key if key is unknown in all dictionaries', () => {
      expect(getTranslation('en', 'unknown.key.here')).toBe('unknown.key.here');
    });
  });

  describe('Language Detection & Persistence', () => {
    it('reads saved language from Preferences if present', async () => {
      (Preferences.get as jest.Mock).mockResolvedValueOnce({ value: 'en' });
      const locale = await detectInitialLocale();
      expect(locale).toBe('en');
    });

    it('falls back to fr when Preferences is empty and browser is not English', async () => {
      (Preferences.get as jest.Mock).mockResolvedValueOnce({ value: null });
      const originalLang = navigator.language;
      Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true });
      const locale = await detectInitialLocale();
      expect(locale).toBe('fr');
      Object.defineProperty(navigator, 'language', { value: originalLang, configurable: true });
    });

    it('detects native device language via Capacitor when on mobile', async () => {
      (Preferences.get as jest.Mock).mockResolvedValueOnce({ value: null });
      (Capacitor.isNativePlatform as jest.Mock).mockReturnValue(true);
      (Device.getLanguageCode as jest.Mock).mockResolvedValueOnce({ value: 'en-US' });

      const locale = await detectInitialLocale();
      expect(locale).toBe('en');
    });

    it('persists language choice to Preferences', async () => {
      await persistLocale('en');
      expect(Preferences.set).toHaveBeenCalledWith({
        key: LANGUAGE_STORAGE_KEY,
        value: 'en',
      });
    });
  });

  describe('useTranslation hook and LanguageSelector UI', () => {
    function TestComponent() {
      const { t, locale, setLocale } = useTranslation();
      return (
        <div>
          <span data-testid="current-locale">{locale}</span>
          <span data-testid="translated-confirm">{t('common.confirm')}</span>
          <button data-testid="switch-to-en" onClick={() => setLocale('en')}>
            EN
          </button>
          <LanguageSelector variant="toggle" />
        </div>
      );
    }

    it('renders default French translation and switches to English', async () => {
      (Preferences.get as jest.Mock).mockResolvedValue({ value: 'fr' });

      render(
        <I18nProvider initialLocale="fr">
          <TestComponent />
        </I18nProvider>
      );

      expect(screen.getByTestId('current-locale')).toHaveTextContent('fr');
      expect(screen.getByTestId('translated-confirm')).toHaveTextContent('Confirmer');

      // Click switch button
      fireEvent.click(screen.getByTestId('switch-to-en'));

      await waitFor(() => {
        expect(screen.getByTestId('current-locale')).toHaveTextContent('en');
        expect(screen.getByTestId('translated-confirm')).toHaveTextContent('Confirm');
      });
    });

    it('gracefully falls back when used outside of I18nProvider', () => {
      render(<TestComponent />);
      expect(screen.getByTestId('current-locale')).toHaveTextContent('fr');
      expect(screen.getByTestId('translated-confirm')).toHaveTextContent('Confirmer');
    });

    it('supports namespace prefix with strict typed keys', () => {
      function NamespacedComponent() {
        const { t } = useTranslation('taxi');
        return <span data-testid="taxi-book">{t('bookNow')}</span>;
      }

      render(
        <I18nProvider initialLocale="fr">
          <NamespacedComponent />
        </I18nProvider>
      );

      expect(screen.getByTestId('taxi-book')).toHaveTextContent('Commander maintenant');
    });

    it('translates BottomNav labels dynamically based on active locale', async () => {
      function NavTestComponent() {
        const { setLocale } = useTranslation();
        return (
          <div>
            <button data-testid="btn-en" onClick={() => setLocale('en')}>
              EN
            </button>
            <BottomNav />
          </div>
        );
      }

      render(
        <I18nProvider initialLocale="fr">
          <NavTestComponent />
        </I18nProvider>
      );

      expect(screen.getByText('Accueil')).toBeInTheDocument();
      expect(screen.getByText('Activité')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('btn-en'));

      await waitFor(() => {
        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.getByText('Activity')).toBeInTheDocument();
      });
    });
  });
});
