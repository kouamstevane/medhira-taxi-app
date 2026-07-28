import { test, expect } from '@playwright/test';
import { Timestamp } from 'firebase-admin/firestore';
import { clearAuthEmulator } from './helpers/auth-seed';
import { clearFirestoreEmulator, seedDoc } from './helpers/firestore-seed';
import { seedClientWithRestaurantApprovedStripeActive } from './helpers/seed-users';

test.beforeEach(async () => {
  await clearFirestoreEmulator();
  await clearAuthEmulator();
});

test('E2E-9 — Portail restaurant expose les statuts opérationnels et annulations avant pickup', async ({ page }) => {
  const owner = await seedClientWithRestaurantApprovedStripeActive();
  const createdAt = Timestamp.fromDate(new Date('2026-07-28T12:00:00.000Z'));

  for (const status of ['confirmed', 'accepted', 'preparing', 'ready', 'no_driver_available']) {
    await seedDoc(`food_orders/order-${status}`, {
      id: `order-${status}`,
      userId: 'client-e2e-status',
      restaurantId: owner.restaurantId,
      orderItems: [{ menuItemId: 'item-1', itemName: 'Plat test', itemQuantity: 1, itemPrice: 12 }],
      deliveryDistance: 2,
      isWeekend: false,
      deliveryAddress: '123 Rue Test',
      basePrice: 12,
      deliveryCost: 3,
      totalOrderPrice: 15,
      status,
      pickupCode: 'ABC123',
      paymentValidated: true,
      createdAt,
      updatedAt: createdAt,
    });
  }

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(owner.email);
  await page.getByLabel(/mot de passe/i).fill(owner.password);
  await page.getByRole('button', { name: /se connecter/i }).click();

  await page.goto(`/food/portal/${owner.restaurantId}/orders`);

  await expect(page.getByRole('button', { name: 'Confirmée' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Acceptée' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Préparation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prête' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aucun livreur' })).toBeVisible();

  await expect(page.getByText('Acceptée')).toBeVisible();
  await expect(page.getByText('Aucun livreur')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refuser' })).toHaveCount(5);
});
