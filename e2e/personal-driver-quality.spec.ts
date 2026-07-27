import { expect, test } from '@playwright/test';
import {
  personalDriverClassicConfiguration,
  personalDriverConfigSessionKey,
  personalDriverEstimateSession,
  personalDriverEstimateSessionKey,
} from './helpers/personal-driver-fixtures';

test.describe('Personal Driver quality gate', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text();
        if (!text.startsWith('Failed to load resource:')) {
          consoleErrors.push(text);
        }
      }
    });
    page.on('pageerror', (error) => {
      consoleErrors.push(error.message);
    });
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  test('presents plans, comparison controls, and configuration links', async ({ page }) => {
    await page.goto('/personal-driver', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /MEDJIRA PERSONAL DRIVER/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Commencer/i })).toHaveAttribute('href', '#forfaits');
    await expect(page.getByRole('button', { name: /Comparer les forfaits/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Aidez-moi à choisir/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Choisir Basic' })).toHaveAttribute('href', /plan=basic/);
    await expect(page.getByRole('link', { name: 'Choisir Classic' })).toHaveAttribute('href', /plan=classic/);
    await expect(page.getByRole('link', { name: 'Choisir Premium' })).toHaveAttribute('href', /plan=premium/);
  });

  test('explains and blocks weekend selection for Basic', async ({ page }) => {
    await page.goto('/personal-driver/configurer?plan=basic', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/FORMULE BASIC/i)).toBeVisible();
    await expect(page.getByText(/Pour ajouter le samedi ou le dimanche/i)).toBeVisible();
    await expect(page.locator('label', { hasText: 'Samedi' }).locator('input')).toBeDisabled();
    await expect(page.locator('label', { hasText: 'Dimanche' }).locator('input')).toBeDisabled();

    await page.getByRole('button', { name: /Continuer vers l estimation/i }).click();
    await expect(page).toHaveURL(/\/personal-driver\/configurer\/?\?plan=basic/);
  });

  test('allows weekend selection for Classic', async ({ page }) => {
    await page.goto('/personal-driver/configurer?plan=classic', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/FORMULE CLASSIC/i)).toBeVisible();
    await expect(page.locator('label', { hasText: 'Samedi' }).locator('input')).toBeEnabled();
    await expect(page.locator('label', { hasText: 'Dimanche' }).locator('input')).toBeEnabled();
  });

  test('renders confirmation from stable session contracts before payment', async ({ page }) => {
    await page.addInitScript(
      ({ configKey, estimateKey, config, estimate }) => {
        window.sessionStorage.setItem(configKey, JSON.stringify(config));
        window.sessionStorage.setItem(estimateKey, JSON.stringify(estimate));
      },
      {
        configKey: personalDriverConfigSessionKey,
        estimateKey: personalDriverEstimateSessionKey,
        config: personalDriverClassicConfiguration,
        estimate: personalDriverEstimateSession,
      },
    );

    await page.goto('/personal-driver/confirmation', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'CLASSIC' })).toBeVisible();
    await expect(page.getByText('100 rue Principale, Montreal')).toBeVisible();
    await expect(page.getByText('500 rue Universite, Montreal')).toBeVisible();
    await expect(page.getByText('620 km', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Préparer le paiement sécurisé/i })).toBeVisible();
  });

  test('keeps admin and driver operational surfaces reachable', async ({ page }) => {
    test.setTimeout(70_000);

    await page.goto('/admin/personal-driver', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.getByRole('heading', { name: /Administration/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Réaffecter un chauffeur/i })).toBeVisible();

    await page.goto('/driver/personal-driver', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.getByRole('heading', { name: /Espace Chauffeur/i })).toBeVisible();
    await expect(page.getByText(/Mes missions/i)).toBeVisible();
  });
});
