/**
 * Service de Livraison de Repas
 *
 * Gère les restaurants, les commandes de livraison,
 * le calcul de prix, et les avis clients.
 *
 * Architecture calquée sur taxi.service.ts pour cohérence.
 * 
 * Règles métier issues de logic-brief.md :
 * - Règle 1 : Restaurant visible uniquement après approbation admin
 * - Règle 2 : Modifications de menu instantanément visibles
 * - Règle 3 : Commande validée uniquement après paiement
 * - Règle 4 : Notification automatique des chauffeurs proches
 * - Règles 5-7 : Calcul du prix total (base + livraison + weekend)
 * - Règle 8 : Notifications push pour suivi commande
 * - Règles 9-10 : Filtres restaurants (cuisine, prix)
 * - Règles 11-12 : Avis restaurants et livreurs
 *
 * @module services/food-delivery
 */

import { logger } from '@/utils/logger';
import { FOOD_DELIVERY_PRICING, LIMITS } from '@/utils/constants';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  getCountFromServer,
  query, 
  where, 
  orderBy, 
  updateDoc,
  serverTimestamp,
  deleteField,
  limit,
  startAfter,
  documentId,
  onSnapshot,
  DocumentData,
  QueryConstraint,
  QueryDocumentSnapshot,
  Unsubscribe,
  setDoc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApps, getApp } from 'firebase/app';
import { db } from '@/config/firebase';
import { buildMenuSearchPrefixes, normalizeMenuSearchValue, type MenuCatalogQuery, type MenuCatalogSort } from '@/utils/menu-catalog';

export type MenuImageUpdate =
  | { state: 'image-none' }
  | { state: 'image-unchanged' }
  | { state: 'external-url'; imageUrl: string }
  | { state: 'upload'; imageUrl: string; imageStoragePath: string }
  | { state: 'remove' };
import type {
  FoodOrder,
  FoodOrderStatus,
  MenuItem,
  OrderItem,
  Restaurant,
  RestaurantFilters,
  RestaurantReview,
  DeliveryReview,
  DeliveryPriceResult,
} from '@/types';
import type {
  CustomerMenuAllergen,
  CustomerMenuItemDetails,
  CustomerMenuModifierGroup,
  CustomerMenuModifierOption,
  CustomerMenuNutrition,
  CustomerMenuSupplement,
} from '@/types/food-delivery';
import { z } from 'zod';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '@/types/firestore-collections';
import type { RestaurantOpeningHours } from '@/utils/restaurant-hours';
import {
  RESTAURANT_ORDER_HISTORY_STATUSES,
  RESTAURANT_ORDER_OPERATIONAL_STATUSES,
} from '@/utils/food-order-status';

// ============================================================================
// CONSTANTES
// ============================================================================

// ==================== SCHEMAS DE VALIDATION ====================

const CreateRestaurantSchema = z.object({
  ownerId: z.string().min(1, 'ID propriétaire requis'),
  name: z.string().min(2, 'Le nom doit avoir au moins 2 caractères'),
  description: z.string().min(10, 'La description doit avoir au moins 10 caractères'),
  address: z.string().min(5, 'L\'adresse doit avoir au moins 5 caractères'),
  phone: z.string().min(8, 'Le téléphone doit avoir au moins 8 caractères'),
  email: z.string().email('Email invalide'),
  cuisineType: z.union([z.string(), z.array(z.string())]),
  avgPricePerPerson: z.number().positive().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  location: z.object({
    lat: z.number(),
    lng: z.number()
  }).optional(),
  openingHours: z.record(z.string(), z.object({
    open: z.string(),
    close: z.string(),
    closed: z.boolean()
  })).optional(),
});

/** Tarif de livraison par kilomètre (Règle 6) */
const DELIVERY_RATE_PER_KM = FOOD_DELIVERY_PRICING.RATE_PER_KM;

/** Supplément weekend (Règle 7) */
const WEEKEND_SURCHARGE = FOOD_DELIVERY_PRICING.WEEKEND_SURCHARGE;

// ============================================================================
// CALCUL DE PRIX (Règles 5, 6, 7)
// ============================================================================

/**
 * Calcule les frais de livraison
 * 
 * Règle 6 : deliveryCost = deliveryDistance * 1.50 EUR/km
 * Règle 7 : +1.50 EUR si weekend
 * 
 * @param deliveryDistance - Distance en km entre restaurant et client
 * @param isWeekend - true si la commande est passée un weekend
 * @returns Frais de livraison arrondis à 2 décimales
 */
export const calculateDeliveryCost = (
  deliveryDistance: number,
  isWeekend: boolean
): number => {
  let cost = deliveryDistance * DELIVERY_RATE_PER_KM;
  if (isWeekend) {
    cost += WEEKEND_SURCHARGE;
  }
  return Math.round(cost * 100) / 100;
};

/**
 * Calcule le prix de base (coût des articles)
 * 
 * Règle 5 : basePrice = Σ(itemPrice * itemQuantity)
 * 
 * @param orderItems - Liste des items commandés
 * @returns Prix de base arrondi à 2 décimales
 */
export const calculateBasePrice = (orderItems: OrderItem[]): number => {
  const total = orderItems.reduce(
    (sum, item) => sum + item.itemPrice * item.itemQuantity,
    0
  );
  return Math.round(total * 100) / 100;
};

/**
 * Calcule le prix total de la commande (Règle 5)
 * 
 * totalOrderPrice = basePrice + deliveryCost
 * 
 * Exemple du spec :
 * - Commande de 30 EUR, 5 km, samedi
 * - basePrice = 30 EUR
 * - deliveryCost = (5 * 1.50) + 1.50 = 9.00 EUR
 * - totalOrderPrice = 39.00 EUR
 * 
 * @param orderItems - Liste des items commandés
 * @param deliveryDistance - Distance en km
 * @param isWeekend - Commande passée un weekend ?
 * @returns Détail du calcul avec prix total arrondi à 2 décimales
 */
