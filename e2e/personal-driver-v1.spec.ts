import { expect, test } from '@playwright/test';
import {
  personalDriverClassicConfiguration,
  personalDriverConfigSessionKey,
  personalDriverEstimateSession,
  personalDriverEstimateSessionKey,
} from './helpers/personal-driver-fixtures';

test.describe('Personal Driver V1 smoke', () => {
  test('keeps the presentation, configurator, and confirmation route connected', async ({ page }) => {
    await page.goto('/personal-driver', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /MEDJIRA PERSONAL DRIVER/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Choisir Classic' })).toHaveAttribute('href', /plan=classic/);

    await page.goto('/personal-driver/configurer?plan=classic', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/FORMULE CLASSIC/i)).toBeVisible();
    await expect(page.locator('label', { hasText: 'Samedi' }).locator('input')).toBeEnabled();

    await page.addInitScript(
      ({ configKey, estimateKey, config, estimate }) => {
        window.sessionStorage.setItem(configKey, JSON.stringify(config));
        window.sessionStorage.setItem(estimateKey, JSON.stringify(estimate));
      },
      {
        configKey: personalDriverConfigSessionKey,
        estimateKey: personalDriverEstimateSessionKey,
        config: {
          ...personalDriverClassicConfiguration,
          distanceOneWayKm: 8.2,
          distanceReturnKm: 13.4,
          distanceKm: 8.2,
          monthlyDistanceKm: 540,
        },
        estimate: personalDriverEstimateSession,
      },
    );
    await page.goto('/personal-driver/confirmation', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'CLASSIC' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Préparer le paiement sécurisé/i })).toBeVisible();
  });
});
