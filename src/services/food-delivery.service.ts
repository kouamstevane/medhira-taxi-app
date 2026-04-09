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
  addDoc,
  updateDoc,
  serverTimestamp,
  runTransaction,
  limit,
  startAfter,
  DocumentData,
  QueryDocumentSnapshot,
  setDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/config/firebase';
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
  const restaurantsRef = collection(db, FIRESTORE_COLLECTIONS.RESTAURANTS);

  // Construction dynamique de la requête Firestore
  //  limit() obligatoire sur chaque requête (medJira §4.1)
  const constraints: Parameters<typeof query>[1][] = [
    where('status', '==', 'approved'),
    limit(limitCount),
  ];

  // Règle 9 : Filtre par type de cuisine (supporte tableau)
  if (filters?.cuisineType) {
    constraints.push(where('cuisineType', 'array-contains', filters.cuisineType));
  }

  // Règle 10 : Filtre par prix moyen max
  if (filters?.maxAvgPricePerPerson) {
    constraints.push(where('avgPricePerPerson', '<=', filters.maxAvgPricePerPerson));
  }

  // Pagination cursor-based (medJira §4.1)
  if (lastVisible) {
    constraints.push(startAfter(lastVisible));
  }

  const q = query(restaurantsRef, ...constraints);
  const querySnapshot = await getDocs(q);

  const lastDoc = querySnapshot.docs.length > 0 ? querySnapshot.docs[querySnapshot.docs.length - 1] : null;

  let restaurants = querySnapshot.docs.map((docSnap) => ({
    ...docSnap.data(),
    id: docSnap.id,
  })) as Restaurant[];

  // Filtre côté client pour le rating min (pas de contrainte Firestore complexe)
  if (filters?.minRating) {
    restaurants = restaurants.filter((r) => r.rating >= (filters.minRating ?? 0));
  }

  // Filtre côté client pour la recherche textuelle
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
};

/**
 * Récupérer un restaurant par ID
 */
export const getRestaurantById = async (restaurantId: string): Promise<Restaurant | null> => {
  const restaurantRef = doc(db, FIRESTORE_COLLECTIONS.RESTAURANTS, restaurantId);
  const restaurantSnap = await getDoc(restaurantRef);

  if (restaurantSnap.exists()) {
    return { ...restaurantSnap.data(), id: restaurantSnap.id } as Restaurant;
  }
  return null;
};

/**
 * Récupérer le restaurant appartenant à un utilisateur
 */
export const getRestaurantByOwner = async (ownerId: string): Promise<Restaurant | null> => {
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
  const menuRef = collection(
    db,
    FIRESTORE_COLLECTIONS.RESTAURANTS,
    restaurantId,
    FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS
  );

  //  limit() obligatoire (medJira §4.1)
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
};

/**
 * Créer un nouveau restaurant
 * 
 * Règle 1 : Restaurant visible uniquement après approbation admin
 * 
 * @param restaurantData - Données du restaurant
 * @returns ID du restaurant créé
 */