export const calculateTotalOrderPrice = (
  orderItems: OrderItem[],
  deliveryDistance: number,
  isWeekend: boolean
): DeliveryPriceResult => {
  const basePrice = calculateBasePrice(orderItems);
  const deliveryCost = calculateDeliveryCost(deliveryDistance, isWeekend);
  const totalOrderPrice = Math.round((basePrice + deliveryCost) * 100) / 100;

  return {
    basePrice,
    deliveryCost,
    totalOrderPrice,
  };
};

export const buildPaymentFailureCancellationUpdate = () => ({
  status: 'cancelled' as const,
  cancelledBy: 'client' as const,
  cancellationReason: 'payment_failed',
});

export const shouldShowFoodOrderInCustomerHistory = (
  order: Pick<FoodOrder, 'status' | 'paymentValidated' | 'cancellationReason'>,
): boolean => {
  if (order.status === 'pending_payment') return false;

  if (
    order.status === 'cancelled'
    && order.paymentValidated !== true
    && (order.cancellationReason === 'payment_abandoned' || order.cancellationReason === 'payment_failed')
  ) {
    return false;
  }

  return true;
};

export const canStartFoodOrderCheckout = ({
  paymentMethod,
  walletBalance,
  estimatedTotal,
}: {
  paymentMethod: 'wallet' | 'card';
  walletBalance: number | null;
  estimatedTotal: number;
}) => {
  if (paymentMethod !== 'wallet') return true;
  if (walletBalance === null) return true;
  return walletBalance >= estimatedTotal;
};

// ============================================================================
// RESTAURANTS (Règles 1, 9, 10)
// ============================================================================

/**
 * Récupérer les restaurants approuvés avec filtres optionnels
 * 
 * Règle 1 : Seuls les restaurants approuvés sont retournés
 * Règle 9 : Filtre par type de cuisine
 * Règle 10 : Filtre par prix moyen par personne
 * 
 * @param filters - Filtres optionnels (cuisine, prix, rating)
 * @param limitCount - Nombre max de résultats (défaut: 20, medJira §4.1)
 * @returns Liste des restaurants approuvés correspondant aux filtres
 */
export const getApprovedRestaurants = async (
  filters?: RestaurantFilters,
  limitCount: number = 20,
  lastVisible?: QueryDocumentSnapshot<DocumentData> | null
): Promise<{ restaurants: Restaurant[], lastDoc: QueryDocumentSnapshot<DocumentData> | null }> => {
  try {
  const restaurantsRef = collection(db, FIRESTORE_COLLECTIONS.RESTAURANTS);

  const constraints: Parameters<typeof query>[1][] = [
    where('status', '==', 'approved'),
    where('stripeConnectStatus', '==', 'active'),
  ];

  if (filters?.cuisineType) {
    constraints.push(where('cuisineType', 'array-contains', filters.cuisineType));
  }

  if (filters?.maxAvgPricePerPerson) {
    constraints.push(where('avgPricePerPerson', '<=', filters.maxAvgPricePerPerson));
  }

  if (filters?.maxAvgPricePerPerson) {
    constraints.push(orderBy('avgPricePerPerson', 'asc'));
  }
  constraints.push(orderBy('createdAt', 'desc'));

  if (lastVisible) {
    constraints.push(startAfter(lastVisible));
  }

  constraints.push(limit(limitCount));

  const q = query(restaurantsRef, ...constraints);
  const querySnapshot = await getDocs(q);

  const lastDoc = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;

  let restaurants = querySnapshot.docs.map((docSnap) => ({
    ...docSnap.data(),
    id: docSnap.id,
  })) as Restaurant[];

  if (filters?.minRating) {
    restaurants = restaurants.filter((r) => r.rating >= (filters.minRating ?? 0));
  }

  if (filters?.searchQuery) {
    const search = filters.searchQuery.toLowerCase();
    restaurants = restaurants.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        r.description.toLowerCase().includes(search) ||
        (Array.isArray(r.cuisineType) 
          ? r.cuisineType.some(c => c.toLowerCase().includes(search))
          : (r.cuisineType as string).toLowerCase().includes(search))
    );
  }

  return { restaurants, lastDoc };
  } catch (error) {
    console.error('[food-delivery.service] getApprovedRestaurants failed:', error);
    throw error;
  }
};

/**
 * Récupérer un restaurant par ID
 */
export const getRestaurantById = async (restaurantId: string): Promise<Restaurant | null> => {
  try {
  const restaurantRef = doc(db, FIRESTORE_COLLECTIONS.RESTAURANTS, restaurantId);
  const restaurantSnap = await getDoc(restaurantRef);

  if (restaurantSnap.exists()) {
    return { ...restaurantSnap.data(), id: restaurantSnap.id } as Restaurant;
  }
  return null;
  } catch (error) {
    console.error('[food-delivery.service] getRestaurantById failed:', error);
    throw error;
  }
};

/**
 * Récupérer le restaurant appartenant à un utilisateur
 */
export const getRestaurantByOwner = async (ownerId: string): Promise<Restaurant | null> => {
  try {
  const restaurantsRef = collection(db, FIRESTORE_COLLECTIONS.RESTAURANTS);
  const q = query(
    restaurantsRef,
    where('ownerId', '==', ownerId),
    limit(1)
  );
  
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) return null;
  
  const docSnap = querySnapshot.docs[0];
  return { ...docSnap.data(), id: docSnap.id } as Restaurant;
  } catch (error) {
    console.error('[food-delivery.service] getRestaurantByOwner failed:', error);
    throw error;
  }
};

/**
 * Récupérer le menu d'un restaurant (Règle 2)
 * 
 * Les modifications sont immédiatement visibles grâce à la lecture directe.
 * 
 * @param restaurantId - ID du restaurant
 * @param limitCount - Nombre max de plats (défaut: 50, medJira §4.1)
 * @returns Liste des plats disponibles
 */
