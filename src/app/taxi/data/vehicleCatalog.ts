/**
 * Catalogue des types de véhicules.
 *
 * Le catalogue local sert de source de vérité pour les tarifs et les métadonnées.
 * Firestore peut surcharger les champs, mais jamais au prix de retomber à 0.
 */

import { CarType } from '@/types';
import { DEFAULT_PRICING } from '@/utils/constants';

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

const META_BY_KEY: Record<string, VehicleMeta> = {
  eco: {
    color: 'white',
    tagline: 'La course du quotidien, au meilleur prix',
    description:
      'Une berline standard pour vos trajets de tous les jours. Idéale pour aller au travail, faire vos courses ou rejoindre vos amis sans vous ruiner.',
    highlights: ["Jusqu'à 4 passagers", 'Véhicule récent', 'Tarif le plus accessible'],
  },
  confort: {
    color: 'yellow',
    tagline: "Plus d'espace, plus de tranquillité",
    description:
      'Une voiture spacieuse et bien entretenue avec un chauffeur mieux noté. Parfait quand vous voulez un trajet calme, climatisé et confortable sans payer le prix d’une berline premium.',
    highlights: ["Jusqu'à 4 passagers", 'Chauffeurs mieux notés', "Plus d'espace et plus de confort"],
  },
  'confort+': {
    color: 'black',
    tagline: "L'expérience premium, pour vos déplacements importants",
    description:
      'Berline haut de gamme avec chauffeur d’élite. Pour vos rendez-vous professionnels, vos sorties spéciales ou quand vous voulez voyager avec davantage de discrétion et de confort.',
    highlights: ["Jusqu'à 4 passagers", "Chauffeurs d'élite", 'Confort premium', 'Attention renforcée aux détails'],
  },
};

const FALLBACK_META: VehicleMeta = {
  color: 'white',
  tagline: 'Votre course',
  description: 'Un véhicule pour votre trajet.',
  highlights: ['Course standard'],
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

export const getVehicleMeta = (carType: Pick<CarType, 'name'>): VehicleMeta => {
  const key = normalize(carType.name);
  if (META_BY_KEY[key]) return META_BY_KEY[key];

  if (key.includes('plus') || key.includes('+') || key.includes('premium') || key.includes('black')) {
    return META_BY_KEY['confort+'];
  }
  if (key.includes('confort') || key.includes('comfort')) {
    return META_BY_KEY.confort;
  }
  if (key.includes('eco') || key.includes('standard')) {
    return META_BY_KEY.eco;
  }

  return FALLBACK_META;
};
