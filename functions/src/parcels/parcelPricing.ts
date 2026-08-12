import { HttpsError } from 'firebase-functions/v2/https';

type ParcelCountryConfig = {
  currency: string;
  stripeCurrency: string;
  basePrice: number;
  pricePerKm: number;
  sizeMultiplier: Record<'small' | 'medium' | 'large', number>;
  rounding: 'nearest50' | 'decimals';
};

export interface ParcelCoordinate {
  latitude: number;
  longitude: number;
}

export interface ParcelPriceInput {
  country: string;
  pickup: ParcelCoordinate;
  dropoff: ParcelCoordinate;
  sizeCategory: 'small' | 'medium' | 'large';
}

export interface ParcelPriceResult {
  price: number;
  distanceKm: number;
  durationMinutes: number;
  currency: string;
  stripeCurrency: string;
  driverEarnings: number;
  platformFee: number;
}

const COUNTRY_CONFIGS: Record<string, ParcelCountryConfig> = {
  CM: {
    currency: 'FCFA',
    stripeCurrency: 'xaf',
    basePrice: 1500,
    pricePerKm: 200,
    sizeMultiplier: { small: 1, medium: 1.4, large: 1.8 },
    rounding: 'nearest50',
  },
  CA: {
    currency: 'CAD',
    stripeCurrency: 'cad',
    basePrice: 5,
    pricePerKm: 1.25,
    sizeMultiplier: { small: 1, medium: 1.4, large: 1.8 },
    rounding: 'decimals',
  },
  FR: {
    currency: 'EUR',
    stripeCurrency: 'eur',
    basePrice: 4,
    pricePerKm: 1.1,
    sizeMultiplier: { small: 1, medium: 1.4, large: 1.8 },
    rounding: 'decimals',
  },
  BE: {
    currency: 'EUR',
    stripeCurrency: 'eur',
    basePrice: 4,
    pricePerKm: 1.15,
    sizeMultiplier: { small: 1, medium: 1.4, large: 1.8 },
    rounding: 'decimals',
  },
};

const MAX_DISTANCE_KM = 800;

function roundPrice(value: number, rounding: ParcelCountryConfig['rounding']): number {
  if (rounding === 'nearest50') return Math.round(value / 50) * 50;
  return Math.round(value * 100) / 100;
}

function validateCoordinate(coordinate: ParcelCoordinate): void {
  if (
    !Number.isFinite(coordinate.latitude) ||
    coordinate.latitude < -90 ||
    coordinate.latitude > 90 ||
    !Number.isFinite(coordinate.longitude) ||
    coordinate.longitude < -180 ||
    coordinate.longitude > 180
  ) {
    throw new HttpsError('invalid-argument', 'Coordonnées de colis invalides.');
  }
}

export function calculateDistanceKm(
  pickup: ParcelCoordinate,
  dropoff: ParcelCoordinate,
): number {
  validateCoordinate(pickup);
  validateCoordinate(dropoff);
  const earthRadiusKm = 6371;
  const latDelta = (dropoff.latitude - pickup.latitude) * Math.PI / 180;
  const lngDelta = (dropoff.longitude - pickup.longitude) * Math.PI / 180;
  const pickupLat = pickup.latitude * Math.PI / 180;
  const dropoffLat = dropoff.latitude * Math.PI / 180;
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(pickupLat) * Math.cos(dropoffLat) * Math.sin(lngDelta / 2) ** 2;
  return Math.round(earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}

export function calculateParcelPrice(input: ParcelPriceInput): ParcelPriceResult {
  const country = input.country.trim().toUpperCase();
  const config = COUNTRY_CONFIGS[country];
  if (!config) throw new HttpsError('invalid-argument', 'Pays non pris en charge.');

  const distanceKm = calculateDistanceKm(input.pickup, input.dropoff);
  if (distanceKm <= 0 || distanceKm > MAX_DISTANCE_KM) {
    throw new HttpsError('invalid-argument', 'Distance de colis invalide.');
  }

  const rawPrice = (config.basePrice + distanceKm * config.pricePerKm) * config.sizeMultiplier[input.sizeCategory];
  const price = roundPrice(rawPrice, config.rounding);
  const driverEarnings = Math.round(price * 0.7 * 100) / 100;

  return {
    price,
    distanceKm,
    durationMinutes: Math.max(1, Math.round(distanceKm / 30 * 60)),
    currency: config.currency,
    stripeCurrency: config.stripeCurrency,
    driverEarnings,
    platformFee: Math.round((price - driverEarnings) * 100) / 100,
  };
}
