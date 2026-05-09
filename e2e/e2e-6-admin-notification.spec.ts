import { test, expect } from '@playwright/test';
import { clearFirestoreEmulator } from './helpers/firestore-seed';
import { clearAuthEmulator } from './helpers/auth-seed';
import {
  clearEmailCapture,
  waitForEmail,
} from './helpers/email-capture';
import { seedClientOnly } from './helpers/seed-users';

test.beforeEach(async () => {
  await clearFirestoreEmulator();
  await clearAuthEmulator();
  await clearEmailCapture();
});

test('E2E-6 — Notification admin sur soumission restaurant', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const user = await seedClientOnly();

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/mot de passe/i).fill(user.password);
  await page
    .getByRole('button', { name: /se connecter/i })
    .click();
  await page.goto('/restaurant/register?from=become-pro');

  await page
    .getByLabel(/nom du restaurant/i)
    .fill('Bistrot Notif Admin');
  await page
    .getByLabel(/description/i)
    .fill(
      'Soumission qui doit déclencher email admin.',
    );
  await page
    .getByRole('button', { name: /^Africaine$/ })
    .click();
  await page
    .getByLabel(/adresse/i)
    .fill('1 Rue Notif, 75002 Paris');
  await page.getByLabel(/téléphone/i).fill('+33144556677');
  await page
    .getByLabel(/email/i)
    .last()
    .fill('contact@notif-admin.fr');
  await page
    .getByRole('button', { name: /continuer/i })
    .click();
  await page
    .getByRole('button', {
      name: /soumettre mon dossier/i,
    })
    .click();
  await expect(page).toHaveURL(/\/restaurant\/pending/);

  const adminEmail = await waitForEmail(
    (e) =>
      e.subject
        .toLowerCase()
        .includes('nouvelle inscription restaurateur'),
    10000,
  );
  expect(adminEmail.html || adminEmail.text).toContain(
    '/admin/restaurants',
  );
  expect(adminEmail.html || adminEmail.text).toMatch(
    /Bistrot Notif Admin/,
  );
});
