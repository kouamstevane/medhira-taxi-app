import { test, expect } from '@playwright/test';
import { Timestamp } from 'firebase-admin/firestore';
import { buildMenuSearchPrefixes } from '../src/utils/menu-catalog';
import { clearFirestoreEmulator, seedDoc } from './helpers/firestore-seed';

const RESTAURANT_ID = 'rest-menu-e2e-001';
const RESTAURANT_NAME = 'Le Bistrot Menu E2E';
const OPENED_AT = Timestamp.fromDate(new Date('2026-08-19T09:00:00.000Z'));

test.beforeEach(async () => {
  await clearFirestoreEmulator();
});

function defaultOpeningHours() {
  return {
    monday: { open: '00:00', close: '23:59', closed: false },
    tuesday: { open: '00:00', close: '23:59', closed: false },
    wednesday: { open: '00:00', close: '23:59', closed: false },
    thursday: { open: '00:00', close: '23:59', closed: false },
    friday: { open: '00:00', close: '23:59', closed: false },
    saturday: { open: '00:00', close: '23:59', closed: false },
    sunday: { open: '00:00', close: '23:59', closed: false },
  };
}

async function seedRestaurantWithMenu() {
  await seedDoc(`restaurants/${RESTAURANT_ID}`, {
    id: RESTAURANT_ID,
    ownerId: 'rest-owner-menu-e2e',
    status: 'approved',
    stripeConnectStatus: 'active',
    name: RESTAURANT_NAME,
    description: 'Catalogue client E2E pour recherche, catégories et pagination.',
    cuisineType: ['Italienne'],
    address: '10 Rue des Tests, Paris',
    phone: '+33123456789',
    email: 'menu-e2e@restaurant.test',
    avgPricePerPerson: 18,
    commissionRate: 12,
    rating: 4.8,
    totalReviews: 128,
    openingHours: defaultOpeningHours(),
    createdAt: OPENED_AT,
    updatedAt: OPENED_AT,
  });

  const menuItems = [
    {
      id: 'boisson-01-citronnade-maison',
      name: 'Citronnade Maison',
      category: 'Boissons',
      price: 450,
    },
    {
      id: 'dessert-01-creme-brulee',
      name: 'Creme Brulee Signature',
      category: 'Desserts',
      price: 950,
    },
    ...Array.from({ length: 23 }, (_, index) => ({
      id: `dessert-${String(index + 2).padStart(2, '0')}-mousse`,
      name: `Dessert ${String(index + 2).padStart(2, '0')}`,
      category: 'Desserts',
      price: 900 + index,
    })),
    {
      id: 'dessert-25-panna-cotta',
      name: 'Panna Cotta Vanille',
      category: 'Desserts',
      price: 1200,
    },
    {
      id: 'dessert-26-millefeuille',
      name: 'Millefeuille Caramel',
      category: 'Desserts',
      price: 1250,
    },
    {
      id: 'dessert-99-tiramisu-maison',
      name: 'Tiramisu Maison',
      category: 'Desserts',
      price: 1400,
    },
    {
      id: 'pizza-01-margherita-classique',
      name: 'Pizza Margherita Classique',
      category: 'Pizzas',
      price: 1450,
    },
    {
      id: 'pizza-02-margherita-bufala',
      name: 'Pizza Margherita Bufala',
      category: 'Pizzas',
      price: 1650,
    },
  ];

  for (const item of menuItems) {
    await seedDoc(`restaurants/${RESTAURANT_ID}/menu_items/${item.id}`, {
      id: item.id,
      restaurantId: RESTAURANT_ID,
      name: item.name,
      description: `${item.name} prepare pour le test Playwright.`,
      price: item.price,
      category: item.category,
      searchPrefixes: buildMenuSearchPrefixes([item.name, item.category]),
      isAvailable: true,
      source: 'manual',
      createdAt: OPENED_AT,
      updatedAt: OPENED_AT,
    });
  }
}

test('customer can search, filter desserts, paginate, and quick-add from the restaurant menu on mobile', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await seedRestaurantWithMenu();

  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`/food/restaurant?id=${RESTAURANT_ID}`);

  await expect(page.getByRole('heading', { name: RESTAURANT_NAME })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Rechercher un plat' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Desserts 27' })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Rechercher un plat' }).fill('Margherita');

  await expect(page.getByRole('button', { name: 'Réinitialiser' })).toBeVisible();
  await expect(page.getByText('Pizza Margherita Classique')).toBeVisible();
  await expect(page.getByText('Pizza Margherita Bufala')).toBeVisible();
  await expect(page.getByText('Tiramisu Maison')).not.toBeVisible();

  await page.getByRole('button', { name: 'Réinitialiser' }).click();
  await page.getByRole('button', { name: 'Desserts 27' }).click();

  await expect(page.getByText('Dessert 02')).toBeVisible();
  await expect(page.getByText('Tiramisu Maison')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Afficher plus de plats' })).toBeVisible();

  await page.getByRole('button', { name: 'Afficher plus de plats' }).click();

  await expect(page.getByText('Tiramisu Maison')).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter Tiramisu Maison au panier' }).click();

  await expect(page.getByText('Voir le panier')).toBeVisible();
  await expect(page.getByText(RESTAURANT_NAME)).toBeVisible();
  await expect(page.getByText('1')).toBeVisible();
});