export const getRestaurantMenu = async (
  restaurantId: string,
  limitCount: number = 50
): Promise<MenuItem[]> => {
  try {
  const menuRef = collection(
    db,
    FIRESTORE_COLLECTIONS.RESTAURANTS,
    restaurantId,
    FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS
  );

  const q = query(
    menuRef,
    where('isAvailable', '==', true),
    limit(limitCount)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((docSnap) => ({
    ...docSnap.data(),
    id: docSnap.id,
  })) as MenuItem[];
  } catch (error) {
    console.error('[food-delivery.service] getRestaurantMenu failed:', error);
    throw error;
  }
};

const toFiniteNumber = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

const toOptionalString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim().length > 0 ? value : undefined
);

const toRecord = (value: unknown): Record<string, unknown> | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const toCustomerMenuModifierOption = (value: unknown): CustomerMenuModifierOption | null => {
  const record = toRecord(value);
  if (!record) return null;

  const id = toOptionalString(record.id);
  const label = toOptionalString(record.label);
  if (!id || !label || record.isAvailable === false) return null;

  const option: CustomerMenuModifierOption = {
    id,
    label,
    priceDelta: toFiniteNumber(record.priceDelta) ?? 0,
    isAvailable: true,
  };

  if (typeof record.isDefault === 'boolean') {
    option.isDefault = record.isDefault;
  }

  return option;
};

const toCustomerMenuModifierGroups = (value: unknown): CustomerMenuModifierGroup[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const record = toRecord(entry);
    if (!record) return [];

    const id = toOptionalString(record.id);
    const label = toOptionalString(record.label);
    if (!id || !label) return [];

    return [{
      id,
      label,
      selectionType: record.selectionType === 'multiple' ? 'multiple' : 'single',
      required: record.required === true,
      minSelections: toFiniteNumber(record.minSelections) ?? 0,
      maxSelections: toFiniteNumber(record.maxSelections) ?? 0,
      options: Array.isArray(record.options)
        ? record.options
          .map((option) => toCustomerMenuModifierOption(option))
          .filter((option): option is CustomerMenuModifierOption => option !== null)
        : [],
    }];
  });
};

const toCustomerMenuSupplements = (value: unknown): CustomerMenuSupplement[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const record = toRecord(entry);
    if (!record) return [];

    const id = toOptionalString(record.id);
    const label = toOptionalString(record.label);
    if (!id || !label || record.isAvailable === false) return [];

    return [{
      id,
      label,
      price: toFiniteNumber(record.price) ?? 0,
      isAvailable: true,
    }];
  });
};

const toCustomerMenuAllergens = (value: unknown): CustomerMenuAllergen[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const record = toRecord(entry);
    if (!record) return [];

    const code = toOptionalString(record.code);
    const label = toOptionalString(record.label);
    if (!code || !label) return [];

    return [{ code, label }];
  });
};

const toCustomerMenuNutrition = (value: unknown): CustomerMenuNutrition | undefined => {
  const record = toRecord(value);
  if (!record) return undefined;

  const nutrition: CustomerMenuNutrition = {};
  const calories = toFiniteNumber(record.calories);
  const proteinGrams = toFiniteNumber(record.proteinGrams);
  const carbsGrams = toFiniteNumber(record.carbsGrams);
  const fatGrams = toFiniteNumber(record.fatGrams);
  const saltGrams = toFiniteNumber(record.saltGrams);

  if (calories !== undefined) nutrition.calories = calories;
  if (proteinGrams !== undefined) nutrition.proteinGrams = proteinGrams;
  if (carbsGrams !== undefined) nutrition.carbsGrams = carbsGrams;
  if (fatGrams !== undefined) nutrition.fatGrams = fatGrams;
  if (saltGrams !== undefined) nutrition.saltGrams = saltGrams;

  return Object.keys(nutrition).length > 0 ? nutrition : undefined;
};

const toCustomerMenuCheckoutRules = (value: unknown): CustomerMenuItemDetails['checkoutRules'] => {
  const record = toRecord(value);
  if (!record) return {};

  const checkoutRules: CustomerMenuItemDetails['checkoutRules'] = {};
  if (typeof record.allowZeroQuantity === 'boolean') {
    checkoutRules.allowZeroQuantity = record.allowZeroQuantity;
  }

  const maxQuantity = toFiniteNumber(record.maxQuantity);
  if (maxQuantity !== undefined) {
    checkoutRules.maxQuantity = maxQuantity;
  }

  return checkoutRules;
};

export const getCustomerMenuItemDetails = async (
  restaurantId: string,
  itemId: string,
): Promise<CustomerMenuItemDetails | null> => {
  try {
    const itemRef = doc(
      db,
      FIRESTORE_COLLECTIONS.RESTAURANTS,
      restaurantId,
      FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS,
      itemId,
    );
    const itemSnapshot = await getDoc(itemRef);

    if (!itemSnapshot.exists()) {
      return null;
    }

    const data = itemSnapshot.data();

    return {
      itemId: itemSnapshot.id,
      description: toOptionalString(data.description),
      imageUrl: toOptionalString(data.imageUrl),
      modifierGroups: toCustomerMenuModifierGroups(data.modifierGroups),
      supplements: toCustomerMenuSupplements(data.supplements),
      allergens: toCustomerMenuAllergens(data.allergens),
      nutrition: toCustomerMenuNutrition(data.nutrition),
      checkoutRules: toCustomerMenuCheckoutRules(data.checkoutRules),
    };
  } catch (error) {
    console.error('[food-delivery.service] getCustomerMenuItemDetails failed:', error);
    throw error;
  }
};

export interface CustomerRestaurantMenuPageOptions {
  restaurantId: string;
  search?: string;
  category?: string | null;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  pageSize?: number;
}

