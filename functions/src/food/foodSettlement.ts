import { DEFAULT_RESTAURANT_COMMISSION_RATE, DRIVER_SHARE_RATE } from '../config/stripe.js';

export interface FoodSettlementInput {
  basePrice: number;
  deliveryCost: number;
  commissionRate?: number | null;
}

export interface FoodSettlement {
  totalAmountCents: number;
  restaurantGrossCents: number;
  restaurantCommissionCents: number;
  restaurantNetCents: number;
  driverGrossCents: number;
  driverAmountCents: number;
  platformAmountCents: number;
}

function toCents(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Food order amounts must be finite and non-negative');
  }
  return Math.round(amount * 100);
}

export function resolveRestaurantCommissionRate(rate: number | null | undefined): number {
  if (!Number.isFinite(rate)) return DEFAULT_RESTAURANT_COMMISSION_RATE;
  return Math.min(Math.max(rate as number, 0), 100);
}

export function resolveFoodOrderCommissionRate(orderRate: unknown, restaurantRate: unknown): number {
  const preferredRate = typeof orderRate === 'number' && Number.isFinite(orderRate)
    ? orderRate
    : typeof restaurantRate === 'number' && Number.isFinite(restaurantRate)
      ? restaurantRate
      : undefined;
  return resolveRestaurantCommissionRate(preferredRate);
}

export function calculateFoodSettlement(input: FoodSettlementInput): FoodSettlement {
  const restaurantGrossCents = toCents(input.basePrice);
  const driverGrossCents = toCents(input.deliveryCost);
  const totalAmountCents = restaurantGrossCents + driverGrossCents;
  const commissionRate = resolveRestaurantCommissionRate(input.commissionRate);
  const restaurantCommissionCents = Math.min(
    Math.round(restaurantGrossCents * (commissionRate / 100)),
    restaurantGrossCents,
  );
  const restaurantNetCents = restaurantGrossCents - restaurantCommissionCents;
  const driverAmountCents = Math.min(
    Math.max(Math.round(driverGrossCents * DRIVER_SHARE_RATE), 0),
    driverGrossCents,
  );

  return {
    totalAmountCents,
    restaurantGrossCents,
    restaurantCommissionCents,
    restaurantNetCents,
    driverGrossCents,
    driverAmountCents,
    platformAmountCents: totalAmountCents - restaurantNetCents - driverAmountCents,
  };
}
