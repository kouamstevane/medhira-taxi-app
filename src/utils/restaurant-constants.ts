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