export interface CustomerRestaurantMenuPage {
  items: MenuItem[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export interface CustomerRestaurantMenuCategory {
  name: string;
  availableCount: number;
}

export const getCustomerRestaurantMenuPage = async (
  options: CustomerRestaurantMenuPageOptions,
): Promise<CustomerRestaurantMenuPage> => {
  try {
    const boundedPageSize = Math.max(1, Math.min(options.pageSize ?? 24, 24));
    const menuRef = collection(
      db,
      FIRESTORE_COLLECTIONS.RESTAURANTS,
      options.restaurantId,
      FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS,
    );

    const constraints: QueryConstraint[] = [where('isAvailable', '==', true)];
    const normalizedSearch = normalizeMenuSearchValue(options.search ?? '');
    if (normalizedSearch.length >= 2) {
      constraints.push(where('searchPrefixes', 'array-contains', normalizedSearch));
    }
    if (options.category) {
      constraints.push(where('category', '==', options.category));
    }
    constraints.push(orderBy('category', 'asc'), orderBy(documentId(), 'asc'));
    if (options.cursor) {
      constraints.push(startAfter(options.cursor));
    }
    constraints.push(limit(boundedPageSize));

    const querySnapshot = await getDocs(query(menuRef, ...constraints));
    const items = querySnapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as MenuItem[];

    return {
      items,
      lastDoc: querySnapshot.docs.at(-1) ?? null,
      hasMore: querySnapshot.docs.length === boundedPageSize,
    };
  } catch (error) {
    console.error('[food-delivery.service] getCustomerRestaurantMenuPage failed:', error);
    throw error;
  }
};

export const getCustomerRestaurantMenuCategories = async (
  restaurantId: string,
): Promise<CustomerRestaurantMenuCategory[]> => {
  try {
    const menuRef = collection(
      db,
      FIRESTORE_COLLECTIONS.RESTAURANTS,
      restaurantId,
      FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS,
    );

    const querySnapshot = await getDocs(query(menuRef, where('isAvailable', '==', true)));
    const counts = new Map<string, number>();

    for (const docSnap of querySnapshot.docs) {
      const name = String(docSnap.data().category ?? '').trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([name, availableCount]) => ({ name, availableCount }))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    console.error('[food-delivery.service] getCustomerRestaurantMenuCategories failed:', error);
    throw error;
  }
};

export interface MenuPage {
  items: MenuItem[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  totalCount: number;
  availableCount: number;
}

/**
 * Récupère le menu d'un restaurant de manière paginée avec curseur Firestore.
 * Trié par catégorie ascendant puis documentId ascendant.
 *
 * @param restaurantId - ID du restaurant
 * @param pageSize - Taille de page bornée entre 1 et 100 (défaut: 50)
 * @param cursor - Dernier document reçu pour la page suivante
 */
export const getRestaurantMenuPaginated = async (
  restaurantId: string,
  optionsOrPageSize: MenuCatalogQuery | number = {},
  legacyCursor: QueryDocumentSnapshot<DocumentData> | null = null,
): Promise<MenuPage> => {
  try {
    const options: MenuCatalogQuery = typeof optionsOrPageSize === 'number'
      ? { pageSize: optionsOrPageSize, cursor: legacyCursor }
      : optionsOrPageSize;
    const pageSize = options.pageSize ?? 50;
    const cursor = options.cursor ?? null;
    const boundedPageSize = Math.max(1, Math.min(pageSize, 100));
    const menuRef = collection(
      db,
      FIRESTORE_COLLECTIONS.RESTAURANTS,
      restaurantId,
      FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS
    );

    const catalogConstraints: QueryConstraint[] = [];
    const normalizedSearch = normalizeMenuSearchValue(options.search ?? '');
    if (normalizedSearch.length >= 2) {
      catalogConstraints.push(where('searchPrefixes', 'array-contains', normalizedSearch));
    }
    if (options.category) {
      catalogConstraints.push(where('category', '==', options.category));
    }
    const constraints = [...catalogConstraints];
    if (options.availability === 'available') {
      constraints.push(where('isAvailable', '==', true));
    } else if (options.availability === 'unavailable') {
      constraints.push(where('isAvailable', '==', false));
    }

    const sort: MenuCatalogSort = options.sort ?? 'category';
    const orderField = sort === 'price-asc' || sort === 'price-desc' ? 'price' : sort;
    const orderDirection = sort === 'price-desc' ? 'desc' : 'asc';
    constraints.push(orderBy(orderField, orderDirection), orderBy(documentId(), 'asc'));

    const countSnapshot = await getCountFromServer(query(menuRef, ...constraints));
    const availableCountSnapshot = await getCountFromServer(
      query(menuRef, ...catalogConstraints, where('isAvailable', '==', true)),
    );
    const pageConstraints = [...constraints, limit(boundedPageSize)];
    if (cursor) pageConstraints.push(startAfter(cursor));
    const q = query(menuRef, ...pageConstraints);

    const querySnapshot = await getDocs(q);
    const docs = querySnapshot.docs;
    const items = docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    })) as MenuItem[];

    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;
    const hasMore = docs.length === boundedPageSize;

    return {
      items,
      lastDoc,
      hasMore,
      totalCount: countSnapshot.data().count,
      availableCount: availableCountSnapshot.data().count,
    };
  } catch (error) {
    console.error('[food-delivery.service] getRestaurantMenuPaginated failed:', error);
    throw error;
  }
};

export const getRestaurantMenuCategories = async (restaurantId: string): Promise<string[]> => {
  const menuRef = collection(
    db,
    FIRESTORE_COLLECTIONS.RESTAURANTS,
    restaurantId,
    FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS,
  );
  const snapshot = await getDocs(menuRef);
  return Array.from(new Set(snapshot.docs
    .map((snapshotDoc) => String(snapshotDoc.data().category ?? '').trim())
    .filter(Boolean)));
};

export const bulkUpdateMenuItemAvailability = async (
  restaurantId: string,
  itemIds: string[],
  isAvailable: boolean,
): Promise<void> => {
  if (itemIds.length === 0) return;

  const batch = writeBatch(db);
  for (const itemId of itemIds) {
    const itemRef = doc(
      db,
      FIRESTORE_COLLECTIONS.RESTAURANTS,
      restaurantId,
      FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS,
      itemId,
    );
    batch.update(itemRef, { isAvailable, updatedAt: serverTimestamp() });
  }
  await batch.commit();
};

