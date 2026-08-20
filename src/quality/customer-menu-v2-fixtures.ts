import type {
  CustomerMenuAllergen,
  CustomerMenuItemDetails,
  CustomerMenuModifierGroup,
  CustomerMenuNutrition,
  CustomerMenuSupplement,
} from '@/types/food-delivery';

export interface CustomerMenuV2SeedItem {
  id: string;
  name: string;
  category: string;
  price: number;
  description?: string;
  isAvailable?: boolean;
  modifierGroups?: CustomerMenuModifierGroup[];
  supplements?: CustomerMenuSupplement[];
  allergens?: CustomerMenuAllergen[];
  nutrition?: CustomerMenuNutrition;
  checkoutRules?: CustomerMenuItemDetails['checkoutRules'];
}

export const legacyCustomerMenuSeedItem: CustomerMenuV2SeedItem = {
  id: 'legacy-burger-classique',
  name: 'Burger Classique',
  category: 'Plats',
  price: 1250,
  description: 'Burger maison du catalogue de test.',
  isAvailable: true,
};

export const richCustomerMenuSeedItem: CustomerMenuV2SeedItem = {
  id: 'dessert-tiramisu-signature',
  name: 'Tiramisu Signature',
  category: 'Desserts',
  price: 980,
  description: 'Tiramisu crémeux avec cacao et mascarpone.',
  isAvailable: true,
  modifierGroups: [
    {
      id: 'portion',
      label: 'Taille',
      selectionType: 'single',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { id: 'regular', label: 'Classique', priceDelta: 0, isAvailable: true, isDefault: true },
        { id: 'family', label: 'Format famille', priceDelta: 420, isAvailable: true },
      ],
    },
    {
      id: 'extras',
      label: 'Extras',
      selectionType: 'multiple',
      required: false,
      minSelections: 0,
      maxSelections: 2,
      options: [
        { id: 'espresso', label: 'Shot espresso', priceDelta: 120, isAvailable: true },
      ],
    },
  ],
  supplements: [
    { id: 'coffee', label: 'Café serré', price: 180, isAvailable: true },
  ],
  allergens: [
    { code: 'MILK', label: 'Lait' },
    { code: 'EGGS', label: 'Œufs' },
  ],
  nutrition: {
    calories: 540,
    proteinGrams: 9,
    carbsGrams: 62,
    fatGrams: 26,
    saltGrams: 0.4,
  },
  checkoutRules: {
    allowZeroQuantity: false,
    maxQuantity: 3,
  },
};
