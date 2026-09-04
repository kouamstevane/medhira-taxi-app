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
  await seedDoc(`wallets/${uid}`, {
    uid,
    balance: 1000,
    currency: 'CAD',
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

export async function seedDriverApprovedOnline(): Promise<SeededUser> {
  const uid = 'seed-driver-approved';
  const email = 'driver-approved@e2e.test';
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
      driver: {
        enabled: true,
        joinedAt: new Date('2026-02-15').toISOString(),
      },
    },
    activeRole: 'driver',
    lastActiveRole: 'driver',
    firstName: 'Driver',
    lastName: 'Approved',
    createdAt: new Date('2026-01-01').toISOString(),
    updatedAt: new Date('2026-01-01').toISOString(),
  });
  await seedDoc(`drivers/${uid}`, {
    uid,
    status: 'approved',
    isAvailable: true,
    stripeAccountStatus: 'active',
    stripePayoutsEnabled: true,
    firstName: 'Driver',
    lastName: 'Approved',
    phone: '+14165551111',
    currentLocation: {
      lat: 43.6532,
      lng: -79.3832,
    },
    car: {
      type: 'Eco',
      model: 'Toyota Prius',
      plate: 'E2E-TAXI-001',
      color: 'white',
    },
    rating: 4.9,
    tripsAccepted: 10,
    tripsDeclined: 1,
    updatedAt: new Date().toISOString(),
  });
  return { uid, email, password: 'password123' };
}

export async function seedPersonalDriverClient(): Promise<SeededUser> {
  const uid = 'seed-pd-client';
  const email = 'client-pd@e2e.test';
  await seedAuthUser({ uid, email, password: 'password123', emailVerified: true });
  await seedDoc(`users/${uid}`, {
    uid,
    email,
    emailVerified: true,
    roles: { client: { enabled: true, joinedAt: '2026-01-01' } },
    activeRole: 'client',
    lastActiveRole: 'client',
    firstName: 'Client',
    lastName: 'PersonalDriver',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  });
  await seedDoc('personal_driver_subscriptions/sub-e2e-1', {
    id: 'sub-e2e-1',
    userId: uid,
    planId: 'classic',
    selectedPlanId: 'classic',
    status: 'active',
    paymentStatus: 'succeeded',
    pickupAddress: '100 rue Principale, Montreal',
    destinationAddress: '500 rue Universite, Montreal',
    tripType: 'round_trip',
    weekdays: [1, 2, 3, 4, 5],
    departureTime: '08:00',
    returnTime: '17:00',
    startDate: '2026-08-01',
    periodStartAtUtc: new Date(Date.now() - 5 * 86400000).toISOString(),
    periodEndAtUtc: new Date(Date.now() + 25 * 86400000).toISOString(),
    monthlyDistanceKm: 440,
    remainingDistanceKm: 396,
    passengerCount: 1,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  });
  await seedDoc('personal_driver_trips/trip-e2e-client-1', {
    id: 'trip-e2e-client-1',
    subscriptionId: 'sub-e2e-1',
    userId: uid,
    assignedDriverId: 'seed-pd-driver',
    status: 'scheduled',
    scheduledAtIso: new Date(Date.now() + 86400000).toISOString(),
    pickupAddress: '100 rue Principale, Montreal',
    destinationAddress: '500 rue Universite, Montreal',
    tripType: 'round_trip',
    distanceKm: 22,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { uid, email, password: 'password123' };
}

export async function seedPersonalDriverDriver(): Promise<SeededUser> {
  const uid = 'seed-pd-driver';
  const email = 'driver-pd@e2e.test';
  await seedAuthUser({ uid, email, password: 'password123', emailVerified: true });
  await seedDoc(`users/${uid}`, {
    uid,
    email,
    emailVerified: true,
    roles: { driver: { enabled: true, joinedAt: '2026-01-01' } },
    activeRole: 'driver',
    lastActiveRole: 'driver',
    firstName: 'Chauffeur',
    lastName: 'PersonalDriver',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  });
  await seedDoc(`drivers/${uid}`, {
    uid,
    status: 'approved',
    isAvailable: true,
    name: 'Chauffeur PersonalDriver',
    firstName: 'Chauffeur',
    lastName: 'PersonalDriver',
  });
  await seedDoc('personal_driver_trips/trip-e2e-driver-mission', {
    id: 'trip-e2e-driver-mission',
    subscriptionId: 'sub-e2e-1',
    userId: 'seed-pd-client',
    assignedDriverId: uid,
    status: 'driver_assigned',
    scheduledAtIso: new Date(Date.now() + 3600000).toISOString(),
    pickupAddress: '100 rue Principale, Montreal',
    destinationAddress: '500 rue Universite, Montreal',
    tripType: 'round_trip',
    distanceKm: 22,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { uid, email, password: 'password123' };
}

export async function seedPersonalDriverAdmin(): Promise<SeededUser> {
  const uid = 'seed-pd-admin';
  const email = 'admin-pd@e2e.test';
  await seedAuthUser({ uid, email, password: 'password123', emailVerified: true });
  await seedDoc(`users/${uid}`, {
    uid,
    email,
    emailVerified: true,
    isAdmin: true,
    role: 'admin',
    activeRole: 'admin',
    lastActiveRole: 'admin',
    firstName: 'Admin',
    lastName: 'Medjira',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  });
  await seedDoc(`admins/${uid}`, {
    uid,
    email,
    role: 'admin',
    createdAt: '2026-01-01',
  });
  await seedDoc('vehicles/veh-e2e-1', {
    id: 'veh-e2e-1',
    registration: 'MED-777',
    status: 'available',
    isAvailable: true,
  });
  await seedDoc('drivers/driver-avail-1', {
    id: 'driver-avail-1',
    name: 'Luc Chauffeur',
    status: 'approved',
    isAvailable: true,
  });
  return { uid, email, password: 'password123' };
}