export const createRestaurant = async (
  restaurantData: Omit<Restaurant, 'id' | 'status' | 'rating' | 'totalReviews' | 'stripeConnectStatus' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  try {
    const validationResult = CreateRestaurantSchema.safeParse(restaurantData);
    if (!validationResult.success) {
      throw new Error(`Données de restaurant invalides: ${validationResult.error.message}`);
    }

    const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
    const app = getApps().length ? getApp() : undefined;
    if (!app) throw new Error('Firebase app not initialized');
    const functions = getFunctions(app, functionsRegion);
    const submit = httpsCallable(functions, 'submitRestaurantApplication');

    const result = await submit({ data: restaurantData });
    const data = result.data as { restaurantId: string };

    logger.info('Demande de création de restaurant envoyée via callable', {
      restaurantId: data.restaurantId,
      ownerId: restaurantData.ownerId,
      name: restaurantData.name,
    });

    return data.restaurantId;
  } catch (error: unknown) {
    console.error('[food-delivery.service] createRestaurant failed:', error);
    throw error;
  }
};

// ============================================================================
// COMMANDES (Règles 3, 4, 5, 8)
// ============================================================================

const CreateFoodOrderSchema = z.object({
  userId: z.string().min(1, 'User ID requis'),
  restaurantId: z.string().min(1, 'Restaurant ID requis'),
  orderItems: z.array(z.object({
    menuItemId: z.string(),
    itemName: z.string(),
    itemPrice: z.number().positive(),
    itemQuantity: z.number().int().positive(),
  })).min(1, 'La commande doit contenir au moins un article'),
  deliveryDistance: z.number().nonnegative(),
  isWeekend: z.boolean(),
  deliveryAddress: z.string().min(5, 'Adresse invalide'),
  deliveryLocation: z.object({
    lat: z.number(),
    lng: z.number()
  }).optional(),
});

export interface CreateFoodOrderResult {
  orderId: string;
  basePrice: number;
  deliveryCost: number;
  totalOrderPrice: number;
  deliveryDistance: number;
}

const compactOptionalString = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

/**
 * Créer une nouvelle commande de livraison de repas
 * 
 * Règle 3 : Le paiement doit être validé
 * Règle 4 : Les chauffeurs proches sont notifiés (via Cloud Function)
 * Règle 5 : Le prix total est calculé automatiquement
 * 
 * @param orderData - Données de la commande (sans id, timestamps, prix calculés)
 * @returns ID de la commande créée
 */
export const createFoodOrder = async (
  orderData: {
    userId: string;
    restaurantId: string;
    orderItems: OrderItem[];
    deliveryDistance: number;
    isWeekend: boolean;
    deliveryAddress: string;
    deliveryLocation?: { lat: number; lng: number };
    deliveryPreference?: 'leave_at_door' | 'meet_outside' | 'meet_at_door';
    deliveryInstructions?: string;
    customerPhone?: string;
    clientNeighbourhood?: string;
    cityId?: string;
    paymentMethod?: 'wallet' | 'card';
  }
): Promise<CreateFoodOrderResult> => {
  try {
    const validationResult = CreateFoodOrderSchema.safeParse(orderData);
    if (!validationResult.success) {
      throw new Error(`Données de commande invalides: ${validationResult.error.message}`);
    }

    const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
    const app = getApps().length ? getApp() : undefined;
    if (!app) throw new Error('Firebase app not initialized');
    const functions = getFunctions(app, functionsRegion);
    const createCallable = httpsCallable<
      {
        restaurantId: string;
        orderItems: OrderItem[];
        isWeekend: boolean;
        deliveryAddress: string;
        deliveryLocation?: { lat: number; lng: number };
        deliveryPreference?: 'leave_at_door' | 'meet_outside' | 'meet_at_door';
        deliveryInstructions?: string;
        customerPhone?: string;
        clientNeighbourhood?: string;
        cityId?: string;
        paymentMethod?: 'wallet' | 'card';
      },
      CreateFoodOrderResult
    >(functions, 'createFoodOrder');
    const selectedPaymentMethod = orderData.paymentMethod ?? 'wallet';

    const payload: {
      restaurantId: string;
      orderItems: OrderItem[];
      isWeekend: boolean;
      deliveryAddress: string;
      deliveryLocation?: { lat: number; lng: number };
      deliveryPreference?: 'leave_at_door' | 'meet_outside' | 'meet_at_door';
      deliveryInstructions?: string;
      customerPhone?: string;
      clientNeighbourhood?: string;
      cityId?: string;
      paymentMethod: 'wallet' | 'card';
    } = {
      restaurantId: orderData.restaurantId,
      orderItems: orderData.orderItems,
      isWeekend: orderData.isWeekend,
      deliveryAddress: orderData.deliveryAddress.trim(),
      paymentMethod: selectedPaymentMethod,
    };

    if (orderData.deliveryLocation) payload.deliveryLocation = orderData.deliveryLocation;
    if (orderData.deliveryPreference) payload.deliveryPreference = orderData.deliveryPreference;

    const deliveryInstructions = compactOptionalString(orderData.deliveryInstructions);
    if (deliveryInstructions) payload.deliveryInstructions = deliveryInstructions;

    const customerPhone = compactOptionalString(orderData.customerPhone);
    if (customerPhone) payload.customerPhone = customerPhone;

    const clientNeighbourhood = compactOptionalString(orderData.clientNeighbourhood);
    if (clientNeighbourhood) payload.clientNeighbourhood = clientNeighbourhood;

    const cityId = compactOptionalString(orderData.cityId);
    if (cityId) payload.cityId = cityId;

    const result = await createCallable(payload);
    const order = result.data;

    logger.info(
      'Commande de livraison créée, paiement en attente',
      {
        orderId: order.orderId,
        restaurantId: orderData.restaurantId,
        paymentMethod: selectedPaymentMethod,
      }
    );

    return order;
  } catch (error) {
    console.error('[food-delivery.service] createFoodOrder failed:', error);
    throw error;
  }
};

/**
 * Payer une commande de livraison via le portefeuille (Cloud Function)
 */
