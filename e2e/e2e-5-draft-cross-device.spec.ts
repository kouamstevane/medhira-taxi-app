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

test('E2E-5 — Reprise brouillon cross-device', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const user = await seedClientOnly();

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await pageA.goto('/login');
  await pageA.getByLabel(/email/i).fill(user.email);
  await pageA.getByLabel(/mot de passe/i).fill(user.password);
  await pageA
    .getByRole('button', { name: /se connecter/i })
    .click();
  await pageA.goto('/restaurant/register?from=become-pro');

  await pageA
    .getByLabel(/nom du restaurant/i)
    .fill('Bistrot CrossDevice');
  await pageA
    .getByLabel(/description/i)
    .fill(
      'Brouillon partiel pour test E2E-5 (long enough).',
    );
  await pageA.waitForTimeout(2200);

  const userDocAfterDraft = await getDocData(
    `users/${user.uid}`,
  );
  expect(userDocAfterDraft?.draftRestaurant).toBeDefined();
  await ctxA.close();

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await pageB.goto('/login');
  await pageB.getByLabel(/email/i).fill(user.email);
  await pageB.getByLabel(/mot de passe/i).fill(user.password);
  await pageB
    .getByRole('button', { name: /se connecter/i })
    .click();

  await expect(
    pageB.getByText(
      /inscription restaurateur en cours/i,
    ),
  ).toBeVisible();
  await pageB
    .getByRole('link', { name: /reprendre/i })
    .click();

  await expect(pageB).toHaveURL(
    /\/restaurant\/register\?from=become-pro/,
  );
  await expect(
    pageB.getByLabel(/nom du restaurant/i),
  ).toHaveValue('Bistrot CrossDevice');

  await pageB
    .getByRole('button', { name: /^Africaine$/ })
    .click();
  await pageB
    .getByLabel(/adresse/i)
    .fill('1 Rue CrossDevice');
  await pageB.getByLabel(/téléphone/i).fill('+33999888777');
  await pageB
    .getByLabel(/email/i)
    .last()
    .fill('contact@crossdevice.fr');
  await pageB
    .getByRole('button', { name: /continuer/i })
    .click();
  await pageB
    .getByRole('button', {
      name: /soumettre mon dossier/i,
    })
    .click();

  await expect(pageB).toHaveURL(/\/restaurant\/pending/);
  await ctxB.close();
});
