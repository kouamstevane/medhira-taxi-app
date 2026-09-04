import { expect, test, type Page } from '@playwright/test';
import {
  personalDriverClassicConfiguration,
  personalDriverConfigSessionKey,
  personalDriverEstimateSession,
  personalDriverEstimateSessionKey,
} from './helpers/personal-driver-fixtures';
import {
  seedPersonalDriverClient,
  seedPersonalDriverDriver,
  seedPersonalDriverAdmin,
} from './helpers/seed-users';
import { createCustomTokenForUser } from './helpers/auth-seed';

async function signInWithCustomToken(page: Page, uid: string) {
  const customToken = await createCustomTokenForUser(uid);
  await page.goto('/personal-driver', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (token) => {
    const globalObj = window as unknown as {
      __medjiraSignInWithCustomToken?: (t: string) => Promise<unknown>;
    };
    if (typeof globalObj.__medjiraSignInWithCustomToken === 'function') {
      await globalObj.__medjiraSignInWithCustomToken(token);
    } else {
      throw new Error('__medjiraSignInWithCustomToken is not available on window');
    }
  }, customToken);
  await page.waitForTimeout(1000);
}

test.describe('Personal Driver End-to-End Audit (Web Desktop & Mobile)', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000);
    consoleErrors.length = 0;
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text();
        // Ignore network resource loading warnings/favicons
        if (!text.startsWith('Failed to load resource:') && !text.includes('favicon.ico')) {
          consoleErrors.push(text);
        }
      }
    });
    page.on('pageerror', (error) => {
      consoleErrors.push(`[PageError] ${error.message}`);
    });
  });

  test.afterEach(() => {
    expect(consoleErrors).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // 1. SCÉNARIO NOMINAL : PARCOURS COMPLET CLIENT
  // --------------------------------------------------------------------------
  test('1. Nominal Flow: Browse plans, configure Classic, check estimate and confirmation', async ({ page }) => {
    test.setTimeout(60_000);

    // Step 1: Presentation page
    await page.goto('/personal-driver', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /MEDJIRA PERSONAL DRIVER/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Choisir Classic' })).toHaveAttribute('href', /plan=classic/);

    // Step 2: Configurator
    await page.goto('/personal-driver/configurer?plan=classic', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/FORMULE CLASSIC/i)).toBeVisible();
    await expect(page.locator('label', { hasText: 'Samedi' }).locator('input')).toBeEnabled();

    // Step 3: Estimation with valid session data
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

    await page.goto('/personal-driver/estimation', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Choisissez votre forfait' })).toBeVisible();
    await expect(page.getByText(/12,4 km/i).first()).toBeVisible();

    // Step 4: Confirmation
    await page.goto('/personal-driver/confirmation', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'CLASSIC' })).toBeVisible();
    await expect(page.getByText('100 rue Principale, Montreal')).toBeVisible();
    await expect(page.getByText('500 rue Universite, Montreal')).toBeVisible();
    await expect(page.getByRole('button', { name: /Préparer le paiement sécurisé/i })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 2. SCÉNARIO DONNÉES VIDES / ABSENTES
  // --------------------------------------------------------------------------
  test('2. Empty State: Visiting estimation and confirmation with empty session displays clean fallback', async ({ page }) => {
    // Clear session storage before loading
    await page.addInitScript(() => {
      window.sessionStorage.clear();
    });

    // Estimation with empty storage
    await page.goto('/personal-driver/estimation', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Votre trajet est introuvable' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Choisir un forfait' })).toBeVisible();

    // Confirmation with empty storage
    await page.goto('/personal-driver/confirmation', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Résumé introuvable' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Configurer mon transport mensuel' })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 3. SCÉNARIO DONNÉES CORROMPUES / VALIDATION ZOD & PURGE AUTOMATIQUE
  // --------------------------------------------------------------------------
  test('3. Corrupted Data Injection: Malformed JSON or invalid schema is gracefully caught and purged', async ({ page }) => {
    // Navigate to origin first to have a valid window/sessionStorage context
    await page.goto('/personal-driver', { waitUntil: 'domcontentloaded' });

    // Inject malformed JSON strings into sessionStorage
    await page.evaluate(
      ({ configKey, estimateKey }) => {
        window.sessionStorage.setItem(configKey, '{"corrupted_json: true, unexpected_eof');
        window.sessionStorage.setItem(estimateKey, '{malformed: [1,2,3');
      },
      {
        configKey: personalDriverConfigSessionKey,
        estimateKey: personalDriverEstimateSessionKey,
      },
    );

    // Visiting estimation should not throw and should auto-purge corrupted storage
    await page.goto('/personal-driver/estimation', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Votre trajet est introuvable' })).toBeVisible();

    const storedConfigAfterEstimation = await page.evaluate((key) => window.sessionStorage.getItem(key), personalDriverConfigSessionKey);
    expect(storedConfigAfterEstimation).toBeNull();

    // Inject invalid schema (version mismatch, negative distance)
    await page.evaluate(
      ({ configKey, estimateKey }) => {
        window.sessionStorage.setItem(configKey, JSON.stringify({ version: 999, planId: 'invalid_plan', distanceKm: -10 }));
        window.sessionStorage.setItem(estimateKey, JSON.stringify({ version: 999, selectedPlanId: 'unknown' }));
      },
      {
        configKey: personalDriverConfigSessionKey,
        estimateKey: personalDriverEstimateSessionKey,
      },
    );

    await page.goto('/personal-driver/confirmation', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Résumé introuvable' })).toBeVisible();

    const storedConfigAfterConfirmation = await page.evaluate((key) => window.sessionStorage.getItem(key), personalDriverConfigSessionKey);
    const storedEstimateAfterConfirmation = await page.evaluate((key) => window.sessionStorage.getItem(key), personalDriverEstimateSessionKey);
    expect(storedConfigAfterConfirmation).toBeNull();
    expect(storedEstimateAfterConfirmation).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 4. SCÉNARIO ACCÈS NON-AUTHENTIFIÉ
  // --------------------------------------------------------------------------
  test('4. Security & Auth Guard: Protected surfaces redirect unauthenticated users to login', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/admin/personal-driver', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page).toHaveURL(/\/login\/?\?next=%2Fadmin%2Fpersonal-driver/);

    await page.goto('/driver/personal-driver', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page).toHaveURL(/\/login\/?\?next=%2Fdriver%2Fpersonal-driver/);

    await page.goto('/personal-driver/dashboard', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page).toHaveURL(/\/login\/?\?next=%2Fpersonal-driver%2Fdashboard/);
  });

  // --------------------------------------------------------------------------
  // 5. SCÉNARIO MOBILE PIXEL 7 : ZÉRO OVERFLOW & TOUCH TARGETS >= 44PX
  // --------------------------------------------------------------------------
  test('5. Mobile Android Pixel 7: Zero horizontal overflow and touch targets >= 44px', async ({ browser }) => {
    test.setTimeout(90_000);
    // Pixel 7 specs: Viewport 412x839, isMobile true, hasTouch true
    const context = await browser.newContext({
      viewport: { width: 412, height: 839 },
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
    });

    const page = await context.newPage();
    const localConsoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource:')) {
        localConsoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => localConsoleErrors.push(err.message));

    const routesToCheck = [
      '/personal-driver',
      '/personal-driver/configurer?plan=classic',
    ];

    for (const route of routesToCheck) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      // 1. Check Zero Horizontal Overflow
      const overflow = await page.evaluate(() => {
        const scrollWidth = document.documentElement.scrollWidth;
        const clientWidth = document.documentElement.clientWidth;
        return { scrollWidth, clientWidth, hasOverflow: scrollWidth > clientWidth };
      });
      expect(overflow.hasOverflow, `Overflow detected on route ${route}: scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`).toBe(false);

      // 2. Check Touch Targets for visible application buttons (excluding Next.js dev overlay indicator)
      const buttons = page.locator('button:visible:not([aria-label*="Next.js"]):not([id*="nextjs"]), a:visible:not([aria-label*="Next.js"]):not([id*="nextjs"])[role="button"]');
      const count = await buttons.count();
      for (let i = 0; i < Math.min(count, 10); i++) {
        const button = buttons.nth(i);
        const box = await button.boundingBox();
        if (box && box.height > 0) {
          // Allow subpixel tolerance (>= 43.5px)
          expect(box.height, `Touch target height on ${route} must be >= 44px`).toBeGreaterThanOrEqual(43.5);
        }
      }
    }

    // Also verify estimation and confirmation under mobile
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

    for (const route of ['/personal-driver/estimation', '/personal-driver/confirmation']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const overflow = await page.evaluate(() => {
        const scrollWidth = document.documentElement.scrollWidth;
        const clientWidth = document.documentElement.clientWidth;
        return { scrollWidth, clientWidth, hasOverflow: scrollWidth > clientWidth };
      });
      expect(overflow.hasOverflow, `Overflow detected on route ${route}: scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`).toBe(false);
    }

    expect(localConsoleErrors).toEqual([]);
    await context.close();
  });

  // --------------------------------------------------------------------------
  // 6. SCÉNARIO AUTHENTIFIÉ CLIENT : TABLEAU DE BORD, TRAJETS & MODALES
  // --------------------------------------------------------------------------
  test('6. Authenticated Client Flow: View subscription dashboard, trips, special trip modal & cancellation modal', async ({ page }) => {
    test.setTimeout(90_000);
    const client = await seedPersonalDriverClient();
    await signInWithCustomToken(page, client.uid);

    await page.goto('/personal-driver/dashboard', { waitUntil: 'domcontentloaded' });

    // Header & Subscription Plan Info
    await expect(page.getByText(/MON ACCÈS PERSONAL DRIVER/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Abonnement Forfait Classic/i })).toBeVisible();
    await expect(page.getByText('440 km')).toBeVisible();
    await expect(page.getByText('100 rue Principale, Montreal').first()).toBeVisible();
    await expect(page.getByText('500 rue Universite, Montreal').first()).toBeVisible();

    // Special trips section
    await expect(page.getByRole('heading', { name: /Trajets Spéciaux Inclus/i })).toBeVisible();
    const specialTripBtn = page.getByRole('button', { name: /Demander un trajet spécial/i });
    await expect(specialTripBtn).toBeVisible();

    // Test Special Trip Modal
    await specialTripBtn.click();
    await expect(page.getByRole('heading', { name: 'Demander un trajet spécial' })).toBeVisible();
    await page.getByPlaceholder(/Clinique Médicale/i).fill('Gare Centrale');
    await page.getByPlaceholder(/Aéroport/i).fill('Aéroport YUL');
    const closeBtn = page.getByRole('button', { name: 'Fermer' });
    await expect(closeBtn).toBeVisible();
    const closeBox = await closeBtn.boundingBox();
    if (closeBox) {
      expect(closeBox.height).toBeGreaterThanOrEqual(43.5);
      expect(closeBox.width).toBeGreaterThanOrEqual(43.5);
    }
    await closeBtn.click();
    await expect(page.getByRole('heading', { name: 'Demander un trajet spécial' })).not.toBeVisible();

    // Trip card & Cancellation Modal
    const cancelTripBtn = page.getByRole('button', { name: 'Annuler ce trajet' }).first();
    await expect(cancelTripBtn).toBeVisible({ timeout: 15_000 });
    const cancelBox = await cancelTripBtn.boundingBox();
    if (cancelBox) {
      expect(cancelBox.height).toBeGreaterThanOrEqual(43.5);
    }
    await cancelTripBtn.click();
    await expect(page.getByRole('heading', { name: /Confirmer l'annulation/i })).toBeVisible();
    await expect(page.getByText(/Les kilomètres de cette journée annulée ne sont ni remboursables ni reportables/i)).toBeVisible();

    // Close cancellation modal via Retour button
    const backBtn = page.getByRole('button', { name: 'Retour' });
    await backBtn.click();
    await expect(page.getByRole('heading', { name: /Confirmer l'annulation/i })).not.toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 7. SCÉNARIO AUTHENTIFIÉ CHAUFFEUR : PORTAIL MISSIONS, FILTRE & STATUTS
  // --------------------------------------------------------------------------
  test('7. Authenticated Driver Flow: View assigned missions, search filter, status progression & touch targets', async ({ page }) => {
    test.setTimeout(90_000);
    const driver = await seedPersonalDriverDriver();
    await signInWithCustomToken(page, driver.uid);

    await page.goto('/driver/personal-driver', { waitUntil: 'domcontentloaded' });

    // Header
    await expect(page.getByRole('heading', { name: /Espace Chauffeur — Missions Personal Driver/i })).toBeVisible({ timeout: 15_000 });

    // Assigned mission card
    await expect(page.getByText('trip-e2e-driver-mission')).toBeVisible();
    await expect(page.getByText(/100 rue Principale, Montreal/i).first()).toBeVisible();

    // Mission filter
    const filterInput = page.getByLabel('Filtrer mes missions');
    await expect(filterInput).toBeVisible();
    await filterInput.fill('Universite');
    await expect(page.getByText('trip-e2e-driver-mission')).toBeVisible();
    await filterInput.fill('IntrouvableXYZ');
    await expect(page.getByText(/Aucune mission/i)).toBeVisible();
    await filterInput.clear();
    await expect(page.getByText('trip-e2e-driver-mission')).toBeVisible();

    // Verify all 5 status progression buttons are visible and satisfy touch targets >= 44px
    const statusButtons = [
      'En route',
      'Arrivé sur place',
      'Passager récupéré',
      'Trajet en cours',
      'Trajet terminé',
    ];

    for (const btnName of statusButtons) {
      const btn = page.getByRole('button', { name: btnName });
      await expect(btn).toBeVisible();
      const box = await btn.boundingBox();
      if (box) {
        expect(box.height, `Button ${btnName} height must be >= 44px`).toBeGreaterThanOrEqual(43.5);
      }
    }
  });

  // --------------------------------------------------------------------------
  // 8. SCÉNARIO AUTHENTIFIÉ ADMINISTRATEUR : SUPERVISION, FLOTTE & ÉDITEUR FORFAITS
  // --------------------------------------------------------------------------
  test('8. Authenticated Admin Flow: Supervision dashboard, manual fleet assignment & plans editor', async ({ page }) => {
    test.setTimeout(90_000);
    await seedPersonalDriverClient();
    const admin = await seedPersonalDriverAdmin();
    await signInWithCustomToken(page, admin.uid);

    await page.goto('/admin/personal-driver', { waitUntil: 'domcontentloaded' });

    // Admin Title & Supervision
    await expect(page.getByRole('heading', { name: /Administration — Personal Driver/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Alertes Retard/i)).toBeVisible();

    // Subscriptions supervision table
    await expect(page.getByRole('heading', { name: 'Abonnements à traiter' })).toBeVisible();
    await expect(page.getByText('sub-e2e-1')).toBeVisible();

    // Operational missions
    await expect(page.getByRole('heading', { name: /Trajets à affecter ou surveiller/i })).toBeVisible();

    // Manual assignment section
    await expect(page.getByRole('heading', { name: /Affecter un chauffeur et un véhicule/i })).toBeVisible();
    const assignBtn = page.getByRole('button', { name: /Affecter la mission/i });
    await expect(assignBtn).toBeVisible();
    const assignBox = await assignBtn.boundingBox();
    if (assignBox) {
      expect(assignBox.height).toBeGreaterThanOrEqual(43.5);
    }

    // PersonalDriverPlansEditor section
    await expect(page.getByRole('heading', { name: /Forfaits Personal Driver/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Classic/i })).toBeVisible();
  });
});
