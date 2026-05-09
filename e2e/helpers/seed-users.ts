import { seedAuthUser } from './auth-seed';
import { seedDoc } from './firestore-seed';

export interface SeededUser {
  uid: string;
  email: string;
  password: string;
}

export async function seedClientOnly(): Promise<SeededUser> {
  const uid = 'seed-client-only';
  const email = 'client@e2e.test';
  await seedAuthUser({
    uid,
    email,
    password: 'password123',
    emailVerified: true,
  });
  await seedDoc(`users/${uid}`, {
    uid,
    email,
    emailVerified: true,
    roles: {
      client: {
        enabled: true,
        joinedAt: new Date('2026-01-01').toISOString(),
      },
    },
    activeRole: 'client',
    lastActiveRole: 'client',
    firstName: 'Client',
    lastName: 'E2E',
    createdAt: new Date('2026-01-01').toISOString(),
    updatedAt: new Date('2026-01-01').toISOString(),
  });
  return { uid, email, password: 'password123' };
}

export async function seedClientWithRestaurantApprovedStripeActive(): Promise<
  SeededUser & { restaurantId: string }
> {
  const uid = 'seed-client-resto-stripe';
  const email = 'multi@e2e.test';
  const restaurantId = 'rest-multi-001';
  await seedAuthUser({
    uid,
    email,
    password: 'password123',
    emailVerified: true,
  });
  await seedDoc(`users/${uid}`, {
    uid,
    email,
    emailVerified: true,
    roles: {
      client: {
        enabled: true,
        joinedAt: new Date('2026-01-01').toISOString(),
      },
      restaurant: {
        joinedAt: new Date('2026-02-01').toISOString(),
        restaurantId,
      },
    },
    activeRole: 'client',
    lastActiveRole: 'restaurant',
  });
  await seedDoc(`restaurants/${restaurantId}`, {
    id: restaurantId,
    ownerId: uid,
    status: 'approved',
    stripeConnectStatus: 'active',
    name: 'Le Bistrot Multi',
    description: 'Restaurant multi-rôle pour test E2E.',
    cuisineType: ['Africaine'],
    address: '1 Rue Multi, 75002 Paris',
    phone: '+33100000001',
    email: 'multi@bistrot.fr',
    openingHours: defaultOpeningHours(),
  });
  return { uid, email, password: 'password123', restaurantId };
}

export async function seedDriverPending(): Promise<SeededUser> {
  const uid = 'seed-driver-pending';
  const email = 'driver-pending@e2e.test';
  await seedAuthUser({
    uid,
    email,
    password: 'password123',
    emailVerified: true,
  });
  await seedDoc(`users/${uid}`, {
    uid,
    email,
    emailVerified: true,
    roles: {
      client: {
        enabled: true,
        joinedAt: new Date('2026-01-01').toISOString(),
      },
      driver: { joinedAt: new Date('2026-02-15').toISOString() },
    },
    activeRole: 'driver',
    lastActiveRole: 'driver',
  });
  await seedDoc(`drivers/${uid}`, {
    uid,
    status: 'pending',
    firstName: 'Driver',
    lastName: 'Pending',
  });
  return { uid, email, password: 'password123' };
}

export async function seedRestaurantApprovedNotStarted(): Promise<
  SeededUser & { restaurantId: string }
> {
  const uid = 'seed-resto-no-stripe';
  const email = 'no-stripe@e2e.test';
  const restaurantId = 'rest-no-stripe-001';
  await seedAuthUser({
    uid,
    email,
    password: 'password123',
    emailVerified: true,
  });
  await seedDoc(`users/${uid}`, {
    uid,
    email,
    emailVerified: true,
    roles: {
      client: {
        enabled: true,
        joinedAt: new Date('2026-01-01').toISOString(),
      },
      restaurant: {
        joinedAt: new Date('2026-02-01').toISOString(),
        restaurantId,
      },
    },
    activeRole: 'restaurant',
    lastActiveRole: 'restaurant',
  });
  await seedDoc(`restaurants/${restaurantId}`, {
    id: restaurantId,
    ownerId: uid,
    status: 'approved',
    stripeConnectStatus: 'not_started',
    name: 'Le Bistrot Sans Stripe',
    description:
      'Approuvé mais Stripe pas démarré pour test E2E-7.',
    cuisineType: ['Africaine'],
    address: '1 Rue Sans Stripe, 75002 Paris',
    phone: '+33100000002',
    email: 'no-stripe@bistrot.fr',
    openingHours: defaultOpeningHours(),
  });
  return { uid, email, password: 'password123', restaurantId };
}

function defaultOpeningHours() {
  const days = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];
  return Object.fromEntries(
    days.map((d) => [
      d,
      { open: '09:00', close: '22:00', closed: d === 'sunday' },
    ]),
  );
}
