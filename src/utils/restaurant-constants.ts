export const MERCHANT_PRESET_CATEGORIES: Record<MerchantType, readonly string[]> = {
  restaurant: [
    'Africaine', 'Européenne', 'Asiatique', 'Fast Food', 'Pâtisserie',
    'Pizza', 'Burger', 'Grillades', 'Salades & Santé', 'Street Food',
    'Végétarien & Bio', 'Desserts', 'Italien', 'Français',
  ],
  supermarket: [
    'Fruits & Légumes', 'Produits frais', 'Boucherie & Volaille',
    'Poissonnerie', 'Épicerie salée', 'Épicerie sucrée', 'Boissons & Jus',
    'Surgelés', 'Entretien & Maison', 'Hygiène & Beauté', 'Bio & Diététique',
  ],
  pharmacy: [
    'Cosmétiques & Beauté', 'Bien-être & Santé', 'Premiers secours',
    'Maternité & Bébé', 'Compléments alimentaires', 'Matériel médical',
    'Hygiène corporelle', 'Soins & Pansements', 'Bio & Naturel',
  ],
  grocery: [
    'Fruits & Légumes', 'Produits frais', 'Boucherie',
    'Épicerie salée', 'Épicerie sucrée', 'Boissons & Jus', 'Surgelés',
    'Produits du terroir', 'Épices & Condiments', 'Bio & Artisanal',
  ],
  bakery: [
    'Pains & Baguettes', 'Viennoiseries', 'Pâtisseries',
    'Sandwiches & Snacking', 'Boissons chaudes', 'Boissons fraîches',
    'Traiteur & Salades', 'Gâteaux & Tartes',
  ],
  retail: [
    'Mode Femme', 'Mode Homme', 'Chaussures', 'Maroquinerie & Sacs',
    'Bijoux & Montres', 'Beauté & Parfumerie', 'Informatique & Téléphonie',
    'High-Tech & Audio', 'Maison & Décoration', 'Cuisine & Art de la table',
    'Électroménager', 'Sport & Fitness', 'Bricolage & Jardin', 'Jeux & Jouets',
    'Papeterie & Cadeaux',
  ],
  other: [
    'Fleurs & Plantes', 'Papeterie & Fournitures', 'Animalerie',
    'Artisanat & Cadeaux', 'Épicerie fine', 'Presse & Tabac', 'Services & Divers',
  ],
};

export const CUISINE_TYPES = [
  'Africaine', 'Européenne', 'Asiatique', 'Fast Food', 'Pâtisserie',
  'Pizza', 'Burger', 'Bio', 'Desserts',
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

export function getCategoriesForMerchantType(type?: MerchantType | string | null): readonly string[] {
  if (type && type in MERCHANT_PRESET_CATEGORIES) {
    return MERCHANT_PRESET_CATEGORIES[type as MerchantType];
  }
  return MERCHANT_PRESET_CATEGORIES.restaurant;
}

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
    defaultLabelFr: 'Restaurant',
    defaultLabelEn: 'Restaurant',
  },
  {
    id: 'supermarket',
    labelKey: 'restaurant.merchantTypes.supermarket',
    icon: 'local_grocery_store',
    defaultLabelFr: 'Épicerie',
    defaultLabelEn: 'Grocery Store',
  },
  {
    id: 'pharmacy',
    labelKey: 'restaurant.merchantTypes.pharmacy',
    icon: 'local_pharmacy',
    defaultLabelFr: 'Pharmacie',
    defaultLabelEn: 'Pharmacy',
  },
  {
    id: 'bakery',
    labelKey: 'restaurant.merchantTypes.bakery',
    icon: 'bakery_dining',
    defaultLabelFr: 'Boulangerie',
    defaultLabelEn: 'Bakery',
  },
  {
    id: 'retail',
    labelKey: 'restaurant.merchantTypes.retail',
    icon: 'shopping_bag',
    defaultLabelFr: 'Boutique',
    defaultLabelEn: 'Shop',
  },
  {
    id: 'other',
    labelKey: 'restaurant.merchantTypes.other',
    icon: 'storefront',
    defaultLabelFr: 'Autre',
    defaultLabelEn: 'Other',
  },
];

export const MERCHANT_TYPES_MAP: Record<MerchantType, MerchantTypeOption> = MERCHANT_TYPES_CONFIG.reduce(
  (acc, item) => {
    acc[item.id] = item;
    if (item.id === 'supermarket') {
      acc['grocery'] = item;
    }
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

