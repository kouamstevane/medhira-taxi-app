import { test, expect } from '@playwright/test';
import {
  clearFirestoreEmulator,
  getDocData,
} from './helpers/firestore-seed';
import { clearAuthEmulator } from './helpers/auth-seed';
import { seedClientOnly } from './helpers/seed-users';

test.beforeEach(async () => {
  await clearFirestoreEmulator();
  await clearAuthEmulator();
});

test('E2E-3 — Devenir pro depuis dashboard client (AC6)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const user = await seedClientOnly();

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/mot de passe/i).fill(user.password);
  await page
    .getByRole('button', { name: /se connecter/i })
    .click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page
    .getByRole('button', { name: /ouvrir un restaurant/i })
    .click();
  await expect(page).toHaveURL(
    /\/restaurant\/register\?from=become-pro/,
  );

  await expect(
    page.getByText(/étape 3 sur 4/i),
  ).toBeVisible();

  await page
    .getByLabel(/nom du restaurant/i)
    .fill('Mon Resto Become Pro');
  await page
    .getByLabel(/description/i)
    .fill(
      'Restaurant du parcours become-pro pour test E2E (long enough).',
    );
  await page
    .getByRole('button', { name: /^Africaine$/ })
    .click();
  await page
    .getByLabel(/adresse/i)
    .fill('1 Rue Become Pro, 75002 Paris');
  await page.getByLabel(/téléphone/i).fill('+33111222333');
  await page
    .getByLabel(/email/i)
    .last()
    .fill('contact@becomepro.fr');
  await page
    .getByRole('button', { name: /continuer/i })
    .click();
  await page
    .getByRole('button', {
      name: /soumettre mon dossier/i,
    })
    .click();

  await expect(page).toHaveURL(/\/restaurant\/pending/);

  const userDoc = await getDocData(`users/${user.uid}`);
  expect(userDoc).not.toBeNull();
  expect(
    (userDoc!.roles as Record<string, unknown>)?.restaurant,
  ).toBeDefined();
  expect(
    (userDoc!.roles as Record<string, unknown>)?.client,
  ).toBeDefined();
});
