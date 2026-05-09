import { test, expect } from '@playwright/test';
import {
  clearFirestoreEmulator,
  patchDoc,
} from './helpers/firestore-seed';
import { clearAuthEmulator } from './helpers/auth-seed';
import { seedClientWithRestaurantApprovedStripeActive } from './helpers/seed-users';

test.beforeEach(async () => {
  await clearFirestoreEmulator();
  await clearAuthEmulator();
});

test('E2E-2 — Login multi-rôle, /auth/continue-as, switcher < 1s (AC5)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const user =
    await seedClientWithRestaurantApprovedStripeActive();

  await patchDoc(`users/${user.uid}`, {
    lastActiveRole: 'nonexistent_role',
  });

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/mot de passe/i).fill(user.password);
  await page
    .getByRole('button', { name: /se connecter/i })
    .click();

  await expect(page).toHaveURL(/\/auth\/continue-as/);
  await expect(
    page.getByRole('button', { name: /client/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /restaurant/i }),
  ).toBeVisible();

  await page.getByRole('button', { name: /client/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const switchStart = Date.now();
  await page
    .getByLabel(/changer de rôle|role switcher/i)
    .click();
  await page
    .getByRole('menuitem', { name: /restaurant/i })
    .click();
  await expect(page).toHaveURL(/\/restaurant\/dashboard/);
  const switchDuration = Date.now() - switchStart;
  const threshold = process.env.CI ? 3000 : 1000;
  expect(switchDuration).toBeLessThan(threshold);
});
