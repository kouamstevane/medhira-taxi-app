export const CUISINE_TYPES = [
  'Africaine', 'Européenne', 'Asiatique', 'Fast Food', 'Pâtisserie',
  'Pizza', 'Burger', 'Santé/Bio', 'Desserts',
] as const;

export const RESTAURANT_DAYS = [
  { key: 'monday', label: 'Lundi' },
  { key: 'tuesday', label: 'Mardi' },
  { key: 'wednesday', label: 'Mercredi' },
  { key: 'thursday', label: 'Jeudi' },
  { key: 'friday', label: 'Vendredi' },
  { key: 'saturday', label: 'Samedi' },
  { key: 'sunday', label: 'Dimanche' },
] as const;

export type CuisineType = (typeof CUISINE_TYPES)[number];
export type RestaurantDayKey = (typeof RESTAURANT_DAYS)[number]['key'];

export type MerchantType =
  | 'restaurant'
  | 'supermarket'
  | 'pharmacy'
  | 'grocery'
  | 'bakery'
  | 'retail'
  | 'other';

export interface MerchantTypeOption {
  id: MerchantType;
  labelKey: string;
  icon: string;
  defaultLabelFr: string;
  defaultLabelEn: string;
}

export const MERCHANT_TYPES_CONFIG: MerchantTypeOption[] = [
  {
    id: 'restaurant',
    labelKey: 'restaurant.merchantTypes.restaurant',
    icon: 'restaurant',
    defaultLabelFr: 'Restaurant & Restauration rapide',
    defaultLabelEn: 'Restaurant & Fast Food',
  },
  {
    id: 'supermarket',
    labelKey: 'restaurant.merchantTypes.supermarket',
    icon: 'local_grocery_store',
    defaultLabelFr: 'Supermarché & Épicerie',
    defaultLabelEn: 'Supermarket & Grocery',
  },
  {
    id: 'pharmacy',
    labelKey: 'restaurant.merchantTypes.pharmacy',
    icon: 'local_pharmacy',
    defaultLabelFr: 'Pharmacie & Parapharmacie',
    defaultLabelEn: 'Pharmacy & Health',
  },
  {
    id: 'bakery',
    labelKey: 'restaurant.merchantTypes.bakery',
    icon: 'bakery_dining',
    defaultLabelFr: 'Boulangerie & Pâtisserie',
    defaultLabelEn: 'Bakery & Pastry',
  },
  {
    id: 'retail',
    labelKey: 'restaurant.merchantTypes.retail',
    icon: 'shopping_bag',
    defaultLabelFr: 'Boutique & Vêtements / Électronique',
    defaultLabelEn: 'Shop & Retail (Fashion, Tech, etc.)',
  },
  {
    id: 'other',
    labelKey: 'restaurant.merchantTypes.other',
    icon: 'storefront',
    defaultLabelFr: 'Autre commerce / Vendeur indépendant',
    defaultLabelEn: 'Other Merchant / Independent Seller',
  },
];

export const MERCHANT_TYPES_MAP: Record<MerchantType, MerchantTypeOption> = MERCHANT_TYPES_CONFIG.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<MerchantType, MerchantTypeOption>,
);

export function getMerchantTypeOption(type?: string | null): MerchantTypeOption {
  if (type && type in MERCHANT_TYPES_MAP) {
    return MERCHANT_TYPES_MAP[type as MerchantType];
  }
  return MERCHANT_TYPES_CONFIG[0];
}

