import { test, expect } from '@playwright/test';
import { clearFirestoreEmulator } from './helpers/firestore-seed';
import { clearAuthEmulator } from './helpers/auth-seed';
import { seedDriverPending } from './helpers/seed-users';

test.beforeEach(async () => {
  await clearFirestoreEmulator();
  await clearAuthEmulator();
});

test('E2E-4 — Driver pending : dashboard read-only + bannière + actions disabled', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const user = await seedDriverPending();

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/mot de passe/i).fill(user.password);
  await page
    .getByRole('button', { name: /se connecter/i })
    .click();
  await expect(page).toHaveURL(/\/driver\/dashboard/);

  await expect(
    page.getByText(
      /dossier en cours|en attente d'approbation/i,
    ),
  ).toBeVisible();

  const actionButtons = page.getByRole('button', {
    name: /aller en ligne|accepter une course|prendre une course/i,
  });
  const count = await actionButtons.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(actionButtons.nth(i)).toBeDisabled();
  }
});