export const payFoodOrderWithWallet = async (orderId: string): Promise<{ transactionId: string }> => {
  try {
    const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
    const app = getApps().length ? getApp() : undefined;
    if (!app) throw new Error('Firebase app not initialized');
    const functions = getFunctions(app, functionsRegion);
    const payCallable = httpsCallable<{ orderId: string }, { transactionId: string }>(functions, 'walletPayFoodOrder');
    const result = await payCallable({ orderId });
    return result.data;
  } catch (error) {
    console.error('[food-delivery.service] payFoodOrderWithWallet failed:', error);
    throw error;
  }
};

/**
 * Payer une commande de livraison via carte bancaire / Stripe (Cloud Function)
 */
export const payFoodOrderWithCard = async (
  orderId: string,
  paymentIntentId?: string
): Promise<{
  transactionId?: string;
  clientSecret?: string;
  paymentIntentId?: string;
  amount?: number;
  currency?: string;
}> => {
  try {
    const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
    const app = getApps().length ? getApp() : undefined;
    if (!app) throw new Error('Firebase app not initialized');
    const functions = getFunctions(app, functionsRegion);
    const payCallable = httpsCallable<
      { orderId: string; paymentIntentId?: string },
      { transactionId?: string; clientSecret?: string; paymentIntentId?: string; amount?: number; currency?: string }
    >(functions, 'payFoodOrderWithCard');
    const payload = paymentIntentId ? { orderId, paymentIntentId } : { orderId };
    const result = await payCallable(payload);
    return result.data;
  } catch (error) {
    console.error('[food-delivery.service] payFoodOrderWithCard failed:', error);
    throw error;
  }
};



/**
 * Récupérer une commande par ID
 */
export const getFoodOrderById = async (orderId: string): Promise<FoodOrder | null> => {
  try {
  const orderRef = doc(db, FIRESTORE_COLLECTIONS.FOOD_ORDERS, orderId);
  const orderSnap = await getDoc(orderRef);

  if (orderSnap.exists()) {
    return { ...orderSnap.data(), id: orderSnap.id } as FoodOrder;
  }
  return null;
  } catch (error) {
    console.error('[food-delivery.service] getFoodOrderById failed:', error);
    throw error;
  }
};

/**
 * Récupérer les commandes d'un utilisateur
 * 
 *  limit() obligatoire (medJira §4.1)
 *  Pagination cursor-based recommandée pour listes longues
 */
export const getUserFoodOrders = async (
  userId: string,
  limitCount: number = 20
): Promise<FoodOrder[]> => {
  try {
  const ordersRef = collection(db, FIRESTORE_COLLECTIONS.FOOD_ORDERS);
  const q = query(
    ordersRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs
    .map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
    }))
    .filter((order) => shouldShowFoodOrderInCustomerHistory(order as FoodOrder)) as FoodOrder[];
  } catch (error) {
    console.error('[food-delivery.service] getUserFoodOrders failed:', error);
    throw error;
  }
};

/**
 * Mettre à jour le statut d'une commande (Règle 8 : tracking)
 * 
 * Transitions de statut autorisées :
 * confirmed → preparing → ready → picked_up → delivering → delivered
 * Tout statut → cancelled
 */
export const updateFoodOrderStatus = async (
  orderId: string,
  status: FoodOrderStatus,
  additionalData?: Partial<FoodOrder>
): Promise<void> => {
  try {
  const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
  const app = getApps().length ? getApp() : undefined;
  if (!app) throw new Error('Firebase app not initialized');
  const functions = getFunctions(app, functionsRegion);
  const manageStatus = httpsCallable<
    { orderId: string; status: FoodOrderStatus; cancellationReason?: string },
    { success: boolean; orderId: string; status: FoodOrderStatus }
  >(functions, 'restaurantManageFoodOrderStatus');

  await manageStatus({
    orderId,
    status,
    cancellationReason: additionalData?.cancellationReason,
  });

  logger.info('Statut commande mis à jour', { orderId, status });
  } catch (error) {
    console.error('[food-delivery.service] updateFoodOrderStatus failed:', error);
    throw error;
  }
};

export const subscribeRestaurantOrders = (
  restaurantId: string,
  onOrders: (orders: FoodOrder[]) => void,
  onError?: (error: Error) => void,
  limitCount: number = 100,
  statuses?: readonly FoodOrderStatus[],
): Unsubscribe => {
  const ordersRef = collection(db, FIRESTORE_COLLECTIONS.FOOD_ORDERS);
  const constraints: QueryConstraint[] = [where('restaurantId', '==', restaurantId)];

  if (statuses && statuses.length > 0) {
    constraints.push(where('status', 'in', [...statuses]));
  }

  constraints.push(orderBy('createdAt', 'desc'), limit(limitCount));
  const q = query(ordersRef, ...constraints);

  return onSnapshot(
    q,
    (querySnapshot) => {
      onOrders(querySnapshot.docs.map((docSnap) => ({
        ...docSnap.data(),
        id: docSnap.id,
      })) as FoodOrder[]);
    },
    (error) => {
      console.error('[food-delivery.service] subscribeRestaurantOrders failed:', error);
      onError?.(error);
    },
  );
};

