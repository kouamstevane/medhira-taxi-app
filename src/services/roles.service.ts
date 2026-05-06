/**
 * Service roles — source de vérité pour la lecture du statut effectif d'un rôle.
 *
 * Le statut d'un rôle pro est stocké sur sa collection métier (drivers/{uid}.status,
 * restaurants/{id}.status). Ce service centralise la lecture indirecte pour éviter
 * la divergence entre `users.roles.*` et la collection métier.
 *
 * Voir spec §4.2.
 */

import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ActiveRole, UserData } from '@/types/user';

export type EffectiveRoleStatus =
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'suspended'
  | 'draft'
  | 'missing';

export async function getEffectiveRoleStatus(
  user: UserData,
  role: ActiveRole,
): Promise<EffectiveRoleStatus> {
  if (role === 'client') return 'approved';

  if (role === 'driver') {
    if (user.roles.driver == null) return 'missing';
    const driverDoc = await getDoc(doc(db, 'drivers', user.uid));
    if (!driverDoc.exists()) return 'missing';
    return (driverDoc.data().status as EffectiveRoleStatus) ?? 'missing';
  }

  if (role === 'restaurant') {
    if (user.roles.restaurant == null) return 'missing';
    const restoDoc = await getDoc(doc(db, 'restaurants', user.roles.restaurant.restaurantId));
    if (!restoDoc.exists()) return 'missing';
    const data = restoDoc.data();
    if (data.ownerId !== user.uid) return 'missing'; // garde-fou intégrité
    // Mappe pending_approval -> pending pour homogénéité
    const raw = data.status as string;
    if (raw === 'pending_approval') return 'pending';
    return raw as EffectiveRoleStatus;
  }

  return 'missing';
}

export async function isApprovedDriver(user: UserData): Promise<boolean> {
  return (await getEffectiveRoleStatus(user, 'driver')) === 'approved';
}

export async function isApprovedRestaurateur(user: UserData): Promise<boolean> {
  return (await getEffectiveRoleStatus(user, 'restaurant')) === 'approved';
}

/**
 * Auto-réparation du rôle client manquant (cas C2 — doc corrompu).
 * Autorisée par les rules §8.
 */
export async function ensureClientRole(user: UserData): Promise<void> {
  if (user.roles.client?.enabled === true) return;
  await updateDoc(doc(db, 'users', user.uid), {
    'roles.client': { enabled: true, joinedAt: serverTimestamp() },
    updatedAt: serverTimestamp(),
  });
}

/**
 * Bascule l'activeRole côté Firestore (le rôle doit déjà exister sur le user).
 * Pose lastActiveRole en même temps pour mémoriser le dernier choix.
 */
export async function setActiveRole(user: UserData, role: ActiveRole): Promise<void> {
  if (role !== 'client' && user.roles[role] == null) {
    throw new Error(`Cannot set activeRole to "${role}" — role not present on user`);
  }
  await updateDoc(doc(db, 'users', user.uid), {
    activeRole: role,
    lastActiveRole: role,
    updatedAt: serverTimestamp(),
  });
}

export type StripeConnectStatus = 'not_started' | 'in_progress' | 'active' | 'restricted';
export type RestaurantStatus = 'pending' | 'pending_approval' | 'approved' | 'rejected' | 'suspended';
export type DriverStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';

export type RestaurantEffectiveStatus = {
  status: RestaurantStatus;
  stripeConnectStatus: StripeConnectStatus;
};

export function toRestaurantEffectiveStatus(
  data: Record<string, unknown> | undefined,
): RestaurantEffectiveStatus | undefined {
  if (!data) return undefined;
  return {
    status: (data.status ?? 'pending_approval') as RestaurantStatus,
    stripeConnectStatus: (data.stripeConnectStatus ?? 'not_started') as StripeConnectStatus,
  };
}

export interface RouteContext {
  driverStatus?: DriverStatus;
  restaurantStatus?: RestaurantStatus;
  stripeConnectStatus?: StripeConnectStatus;
}

/**
 * Routage post-login / post-switcher selon la matrice spec §4.4.
 *
 * Règle d'or : approuvé ⇒ dashboard accessible (pour configurer Stripe).
 * Visible catalogue ⇒ approuvé ET Stripe actif (calculé ailleurs, hors routage).
 */
export function getDashboardRouteFor(role: ActiveRole, ctx: RouteContext = {}): string {
  if (role === 'client') return '/dashboard';

  if (role === 'driver') {
    switch (ctx.driverStatus) {
      case 'rejected':
        return '/driver/pending';
      case 'suspended':
        return '/driver/suspended';
      default:
        return '/driver/dashboard'; // pending / approved / draft → page driver gère lecture seule
    }
  }

  if (role === 'restaurant') {
    switch (ctx.restaurantStatus) {
      case 'pending':
      case 'pending_approval':
      case 'rejected':
        return '/restaurant/pending';
      case 'suspended':
        return '/restaurant/suspended';
      case 'approved':
        return '/restaurant/dashboard';
      default:
        return '/restaurant/pending';
    }
  }

  return '/dashboard';
}

export function getRouteForPostLogin(
  userData: UserData,
  statuses: { driver?: DriverStatus; restaurant?: RestaurantEffectiveStatus },
): string {
  const ownedRoles: ActiveRole[] = [];
  if (userData.roles?.client) ownedRoles.push('client');
  if (userData.roles?.driver) ownedRoles.push('driver');
  if (userData.roles?.restaurant) ownedRoles.push('restaurant');

  if (ownedRoles.length === 0) {
    return '/dashboard';
  }

  if (ownedRoles.length === 1) {
    const role = ownedRoles[0];
    return getDashboardRouteFor(role, {
      driverStatus: role === 'driver' ? statuses.driver : undefined,
      restaurantStatus: statuses.restaurant?.status,
      stripeConnectStatus: statuses.restaurant?.stripeConnectStatus,
    });
  }

  const last = userData.lastActiveRole as ActiveRole | undefined;
  if (last && ownedRoles.includes(last)) {
    return getDashboardRouteFor(last, {
      driverStatus: last === 'driver' ? statuses.driver : undefined,
      restaurantStatus: last === 'restaurant' ? statuses.restaurant?.status : undefined,
      stripeConnectStatus: last === 'restaurant' ? statuses.restaurant?.stripeConnectStatus : undefined,
    });
  }

  if (last && !ownedRoles.includes(last)) {
    let fallback: ActiveRole = 'client';
    if (ownedRoles.includes('driver') && statuses.driver === 'approved') {
      fallback = 'driver';
    } else if (
      ownedRoles.includes('restaurant') &&
      statuses.restaurant?.status === 'approved'
    ) {
      fallback = 'restaurant';
    }
    return getDashboardRouteFor(fallback, {
      driverStatus: fallback === 'driver' ? statuses.driver : undefined,
      restaurantStatus: fallback === 'restaurant' ? statuses.restaurant?.status : undefined,
      stripeConnectStatus: fallback === 'restaurant' ? statuses.restaurant?.stripeConnectStatus : undefined,
    });
  }

  return '/auth/continue-as';
}
