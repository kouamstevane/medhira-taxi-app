/**
 * Catalogue des types de véhicules.
 *
 * - DEFAULT_CAR_TYPES : fallback utilisé quand la collection Firestore `carTypes`
 *   est vide ou ne contient que le doc `_init` du seed.
 * - VEHICLE_META : métadonnées d'affichage (couleur de carrosserie, description
 *   courte/longue, cas d'usage) associées à chaque catégorie par nom.
 *
 * Les tarifs des fallbacks dérivent de DEFAULT_PRICING (marché actif) : Eco
 * conserve la base, Confort applique +30 %, Confort+ applique +75 %.
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

const round = (value: number, step = 50) => Math.round(value / step) * step;

export const DEFAULT_CAR_TYPES: CarType[] = [
  {
    id: 'eco',
    name: 'Eco',
    basePrice: DEFAULT_PRICING.BASE_PRICE,
    pricePerKm: DEFAULT_PRICING.PRICE_PER_KM,
    pricePerMinute: DEFAULT_PRICING.PRICE_PER_MINUTE,
    image: '',
    seats: 4,
    time: '2-4 min',
    order: 1,
  },
  {
    id: 'confort',
    name: 'Confort',
    basePrice: round(DEFAULT_PRICING.BASE_PRICE * 1.3),
    pricePerKm: round(DEFAULT_PRICING.PRICE_PER_KM * 1.3),
    pricePerMinute: round(DEFAULT_PRICING.PRICE_PER_MINUTE * 1.3, 5),
    image: '',
    seats: 4,
    time: '3-5 min',
    order: 2,
  },
  {
    id: 'confort-plus',
    name: 'Confort+',
    basePrice: round(DEFAULT_PRICING.BASE_PRICE * 1.75),
    pricePerKm: round(DEFAULT_PRICING.PRICE_PER_KM * 1.75),
    pricePerMinute: round(DEFAULT_PRICING.PRICE_PER_MINUTE * 1.75, 5),
    image: '',
    seats: 4,
    time: '4-6 min',
    order: 3,
  },
];

const META_BY_KEY: Record<string, VehicleMeta> = {
  eco: {
    color: 'white',
    tagline: 'La course du quotidien, au meilleur prix',
    description:
      'Une berline standard pour vos trajets de tous les jours. Idéale pour aller au travail, faire vos courses ou rejoindre vos amis sans vous ruiner.',
    highlights: [
      'Jusqu\'à 4 passagers',
      'Véhicule récent',
      'Tarif le plus accessible',
    ],
  },
  confort: {
    color: 'yellow',
    tagline: 'Plus d\'espace, plus de tranquillité',
    description:
      'Une voiture spacieuse et bien entretenue avec un chauffeur mieux noté. Parfait quand vous voulez un trajet calme, climatisé et confortable sans payer le prix d\'une berline premium.',
    highlights: [
      'Jusqu\'à 4 passagers',
      'Chauffeurs mieux notés',
      'Plus d\'espace et plus de confort',
    ],
  },
  'confort+': {
    color: 'black',
    tagline: 'L\'expérience premium, pour vos déplacements importants',
    description:
      'Berline haut de gamme avec chauffeur d\'élite. Pour vos rendez-vous professionnels, vos sorties spéciales ou quand vous voulez voyager avec davantage de discrétion et de confort.',
    highlights: [
      'Jusqu\'à 4 passagers',
      'Chauffeurs d\'élite',
      'Confort premium',
      'Attention renforcée aux détails',
    ],
  },
};

const FALLBACK_META: VehicleMeta = {
  color: 'white',
  tagline: 'Votre course',
  description: 'Un véhicule pour votre trajet.',
  highlights: ['Course standard'],
};

const normalize = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les diacritiques (accents, cédilles…)
    .trim();

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
