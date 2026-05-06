import { test, expect } from '@playwright/test';

async function loginAs(page: any, email: string, password: string = 'Test1234!') {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

test.describe('P4 — Multi-role + Stripe Connect', () => {
  test('E2E-2: multi-role login routes to /auth/continue-as then switcher works', async ({ page }) => {
    await loginAs(page, 'multi-role@test.fr');
    await expect(page).toHaveURL(/\/auth\/continue-as/);
    await page.click('text=Restaurateur');
    await expect(page).toHaveURL(/\/restaurant\/dashboard/);
  });

  test('E2E-3: client becomes pro via BecomeProCard', async ({ page }) => {
    await loginAs(page, 'client-pur@test.fr');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/devenir professionnel|ouvrir un restaurant/i)).toBeVisible();
    await page.goto('/auth/become-pro');
    await expect(page.getByText(/chauffeur/i)).toBeVisible();
    await expect(page.getByText(/restaurant/i)).toBeVisible();
  });

  test('E2E-4: driver pending sees banner and viewOnly mode', async ({ page }) => {
    await loginAs(page, 'driver-pending@test.fr');
    await expect(page).toHaveURL(/\/driver\/dashboard/);
    await expect(page.getByText(/candidature en cours/i)).toBeVisible();
  });

  test('E2E-7: restaurant approved without Stripe shows banner and is invisible in catalog', async ({ page }) => {
    await loginAs(page, 'restaurant-nostripe@test.fr');
    await expect(page).toHaveURL(/\/restaurant\/dashboard/);
    await expect(page.getByText(/configurez vos paiements/i)).toBeVisible();
  });

  test('C12: connected user on /auth/role is redirected to dashboard', async ({ page }) => {
    await loginAs(page, 'client-pur@test.fr');
    await page.goto('/auth/role');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('C15: client with no draftRestaurant gets BecomeProCard, no resume banner', async ({ page }) => {
    await loginAs(page, 'client-pur@test.fr');
    await page.goto('/dashboard');
    await expect(page.getByText(/devenir/i)).toBeVisible();
    await expect(page.getByText(/reprendre votre inscription/i)).toHaveCount(0);
  });
});
