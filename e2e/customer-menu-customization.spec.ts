import { test, expect } from '@playwright/test';
import { Timestamp } from 'firebase-admin/firestore';
import { buildMenuSearchPrefixes } from '../src/utils/menu-catalog';
import { richCustomerMenuSeedItem } from '../src/quality/customer-menu-v2-fixtures';
import { clearFirestoreEmulator, seedDoc } from './helpers/firestore-seed';

const RESTAURANT_ID = 'rest-customer-menu-v2-e2e-001';
const RESTAURANT_NAME = 'Le Bistrot V2 E2E';
const OPENED_AT = Timestamp.fromDate(new Date('2026-08-19T09:00:00.000Z'));

test.beforeEach(async () => {
  await clearFirestoreEmulator();
  await seedDoc(`restaurants/${RESTAURANT_ID}`, {
    id: RESTAURANT_ID,
    ownerId: 'rest-owner-customer-menu-v2-e2e',
    status: 'approved',
    stripeConnectStatus: 'active',
    name: RESTAURANT_NAME,
    description: 'Parcours client V2.',
    cuisineType: ['Italienne'],
    address: '10 Rue des Tests, Paris',
    phone: '+33123456789',
    email: 'menu-v2-e2e@restaurant.test',
    avgPricePerPerson: 18,
    commissionRate: 12,
    rating: 4.8,
    totalReviews: 128,
    openingHours: {
      monday: { open: '00:00', close: '23:59', closed: false },
      tuesday: { open: '00:00', close: '23:59', closed: false },
      wednesday: { open: '00:00', close: '23:59', closed: false },
      thursday: { open: '00:00', close: '23:59', closed: false },
      friday: { open: '00:00', close: '23:59', closed: false },
      saturday: { open: '00:00', close: '23:59', closed: false },
      sunday: { open: '00:00', close: '23:59', closed: false },
    },
    createdAt: OPENED_AT,
    updatedAt: OPENED_AT,
  });

  await seedDoc(`restaurants/${RESTAURANT_ID}/menu_items/${richCustomerMenuSeedItem.id}`, {
    ...richCustomerMenuSeedItem,
    restaurantId: RESTAURANT_ID,
    description: richCustomerMenuSeedItem.description,
    searchPrefixes: buildMenuSearchPrefixes([richCustomerMenuSeedItem.name, richCustomerMenuSeedItem.category]),
    isAvailable: true,
    source: 'manual',
    createdAt: OPENED_AT,
    updatedAt: OPENED_AT,
  });
});

test('customer can inspect and customize a rich menu item on mobile', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/food/restaurant?id=${RESTAURANT_ID}`);

  await expect(page.getByRole('heading', { name: RESTAURANT_NAME })).toBeVisible();
  await page.getByRole('button', { name: `Ajouter ${richCustomerMenuSeedItem.name} au panier` }).click();

  await expect(page.getByRole('heading', { name: 'Personnalisation' })).toBeVisible();
  await expect(page.getByText('Lait')).toBeVisible();
  await expect(page.getByText('Œufs')).toBeVisible();
  await expect(page.getByText('540 kcal')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Classique' })).toBeChecked();

  await page.getByRole('radio', { name: 'Format famille' }).check();
  await page.getByRole('checkbox', { name: 'Café serré' }).check();
  await page.getByRole('button', { name: 'Ajouter au panier' }).click();

  await expect(page.getByText('Voir le panier')).toBeVisible();
  await expect(page.getByText(RESTAURANT_NAME)).toBeVisible();
});
