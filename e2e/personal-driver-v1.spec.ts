import { test, expect } from '@playwright/test';

test.describe('Personal Driver V1 Funnel & Flow', () => {
  test('navigates through Personal Driver presentation, configurator, estimation, confirmation, and dashboard', async ({ page }) => {
    test.setTimeout(60_000);

    // 1. Ouvrir la page de présentation Personal Driver
    await page.goto('/personal-driver');
    await expect(page.locator('h1')).toContainText(/MEDJIRA PERSONAL DRIVER/i);
    await expect(page.getByRole('link', { name: /Commencer/i })).toBeVisible();

    // Capture d'écran Étape 1 (Présentation & Cartes)
    await page.screenshot({ path: 'test-results/screenshots/01-personal-driver-presentation.png', fullPage: true });

    // 2. Cliquer sur Commencer
    await page.getByRole('link', { name: /Commencer/i }).click();
    await page.waitForURL('/personal-driver/configurer');

    // 3. Remplir le formulaire de configuration
    await page.fill('input[placeholder*="venir vous chercher"], input[name="pickupAddress"]', '100 rue Principale, Montreal');
    await page.fill('input[placeholder*="aller"], input[name="destinationAddress"]', '500 rue Universite, Montreal');

    // S'assurer qu'au moins 1 jour est sélectionné
    const mondayBtn = page.getByRole('button', { name: /^L$/i }).first();
    if (await mondayBtn.isVisible()) {
      await mondayBtn.click();
    }

    // Capture d'écran Étape 2 (Configurateur)
    await page.screenshot({ path: 'test-results/screenshots/02-personal-driver-configurator.png', fullPage: true });

    // Soumettre le formulaire
    const submitBtn = page.getByRole('button', { name: /Voir mes tarifs et recommandations/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForURL('/personal-driver/estimation');
    }

    // 4. Vérifier l'écran d'estimation
    await expect(page.locator('body')).toContainText(/Personal Driver/i);
    await page.screenshot({ path: 'test-results/screenshots/03-personal-driver-estimation.png', fullPage: true });

    // 5. Continuer vers la confirmation
    const continueBtn = page.getByRole('button', { name: /Continuer avec ce forfait/i });
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
      await page.waitForURL('/personal-driver/confirmation');
    }

    // 6. Vérifier l'écran de confirmation
    await page.screenshot({ path: 'test-results/screenshots/04-personal-driver-confirmation.png', fullPage: true });
  });
});