export const subscribeRestaurantActiveOrders = (
  restaurantId: string,
  onOrders: (orders: FoodOrder[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe => subscribeRestaurantOrders(
  restaurantId,
  onOrders,
  onError,
  100,
  RESTAURANT_ORDER_OPERATIONAL_STATUSES,
);

export interface RestaurantOrderHistoryPage {
  orders: FoodOrder[];
  hasMore: boolean;
  nextCursor: QueryDocumentSnapshot<DocumentData> | null;
}

export interface RestaurantOrderHistoryPageOptions {
  dateKey?: string;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  pageSize?: number;
}

const parseRestaurantHistoryDate = (dateKey?: string): Date => {
  if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const parsedDate = new Date(year, month - 1, day);
    if (
      parsedDate.getFullYear() === year
      && parsedDate.getMonth() === month - 1
      && parsedDate.getDate() === day
    ) {
      return parsedDate;
    }
  }

  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
};

export const getRestaurantOrderHistoryPage = async (
  restaurantId: string,
  options: RestaurantOrderHistoryPageOptions = {},
): Promise<RestaurantOrderHistoryPage> => {
  const { dateKey, cursor = null, pageSize = 25 } = options;
  const boundedPageSize = Math.min(Math.max(pageSize, 1), 50);
  const dayStart = parseRestaurantHistoryDate(dateKey);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const ordersRef = collection(db, FIRESTORE_COLLECTIONS.FOOD_ORDERS);
  const constraints: QueryConstraint[] = [
    where('restaurantId', '==', restaurantId),
    where('status', 'in', [...RESTAURANT_ORDER_HISTORY_STATUSES]),
    where('createdAt', '>=', Timestamp.fromDate(dayStart)),
    where('createdAt', '<', Timestamp.fromDate(dayEnd)),
    orderBy('createdAt', 'desc'),
  ];

  if (cursor) {
    constraints.push(startAfter(cursor));
  }

  constraints.push(limit(boundedPageSize));
  const snapshot = await getDocs(query(ordersRef, ...constraints));
  const orders = snapshot.docs.map((docSnap) => ({
    ...docSnap.data(),
    id: docSnap.id,
  })) as FoodOrder[];

  return {
    orders,
    hasMore: orders.length === boundedPageSize,
    nextCursor: snapshot.docs.at(-1) ?? null,
  };
};

/**
 * Assigner un chauffeur à une commande
 */
export const assignDriverToOrder = async (
  orderId: string,
  driverId: string,
  driverName: string,
  driverPhone?: string
): Promise<void> => {
  try {
  const orderRef = doc(db, FIRESTORE_COLLECTIONS.FOOD_ORDERS, orderId);

  await updateDoc(orderRef, {
    driverId,
    driverName,
    driverPhone: driverPhone || null,
    updatedAt: serverTimestamp(),
  });

  logger.info('Chauffeur assigné à la commande', { orderId, driverId });
  } catch (error) {
    console.error('[food-delivery.service] assignDriverToOrder failed:', error);
    throw error;
  }
};

// ============================================================================
// AVIS (Règles 11, 12)
// ============================================================================

/**
 * Soumettre un avis sur un restaurant (Règle 11)
 * 
 * @param review - Données de l'avis (userId, restaurantId, orderId, rating, comment)
 * @returns ID de l'avis créé
 */
export const submitRestaurantReview = async (
  review: Omit<RestaurantReview, 'id' | 'createdAt'>
): Promise<string> => {
  try {
  if (review.rating < 1 || review.rating > 5) {
    throw new Error('La note doit être entre 1 et 5');
  }

  const reviewId = `${review.orderId}_${review.userId}`;
  const reviewRef = doc(db, FIRESTORE_COLLECTIONS.RESTAURANT_REVIEWS, reviewId);
  await setDoc(reviewRef, {
    ...review,
    createdAt: serverTimestamp(),
  });

  return reviewId;
  } catch (error) {
    console.error('[food-delivery.service] submitRestaurantReview failed:', error);
    throw error;
  }
};

/**
 * Soumettre un avis sur un livreur (Règle 12)
 * 
 * @param review - Données de l'avis (userId, driverId, orderId, rating, comment)
 * @returns ID de l'avis créé
 */
export const submitDeliveryReview = async (
  review: Omit<DeliveryReview, 'id' | 'createdAt'>
): Promise<string> => {
  try {
  if (review.rating < 1 || review.rating > 5) {
    throw new Error('La note doit être entre 1 et 5');
  }

  const reviewId = `${review.orderId}_${review.driverId}_${review.userId}`;
  const reviewRef = doc(db, FIRESTORE_COLLECTIONS.DELIVERY_REVIEWS, reviewId);
  await setDoc(reviewRef, {
    ...review,
    createdAt: serverTimestamp(),
  });

  return reviewId;
  } catch (error) {
    console.error('[food-delivery.service] submitDeliveryReview failed:', error);
    throw error;
  }
};

/**
 * Récupérer les avis d'un restaurant
 *  limit() obligatoire (medJira §4.1)
 */
export const getRestaurantReviews = async (
  restaurantId: string,
  limitCount: number = 20
): Promise<RestaurantReview[]> => {
  try {
  const reviewsRef = collection(db, FIRESTORE_COLLECTIONS.RESTAURANT_REVIEWS);
  const q = query(
    reviewsRef,
    where('restaurantId', '==', restaurantId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((docSnap) => ({
    ...docSnap.data(),
    id: docSnap.id,
  })) as RestaurantReview[];
  } catch (error) {
    console.error('[food-delivery.service] getRestaurantReviews failed:', error);
    throw error;
  }
};

/**
 * Récupérer les restaurants en attente de validation (Administration)
 * 
 *  limit() obligatoire (medJira §4.1)
 */
export const getPendingRestaurants = async (
  limitCount: number = 50
): Promise<Restaurant[]> => {
  try {
  const restaurantsRef = collection(db, FIRESTORE_COLLECTIONS.RESTAURANTS);
  const q = query(
    restaurantsRef,
    where('status', '==', 'pending_approval'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((docSnap) => ({
    ...docSnap.data(),
    id: docSnap.id,
  })) as Restaurant[];
  } catch (error) {
    console.error('[food-delivery.service] getPendingRestaurants failed:', error);
    throw error;
  }
};

/**
 * Mettre à jour le statut d'un restaurant (Approbation/Rejet/Suspension)
 */
export const updateRestaurantStatus = async (
  restaurantId: string,
  status: Restaurant['status'],
  additionalData?: Partial<Restaurant>
): Promise<void> => {
  try {
  const restaurantRef = doc(db, FIRESTORE_COLLECTIONS.RESTAURANTS, restaurantId);
  const updateData: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
    ...additionalData
  };

  if (status === 'approved') {
    updateData.approvedAt = serverTimestamp();
  }

  await updateDoc(restaurantRef, updateData);
  logger.info('Statut restaurant mis à jour par admin', { restaurantId, status });
  } catch (error) {
    console.error('[food-delivery.service] updateRestaurantStatus failed:', error);
    throw error;
  }
};

export const updateRestaurantOpeningHours = async (
  restaurantId: string,
  openingHours: RestaurantOpeningHours,
): Promise<void> => {
  try {
    const restaurantRef = doc(db, FIRESTORE_COLLECTIONS.RESTAURANTS, restaurantId);
    await updateDoc(restaurantRef, {
      openingHours,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[food-delivery.service] updateRestaurantOpeningHours failed:', error);
    throw error;
  }
};

export const FoodDeliveryService = {
  calculateDeliveryCost,
  calculateBasePrice,
  calculateTotalOrderPrice,
  buildPaymentFailureCancellationUpdate,
  shouldShowFoodOrderInCustomerHistory,
  canStartFoodOrderCheckout,
  getApprovedRestaurants,
  getRestaurantMenu,
  createFoodOrder,
  payFoodOrderWithWallet,
  payFoodOrderWithCard,
  updateFoodOrderStatus,


  getUserFoodOrders,
  submitDeliveryReview,
  submitRestaurantReview,
  createRestaurant,
  getRestaurantByOwner,
  getRestaurantById,
  getPendingRestaurants,
  updateRestaurantStatus,
  updateRestaurantOpeningHours,
  getCustomerRestaurantMenuPage,
  getCustomerRestaurantMenuCategories,
  getCustomerMenuItemDetails,
  getRestaurantMenuPaginated,
  getRestaurantMenuCategories,
  
  /**
   * Récupérer le menu complet (incluant articles indisponibles pour le gérant)
   */
  getRestaurantMenuFull: async (restaurantId: string): Promise<MenuItem[]> => {
    try {
    const menuRef = collection(db, FIRESTORE_COLLECTIONS.RESTAURANTS, restaurantId, FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS);
    const q = query(menuRef, orderBy('category'), limit(100));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as MenuItem));
    } catch (error) {
      console.error('[food-delivery.service] getRestaurantMenuFull failed:', error);
      throw error;
    }
  },

  /**
   * Ajouter ou modifier un article du menu
   */
  upsertMenuItem: async (
    restaurantId: string,
    itemData: Partial<MenuItem>,
    imageUpdate?: MenuImageUpdate
  ): Promise<string> => {
    try {
      const menuRef = collection(db, FIRESTORE_COLLECTIONS.RESTAURANTS, restaurantId, FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS);
      const itemId = itemData.id || doc(menuRef).id;
      const itemDocRef = doc(menuRef, itemId);

      const data: Record<string, unknown> = {
        ...itemData,
        id: itemId,
        restaurantId,
        name: itemData.name ?? '',
        description: itemData.description ?? '',
        price: itemData.price ?? 0,
        category: itemData.category ?? 'Plats',
        searchPrefixes: buildMenuSearchPrefixes([
          itemData.name ?? '',
          itemData.category ?? 'Plats',
          itemData.externalId ?? '',
        ]),
        isAvailable: itemData.isAvailable ?? true,
        updatedAt: serverTimestamp(),
      };

      // Supprimer les clés images éventuelles de itemData pour que imageUpdate gouverne totalement le comportement
      delete data.imageUrl;
      delete data.imageStoragePath;

      if (imageUpdate) {
        switch (imageUpdate.state) {
          case 'external-url':
            data.imageUrl = imageUpdate.imageUrl;
            data.imageStoragePath = deleteField();
            break;
          case 'upload':
            data.imageUrl = imageUpdate.imageUrl;
            data.imageStoragePath = imageUpdate.imageStoragePath;
            break;
          case 'remove':
            data.imageUrl = deleteField();
            data.imageStoragePath = deleteField();
            break;
          case 'image-none':
          case 'image-unchanged':
            // Omettre les clés pour préserver le document sans modifier les images
            break;
        }
      }

      if (!itemData.id) {
        data.source = itemData.source || 'manual';
        data.createdAt = serverTimestamp();
      }

      await setDoc(itemDocRef, data, { merge: true });
      return itemId;
    } catch (error) {
      console.error('[food-delivery.service] upsertMenuItem failed:', error);
      throw error;
    }
  },

  /**
   * Mettre à jour la disponibilité d'un article sans toucher aux données d'image
   */
  updateMenuItemAvailability: async (
    restaurantId: string,
    itemId: string,
    isAvailable: boolean
  ): Promise<void> => {
    try {
      const itemDocRef = doc(
        db,
        FIRESTORE_COLLECTIONS.RESTAURANTS,
        restaurantId,
        FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS,
        itemId
      );
      await updateDoc(itemDocRef, {
        isAvailable,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('[food-delivery.service] updateMenuItemAvailability failed:', error);
      throw error;
    }
  },

  /**
   * Supprimer un article du menu
   */
  deleteMenuItem: async (restaurantId: string, itemId: string): Promise<void> => {
    try {
    const itemDocRef = doc(db, FIRESTORE_COLLECTIONS.RESTAURANTS, restaurantId, FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS, itemId);
    await updateDoc(itemDocRef, { isAvailable: false, updatedAt: serverTimestamp() });
    } catch (error) {
      console.error('[food-delivery.service] deleteMenuItem failed:', error);
      throw error;
    }
  },

  /**
   * Récupérer les commandes d'un restaurant
   */
  subscribeRestaurantOrders,

  /**
   * Récupérer les commandes d'un restaurant
   */
  getRestaurantOrders: async (restaurantId: string, status?: FoodOrderStatus[]): Promise<FoodOrder[]> => {
    try {
    const ordersRef = collection(db, FIRESTORE_COLLECTIONS.FOOD_ORDERS);
    let q;
    
    if (status && status.length > 0) {
      q = query(
        ordersRef,
        where('restaurantId', '==', restaurantId),
        where('status', 'in', status),
        orderBy('createdAt', 'desc'),
        limit(LIMITS.DEFAULT_QUERY_LIMIT)
      );
    } else {
      q = query(
        ordersRef,
        where('restaurantId', '==', restaurantId),
        orderBy('createdAt', 'desc'),
        limit(LIMITS.DEFAULT_QUERY_LIMIT)
      );
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FoodOrder));
    } catch (error) {
      console.error('[food-delivery.service] getRestaurantOrders failed:', error);
      throw error;
    }
  },
};

export const foodDeliveryService = FoodDeliveryService;
