import { test, expect } from '@playwright/test';
import { clearFirestoreEmulator } from './helpers/firestore-seed';
import { clearAuthEmulator } from './helpers/auth-seed';
import { seedRestaurantApprovedNotStarted } from './helpers/seed-users';

test.beforeEach(async () => {
  await clearFirestoreEmulator();
  await clearAuthEmulator();
});

test('E2E-7 — Restaurant approved sans Stripe : invisible catalogue, dashboard avec bannière', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const owner = await seedRestaurantApprovedNotStarted();

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(owner.email);
  await page.getByLabel(/mot de passe/i).fill(owner.password);
  await page
    .getByRole('button', { name: /se connecter/i })
    .click();
  await expect(page).toHaveURL(/\/restaurant\/dashboard/);

  await expect(
    page.getByText(
      /configurer stripe|activer les paiements/i,
    ),
  ).toBeVisible();

  await page.goto('/food');
  await page.waitForLoadState('domcontentloaded');
  await expect(
    page.getByText('Le Bistrot Sans Stripe'),
  ).not.toBeVisible();
});
