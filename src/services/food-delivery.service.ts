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
  query, 
  where, 
  orderBy, 
  updateDoc,
  serverTimestamp,
  deleteField,
  limit,
  startAfter,
  onSnapshot,
  DocumentData,
  QueryDocumentSnapshot,
  Unsubscribe,
  setDoc
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApps, getApp } from 'firebase/app';
import { db } from '@/config/firebase';

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
import { z } from 'zod';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '@/types/firestore-collections';

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

/**
 * Génère un code unique de récupération (6 caractères alphanumériques)
 * Utilisé par le chauffeur pour prouver la récupération au restaurant (Règle 4)
 */
const generatePickupCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

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

    const result = await createCallable({
      restaurantId: orderData.restaurantId,
      orderItems: orderData.orderItems,
      isWeekend: orderData.isWeekend,
      deliveryAddress: orderData.deliveryAddress,
      deliveryLocation: orderData.deliveryLocation,
      deliveryPreference: orderData.deliveryPreference,
      deliveryInstructions: orderData.deliveryInstructions,
      customerPhone: orderData.customerPhone,
      clientNeighbourhood: orderData.clientNeighbourhood,
      cityId: orderData.cityId,
      paymentMethod: selectedPaymentMethod,
    });
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
    const result = await payCallable({ orderId, paymentIntentId });
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
  return querySnapshot.docs.map((docSnap) => ({
    ...docSnap.data(),
    id: docSnap.id,
  })) as FoodOrder[];
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
): Unsubscribe => {
  const ordersRef = collection(db, FIRESTORE_COLLECTIONS.FOOD_ORDERS);
  const q = query(
    ordersRef,
    where('restaurantId', '==', restaurantId),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );

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

export const FoodDeliveryService = {
  calculateDeliveryCost,
  calculateBasePrice,
  calculateTotalOrderPrice,
  buildPaymentFailureCancellationUpdate,
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