export const createRestaurant = async (
  restaurantData: Omit<Restaurant, 'id' | 'status' | 'rating' | 'totalReviews' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  // Validation Zod
  const validationResult = CreateRestaurantSchema.safeParse(restaurantData);
  if (!validationResult.success) {
    throw new Error(`Données de restaurant invalides: ${validationResult.error.message}`);
  }

  const restaurantsRef = collection(db, FIRESTORE_COLLECTIONS.RESTAURANTS);
  const newRestaurantRef = doc(restaurantsRef);

  const restaurant: Omit<Restaurant, 'createdAt' | 'updatedAt'> & {
    createdAt: ReturnType<typeof serverTimestamp>;
    updatedAt: ReturnType<typeof serverTimestamp>;
  } = {
    ...restaurantData,
    id: newRestaurantRef.id,
    status: 'pending_approval', // Règle 1
    rating: 2.5, // Note par défaut (ou 0)
    totalReviews: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(newRestaurantRef, restaurant);

  logger.info('Demande de création de restaurant envoyée', {
    restaurantId: newRestaurantRef.id,
    ownerId: restaurantData.ownerId,
    name: restaurantData.name,
  });

  return newRestaurantRef.id;
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
  }
): Promise<string> => {
  // Validation Zod
  const validationResult = CreateFoodOrderSchema.safeParse(orderData);
  if (!validationResult.success) {
    throw new Error(`Données de commande invalides: ${validationResult.error.message}`);
  }

  // Calcul du prix total (Règles 5, 6, 7)
  const { basePrice, deliveryCost, totalOrderPrice } = calculateTotalOrderPrice(
    orderData.orderItems,
    orderData.deliveryDistance,
    orderData.isWeekend
  );

  // Récupérer les infos du restaurant pour dénormalisation
  const restaurant = await getRestaurantById(orderData.restaurantId);
  if (!restaurant) {
    throw new Error('Restaurant introuvable');
  }
  if (restaurant.status !== 'approved' || !restaurant.isOpen) {
    throw new Error('Ce restaurant n\'est pas disponible actuellement');
  }

  const ordersRef = collection(db, FIRESTORE_COLLECTIONS.FOOD_ORDERS);
  const newOrderRef = doc(ordersRef);

  const pickupCode = generatePickupCode();

  const order: Omit<FoodOrder, 'createdAt' | 'updatedAt'> & { createdAt: ReturnType<typeof serverTimestamp>; updatedAt: ReturnType<typeof serverTimestamp> } = {
    id: newOrderRef.id,
    userId: orderData.userId,
    restaurantId: orderData.restaurantId,
    orderItems: orderData.orderItems,
    deliveryDistance: orderData.deliveryDistance,
    isWeekend: orderData.isWeekend,
    deliveryAddress: orderData.deliveryAddress,
    deliveryLocation: orderData.deliveryLocation,
    // Prix calculés
    basePrice,
    deliveryCost,
    totalOrderPrice,
    // Statut initial : en attente de paiement (Règle 3)
    status: 'pending_payment',
    pickupCode, // Règle 4 : code unique
    paymentValidated: false,
    // Infos restaurant (dénormalisées)
    restaurantName: restaurant.name,
    restaurantImage: restaurant.imageUrl,
    // Champs livraison
    deliveryPreference: orderData.deliveryPreference ?? 'leave_at_door',
    deliveryInstructions: orderData.deliveryInstructions ?? undefined,
    customerPhone: orderData.customerPhone ?? '',
    clientNeighbourhood: orderData.clientNeighbourhood ?? '',
    cityId: orderData.cityId ?? 'edmonton',
    // Timestamps
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(newOrderRef, order);

  // Règle 3 : débiter le wallet avant de confirmer la commande
  try {
    const { payBooking } = await import('@/services/wallet.service');
    await payBooking(orderData.userId, newOrderRef.id, totalOrderPrice);
    // Paiement validé : confirmer la commande
    await updateDoc(newOrderRef, {
      status: 'confirmed',
      paymentValidated: true,
      confirmedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (payError) {
    // Paiement échoué : annuler la commande
    await updateDoc(newOrderRef, {
      status: 'cancelled',
      cancellationReason: `Paiement échoué: ${(payError as Error).message}`,
      updatedAt: serverTimestamp(),
    });
    throw new Error(`Paiement échoué: ${(payError as Error).message}`);
  }

  logger.info('Commande de livraison créée', {
    orderId: newOrderRef.id,
    restaurantId: orderData.restaurantId,
    totalOrderPrice,
    pickupCode: order.pickupCode,
  });

  return newOrderRef.id;
};

/**
 * Récupérer une commande par ID
 */
export const getFoodOrderById = async (orderId: string): Promise<FoodOrder | null> => {
  const orderRef = doc(db, FIRESTORE_COLLECTIONS.FOOD_ORDERS, orderId);
  const orderSnap = await getDoc(orderRef);

  if (orderSnap.exists()) {
    return { ...orderSnap.data(), id: orderSnap.id } as FoodOrder;
  }
  return null;
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
  const orderRef = doc(db, FIRESTORE_COLLECTIONS.FOOD_ORDERS, orderId);

  const updateData: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
    ...additionalData,
  };

  // Ajouter des timestamps spécifiques selon le statut
  switch (status) {
    case 'picked_up':
      updateData.pickedUpAt = serverTimestamp();
      break;
    case 'delivered':
      updateData.deliveredAt = serverTimestamp();
      break;
    case 'cancelled':
      updateData.cancelledAt = serverTimestamp();
      break;
  }

  await updateDoc(orderRef, updateData);

  logger.info('Statut commande mis à jour', { orderId, status });
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
  const orderRef = doc(db, FIRESTORE_COLLECTIONS.FOOD_ORDERS, orderId);

  await updateDoc(orderRef, {
    driverId,
    driverName,
    driverPhone: driverPhone || null,
    updatedAt: serverTimestamp(),
  });

  logger.info('Chauffeur assigné à la commande', { orderId, driverId });
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
  if (review.rating < 1 || review.rating > 5) {
    throw new Error('La note doit être entre 1 et 5');
  }

  const reviewsRef = collection(db, FIRESTORE_COLLECTIONS.RESTAURANT_REVIEWS);
  const docRef = await addDoc(reviewsRef, {
    ...review,
    createdAt: serverTimestamp(),
  });

  // Mettre à jour la note moyenne du restaurant
  try {
    await updateRestaurantRating(review.restaurantId, review.rating);
  } catch (error) {
    logger.warn('Erreur mise à jour rating restaurant', { error, restaurantId: review.restaurantId });
  }

  return docRef.id;
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
  if (review.rating < 1 || review.rating > 5) {
    throw new Error('La note doit être entre 1 et 5');
  }

  const reviewsRef = collection(db, FIRESTORE_COLLECTIONS.DELIVERY_REVIEWS);
  const docRef = await addDoc(reviewsRef, {
    ...review,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
};

/**
 * Récupérer les avis d'un restaurant
 *  limit() obligatoire (medJira §4.1)
 */
export const getRestaurantReviews = async (
  restaurantId: string,
  limitCount: number = 20
): Promise<RestaurantReview[]> => {
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
};

/**
 * Mettre à jour la note moyenne d'un restaurant avec une moyenne incrémentale
 * pour éviter de lire tous les avis à chaque mise à jour.
 */
const updateRestaurantRating = async (restaurantId: string, newRating: number): Promise<void> => {
  const { increment } = await import('firebase/firestore');
  const restaurantRef = doc(db, FIRESTORE_COLLECTIONS.RESTAURANTS, restaurantId);

  await runTransaction(db, async (tx) => {
    const restaurantSnap = await tx.get(restaurantRef);
    if (!restaurantSnap.exists()) return;

    const data = restaurantSnap.data();
    const oldCount: number = data.totalReviews ?? 0;
    const oldRating: number = data.rating ?? 0;
    const newCount = oldCount + 1;
    const newAvg = (oldRating * oldCount + newRating) / newCount;

    tx.update(restaurantRef, {
      rating: Math.round(newAvg * 10) / 10,
      totalReviews: increment(1),
      updatedAt: serverTimestamp(),
    });
  });
};

/**
 * Récupérer les restaurants en attente de validation (Administration)
 * 
 *  limit() obligatoire (medJira §4.1)
 */
export const getPendingRestaurants = async (
  limitCount: number = 50
): Promise<Restaurant[]> => {
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
};

/**
 * Mettre à jour le statut d'un restaurant (Approbation/Rejet/Suspension)
 */
export const updateRestaurantStatus = async (
  restaurantId: string,
  status: Restaurant['status'],
  additionalData?: Partial<Restaurant>
): Promise<void> => {
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
};

export const FoodDeliveryService = {
  calculateDeliveryCost,
  calculateBasePrice,
  calculateTotalOrderPrice,
  getApprovedRestaurants,
  getRestaurantMenu,
  createFoodOrder,
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
    const menuRef = collection(db, FIRESTORE_COLLECTIONS.RESTAURANTS, restaurantId, FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS);
    const q = query(menuRef, orderBy('category'), limit(100));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as MenuItem));
  },

  /**
   * Ajouter ou modifier un article du menu
   */
  upsertMenuItem: async (restaurantId: string, itemData: Partial<MenuItem>): Promise<string> => {
    const menuRef = collection(db, FIRESTORE_COLLECTIONS.RESTAURANTS, restaurantId, FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS);
    const itemId = itemData.id || doc(menuRef).id;
    const itemDocRef = doc(menuRef, itemId);

    const data = {
      ...itemData,
      id: itemId,
      restaurantId,
      updatedAt: serverTimestamp(),
    };

    if (!itemData.id) {
      (data as Record<string, unknown>).createdAt = serverTimestamp();
    }

    await setDoc(itemDocRef, data, { merge: true });
    return itemId;
  },

  /**
   * Supprimer un article du menu
   */
  deleteMenuItem: async (restaurantId: string, itemId: string): Promise<void> => {
    const itemDocRef = doc(db, FIRESTORE_COLLECTIONS.RESTAURANTS, restaurantId, FIRESTORE_SUBCOLLECTIONS.MENU_ITEMS, itemId);
    await updateDoc(itemDocRef, { isAvailable: false, updatedAt: serverTimestamp() }); // Soft delete ou hard delete ? Les règles disent "Create/Update/Delete"
    // Pour l'instant on garde le hard delete pour simplifier si autorisé
    // await deleteDoc(itemDocRef); 
  },

  /**
   * Récupérer les commandes d'un restaurant
   */
  getRestaurantOrders: async (restaurantId: string, status?: FoodOrderStatus[]): Promise<FoodOrder[]> => {
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
  },
};
