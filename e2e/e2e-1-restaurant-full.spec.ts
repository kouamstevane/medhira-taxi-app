import { test, expect } from '@playwright/test';
import {
  clearFirestoreEmulator,
  patchDoc,
  queryDocId,
  getDocData,
} from './helpers/firestore-seed';
import { clearAuthEmulator } from './helpers/auth-seed';
import { fetchVerificationCode } from './helpers/auth-seed';
import {
  sendStripeWebhook,
  buildAccountUpdatedEvent,
} from './helpers/stripe-mock';

test.beforeEach(async () => {
  await clearFirestoreEmulator();
  await clearAuthEmulator();
});

test("E2E-1 — Parcours restaurateur complet jusqu'à visibilité catalogue", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto('/');
  await page
    .getByRole('link', { name: /créer un compte/i })
    .click();
  await expect(page).toHaveURL(/\/auth\/role/);

  await page
    .getByRole('link', { name: /restaurateur/i })
    .click();
  await expect(page).toHaveURL(/\/restaurant\/register/);

  await page.getByLabel(/prénom/i).fill('Marc');
  await page
    .getByLabel(/nom/i, { exact: false })
    .first()
    .fill('Lefèvre');
  await page.getByLabel(/^email$/i).fill('marc-e2e1@test.fr');
  await page.getByLabel(/mot de passe/i).fill('password123');
  await page
    .getByRole('button', { name: /continuer/i })
    .click();

  await expect(page).toHaveURL(
    /\/auth\/verify-email|\/restaurant\/register\?step=2/,
  );
  const code = await fetchVerificationCode('marc-e2e1@test.fr', {
    timeoutMs: 8000,
  });
  await page.getByLabel(/code/i).fill(code);
  await page
    .getByRole('button', { name: /vérifier|valider/i })
    .click();

  await page.getByLabel(/nom du restaurant/i).fill('Le Bistrot E2E');
  await page
    .getByLabel(/description/i)
    .fill(
      'Restaurant test E2E avec description suffisamment longue.',
    );
  await page
    .getByRole('button', { name: /^Africaine$/ })
    .click();
  await page
    .getByLabel(/adresse/i)
    .fill('12 Rue de Test, 75002 Paris');
  await page.getByLabel(/téléphone/i).fill('+33123456789');
  await page
    .getByLabel(/email/i)
    .last()
    .fill('contact@bistrot-e2e.fr');
  await page
    .getByRole('button', { name: /continuer/i })
    .click();

  await page
    .getByRole('button', { name: /soumettre mon dossier/i })
    .click();
  await expect(page).toHaveURL(/\/restaurant\/pending/);

  await expect
    .poll(
      async () => {
        return await queryDocId(
          'restaurants',
          'name',
          '==',
          'Le Bistrot E2E',
        );
      },
      { timeout: 8000 },
    )
    .not.toBeNull();
  const restaurantId = await queryDocId(
    'restaurants',
    'name',
    '==',
    'Le Bistrot E2E',
  );
  expect(restaurantId).toBeTruthy();

  await patchDoc(`restaurants/${restaurantId}`, {
    status: 'approved',
    stripeConnectStatus: 'not_started',
  });

  await expect(page).toHaveURL(/\/restaurant\/dashboard/, {
    timeout: 8000,
  });

  await page
    .getByRole('button', {
      name: /activer les paiements|configurer stripe/i,
    })
    .click();
  await expect
    .poll(
      async () => {
        const doc = await getDocData<{
          stripeAccountId?: string;
        }>(`restaurants/${restaurantId}`);
        return doc?.stripeAccountId ?? null;
      },
      { timeout: 8000 },
    )
    .toBeTruthy();

  const restaurantDoc = await getDocData<{
    stripeAccountId: string;
  }>(`restaurants/${restaurantId}`);
  const stripeAccountId = restaurantDoc!.stripeAccountId;

  const event = buildAccountUpdatedEvent(stripeAccountId, {
    accountType: 'restaurant',
    restaurantId: restaurantId as string,
    ownerUid: 'unused-server-resolves',
  }, true);
  const webhook = await sendStripeWebhook(event);
  expect(webhook.status).toBe(200);

  await page.goto('/food');
  await expect(page.getByText('Le Bistrot E2E')).toBeVisible({
    timeout: 10000,
  });
});
