import { test, expect } from '@playwright/test';

const AUDITED_ROUTES = [
  '/wallet',
  '/historique',
  '/client/orders',
  '/food',
  '/driver/activite',
  '/driver/documents',
];

test.describe('Audit Qualité & Réseau - Composant NetworkErrorView (Multi-Routes)', () => {
  for (const route of AUDITED_ROUTES) {
    test(`doit charger ${route} sans débordement horizontal et sans crash`, async ({ page }) => {
      const pageErrors: Error[] = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      // 1. Zéro débordement horizontal
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);

      // 2. Vérification de l'absence d'erreurs critiques d'hydratation
      const hydrationErrors = pageErrors.filter(
        (e) => e.message.includes('Hydration failed') || e.message.includes('Minified React error')
      );
      expect(hydrationErrors).toHaveLength(0);
    });

    test(`doit réagir gracieusement sur ${route} en cas de déconnexion réseau simulée`, async ({ page }) => {
      // Bloquer les requêtes Firestore
      await page.route('**/firestore.googleapis.com/**', (r) => r.abort('failed'));

      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      // L'UI doit rester vivante
      const bodyVisible = await page.locator('body').isVisible();
      expect(bodyVisible).toBe(true);

      // Zéro overflow même en cas d'erreur
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }
});
