/**
 * Catalogue des types de véhicules.
 *
 * Le catalogue local sert de source de vérité pour les tarifs et les métadonnées.
 * Firestore peut surcharger les champs, mais jamais au prix de retomber à 0.
 */

import { CarType } from '@/types';
import { DEFAULT_PRICING } from '@/utils/constants';
import { getTranslation, type Locale } from '@/locales';

export type VehicleColor = 'white' | 'yellow' | 'black';

export interface VehicleMeta {
  color: VehicleColor;
  tagline: string;
  description: string;
  highlights: string[];
}

const round = (value: number, step = 0.05) => Math.round(value / step) * step;

const normalize = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .trim();

const makeDefaultCarType = (
  id: string,
  name: string,
  multiplier: number,
  time: string,
  order: number
): CarType => ({
  id,
  name,
  basePrice: round(DEFAULT_PRICING.BASE_PRICE * multiplier),
  pricePerKm: round(DEFAULT_PRICING.PRICE_PER_KM * multiplier),
  pricePerMinute: round(DEFAULT_PRICING.PRICE_PER_MINUTE * multiplier, 0.05),
  image: '',
  seats: 4,
  time,
  order,
});

export const DEFAULT_CAR_TYPES: CarType[] = [
  makeDefaultCarType('eco', 'Eco', 1, '2-4 min', 1),
  makeDefaultCarType('confort', 'Confort', 1.3, '3-5 min', 2),
  makeDefaultCarType('confort-plus', 'Confort+', 1.75, '4-6 min', 3),
];

const DEFAULT_CAR_TYPE_BY_KEY: Record<string, CarType> = {
  eco: DEFAULT_CAR_TYPES[0],
  confort: DEFAULT_CAR_TYPES[1],
  'confort+': DEFAULT_CAR_TYPES[2],
};

type MetaKey = 'eco' | 'confort' | 'confort+' | 'fallback';

const META_CONFIG: Record<MetaKey, { color: VehicleColor; i18nKey: string; highlightCount: number }> = {
  eco: { color: 'white', i18nKey: 'eco', highlightCount: 3 },
  confort: { color: 'yellow', i18nKey: 'confort', highlightCount: 3 },
  'confort+': { color: 'black', i18nKey: 'confortPlus', highlightCount: 4 },
  fallback: { color: 'white', i18nKey: 'fallback', highlightCount: 1 },
};

const buildMeta = (metaKey: MetaKey, locale: Locale): VehicleMeta => {
  const { color, i18nKey, highlightCount } = META_CONFIG[metaKey];
  const base = `screens.vehicleMeta.${i18nKey}`;
  return {
    color,
    tagline: getTranslation(locale, `${base}.tagline`),
    description: getTranslation(locale, `${base}.description`),
    highlights: Array.from({ length: highlightCount }, (_, index) =>
      getTranslation(locale, `${base}.highlight${index + 1}`)
    ),
  };
};

export const resolveDefaultCarType = (value: string): CarType | undefined => {
  const key = normalize(value);

  if (key.includes('plus') || key.includes('+') || key.includes('premium') || key.includes('black')) {
    return DEFAULT_CAR_TYPE_BY_KEY['confort+'];
  }
  if (key.includes('confort') || key.includes('comfort')) {
    return DEFAULT_CAR_TYPE_BY_KEY.confort;
  }
  if (key.includes('eco') || key.includes('standard')) {
    return DEFAULT_CAR_TYPE_BY_KEY.eco;
  }

  return undefined;
};

export const mergeWithDefaultCarType = (snapshotId: string, raw: Record<string, unknown>): CarType => {
  const defaultCarType =
    resolveDefaultCarType(snapshotId) ||
    resolveDefaultCarType(String(raw.name ?? '')) ||
    DEFAULT_CAR_TYPES[0];

  const pickPositive = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

  return {
    ...defaultCarType,
    id: (raw.id as string) || defaultCarType.id,
    name: (raw.name as string) || defaultCarType.name,
    basePrice: pickPositive(raw.basePrice, defaultCarType.basePrice),
    pricePerKm: pickPositive(raw.pricePerKm ?? raw.price_per_km, defaultCarType.pricePerKm),
    pricePerMinute: pickPositive(raw.pricePerMinute ?? raw.price_per_minute, defaultCarType.pricePerMinute),
    image: (raw.image as string) || (raw.imageUrl as string) || defaultCarType.image,
    seats: (raw.seats as number) || (raw.capacity as number) || defaultCarType.seats,
    time: (raw.time as string) || defaultCarType.time,
    order: (raw.order as number) ?? defaultCarType.order,
  };
};

export const getVehicleMeta = (carType: Pick<CarType, 'name'>, locale: Locale = 'fr'): VehicleMeta => {
  const key = normalize(carType.name);
  if (key === 'eco' || key === 'confort' || key === 'confort+') return buildMeta(key, locale);

  if (key.includes('plus') || key.includes('+') || key.includes('premium') || key.includes('black')) {
    return buildMeta('confort+', locale);
  }
  if (key.includes('confort') || key.includes('comfort')) {
    return buildMeta('confort', locale);
  }
  if (key.includes('eco') || key.includes('standard')) {
    return buildMeta('eco', locale);
  }

  return buildMeta('fallback', locale);
};
