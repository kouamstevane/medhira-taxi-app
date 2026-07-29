import { test, expect } from '@playwright/test';
import { Timestamp } from 'firebase-admin/firestore';
import { clearAuthEmulator, seedAuthUser } from './helpers/auth-seed';
import { clearFirestoreEmulator, seedDoc } from './helpers/firestore-seed';

test.beforeEach(async () => {
  await clearFirestoreEmulator();
  await clearAuthEmulator();
});

test('E2E-10 — Cycle livraison restaurant complet côté livreur et client', async ({ page }) => {
  test.setTimeout(180_000);

  const client = { uid: 'food-client-lifecycle', email: 'food-client-lifecycle@e2e.test', password: 'password123' };
  const owner = { uid: 'food-owner-lifecycle', email: 'food-owner-lifecycle@e2e.test', password: 'password123' };
  const driver = { uid: 'food-driver-lifecycle', email: 'food-driver-lifecycle@e2e.test', password: 'password123' };
  const restaurantId = 'food-rest-lifecycle';
  const orderId = 'food-order-lifecycle';
  const createdAt = Timestamp.fromDate(new Date('2026-07-29T12:00:00.000Z'));

  await seedAuthUser({ ...client, emailVerified: true });
  await seedAuthUser({ ...owner, emailVerified: true });
  await seedAuthUser({
    ...driver,
    emailVerified: true,
    customClaims: { activeDeliveryOrderId: orderId },
  });

  await seedDoc(`users/${client.uid}`, {
    uid: client.uid,
    email: client.email,
    emailVerified: true,
    roles: { client: { enabled: true, joinedAt: createdAt } },
    activeRole: 'client',
    firstName: 'Client',
    lastName: 'Lifecycle',
    address: '100 Client Street, Edmonton',
    createdAt,
    updatedAt: createdAt,
  });
  await seedDoc(`users/${owner.uid}`, {
    uid: owner.uid,
    email: owner.email,
    emailVerified: true,
    roles: {
      client: { enabled: true, joinedAt: createdAt },
      restaurant: { restaurantId, joinedAt: createdAt },
    },
    activeRole: 'restaurant',
    lastActiveRole: 'restaurant',
    createdAt,
    updatedAt: createdAt,
  });
  await seedDoc(`users/${driver.uid}`, {
    uid: driver.uid,
    email: driver.email,
    emailVerified: true,
    roles: {
      client: { enabled: true, joinedAt: createdAt },
      driver: { joinedAt: createdAt },
    },
    activeRole: 'driver',
    lastActiveRole: 'driver',
    firstName: 'Driver',
    lastName: 'Lifecycle',
    createdAt,
    updatedAt: createdAt,
  });
  await seedDoc(`drivers/${driver.uid}`, {
    uid: driver.uid,
    status: 'approved',
    isAvailable: true,
    driverType: 'livreur',
    cityId: 'edmonton',
    activeDeliveryOrderId: orderId,
    firstName: 'Driver',
    lastName: 'Lifecycle',
    phone: '+14165550123',
    rating: 4.8,
    createdAt,
    updatedAt: createdAt,
  });
  await seedDoc(`restaurants/${restaurantId}`, {
    id: restaurantId,
    ownerId: owner.uid,
    status: 'approved',
    stripeConnectStatus: 'active',
    isOpen: true,
    name: 'Le Cycle Food',
    description: 'Restaurant E2E cycle livraison complet.',
    cuisineType: ['Africaine'],
    avgPricePerPerson: 20,
    commissionRate: 15,
    address: '1 Restaurant Street, Edmonton',
    phone: '+14165550000',
    email: 'cycle@food.test',
    location: { lat: 53.5461, lng: -113.4938 },
    createdAt,
    updatedAt: createdAt,
  });
  await seedDoc(`food_orders/${orderId}`, {
    id: orderId,
    userId: client.uid,
    restaurantId,
    restaurantOwnerId: owner.uid,
    driverId: driver.uid,
    driverName: 'Driver Lifecycle',
    driverPhone: '+14165550123',
    orderItems: [{ menuItemId: 'item-1', itemName: 'Plat cycle', itemQuantity: 1, itemPrice: 30 }],
    deliveryDistance: 5,
    isWeekend: true,
    deliveryAddress: '100 Client Street, Edmonton',
    deliveryLocation: { lat: 53.55, lng: -113.5 },
    basePrice: 30,
    deliveryCost: 9,
    totalOrderPrice: 39,
    status: 'accepted',
    pickupCode: 'ABC123',
    paymentValidated: true,
    paymentMethod: 'wallet',
    restaurantName: 'Le Cycle Food',
    restaurantPhone: '+14165550000',
    restaurantAddress: { address: '1 Restaurant Street, Edmonton', lat: 53.5461, lng: -113.4938 },
    customerName: 'Client Lifecycle',
    customerPhone: '+14165550999',
    cityId: 'edmonton',
    deliveryPreference: 'leave_at_door',
    clientNeighbourhood: 'Downtown',
    orderNumber: '#42',
    createdAt,
    updatedAt: createdAt,
  });
  await seedDoc(`food_delivery_orders/${orderId}`, {
    orderId,
    driverId: driver.uid,
    restaurantId,
    clientId: client.uid,
    cityId: 'edmonton',
    status: 'assigned',
    assignmentAttempt: 1,
    deliveryPreference: 'leave_at_door',
    restaurantAddress: { address: '1 Restaurant Street, Edmonton', lat: 53.5461, lng: -113.4938 },
    clientNeighbourhood: 'Downtown',
    orderItems: [{ name: 'Plat cycle', qty: 1, price: 30 }],
    orderNumber: '#42',
    restaurantName: 'Le Cycle Food',
    restaurantPhone: '+14165550000',
    clientPhone: '+14165550999',
    totalAmount: 39,
    driverEarnings: 7.2,
    cancellationImpactOnStats: true,
    createdAt,
    updatedAt: createdAt,
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/email/i).fill(driver.email);
  await page.getByPlaceholder(/mot de passe/i).fill(driver.password);
  await page.getByRole('button', { name: /se connecter/i }).click();

  await page.goto(`/driver/delivery/${orderId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Nouvelle commande')).toBeVisible();
  await page.getByRole('button', { name: 'Accepter' }).click();
  await expect(page.getByText('En route vers le restaurant')).toBeVisible();
  await page.getByRole('button', { name: /arrivé au restaurant/i }).click();
  await expect(page.getByText('Arrivé au restaurant')).toBeVisible();
  await page.getByRole('button', { name: /En attente de la commande/i }).click();
  await expect(page.getByText('En attente de la commande')).toBeVisible();
  await expect(page.getByText('100 Client Street, Edmonton')).not.toBeVisible();

  await page.getByPlaceholder(/code de récupération/i).fill('ABC123');
  await page.getByRole('button', { name: /j'ai récupéré la commande/i }).click();
  await expect(page.getByRole('button', { name: /Je pars vers le client/i })).toBeVisible();
  await expect(page.getByText('100 Client Street, Edmonton')).toBeVisible();
  await page.getByRole('button', { name: /Je pars vers le client/i }).click();
  await expect(page.getByRole('button', { name: /Je suis arrivé chez le client/i })).toBeVisible();
  await page.getByRole('button', { name: /Je suis arrivé chez le client/i }).click();
  await expect(page.getByText('Déposer à la porte')).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'proof.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await page.getByRole('button', { name: /confirmer la livraison/i }).click();
  await expect(page).toHaveURL(/\/driver\/dashboard/);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/email/i).fill(client.email);
  await page.getByPlaceholder(/mot de passe/i).fill(client.password);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await page.goto(`/food/orders/${orderId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Livrée')).toBeVisible();
  await expect(page.getByText(/Comment s'est passée votre commande/i)).toBeVisible();
});
