/**
 * Types pour le Module de Livraison de Repas
 * ============================================
 * 
 * Types TypeScript pour le service de livraison de repas.
 * Basé sur la spécification logic-brief.md.
 * 
 * @module types/food-delivery
 */

import { Timestamp } from 'firebase/firestore';

// ============================================================================
// RESTAURANTS
// ============================================================================

/**
 * Statuts possibles pour un compte restaurant
 * - pending_approval : En attente de validation admin (Règle 1)
 * - approved : Approuvé et visible par les clients
 * - suspended : Suspendu par l'admin
 * - rejected : Rejeté par l'admin
 */
export type RestaurantStatus = 'pending_approval' | 'approved' | 'suspended' | 'rejected';

/**
 * Interface Restaurant
 * Représente un établissement partenaire sur la plateforme.
 */
export interface Restaurant {
  id: string;
  ownerId: string; // UID Firebase du propriétaire
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  imageUrl?: string;
  coverImageUrl?: string;
  cuisineType: string; // Ex: "Italienne", "Indienne", "Japonaise" (Règle 9)
  avgPricePerPerson: number; // Estimation du coût moyen (Règle 10)
  commissionRate: number; // Pourcentage reversé à la plateforme
  status: RestaurantStatus;
  rating: number; // Note moyenne (0-5)
  totalReviews: number;
  isOpen?: boolean;
  openingHours?: {
    [day: string]: { open: string; close: string } | null; // null = fermé
  };
  location?: {
    lat: number;
    lng: number;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  approvedAt?: Timestamp;
}

// ============================================================================
// MENU ITEMS (sous-collection de restaurants)
// ============================================================================

/**
 * Interface MenuItem
 * Représente un plat dans le menu d'un restaurant (Règle 2).
 */
export interface MenuItem {
  id: string;
  restaurantId: string;
  name: string;
  description?: string;
  price: number; // Prix unitaire
  category: string; // Ex: "Entrées", "Plats", "Desserts", "Boissons"
  imageUrl?: string;
  isAvailable: boolean; // Disponibilité en temps réel
  preparationTime?: number; // Temps de préparation estimé en minutes
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// COMMANDES (FOOD ORDERS)
// ============================================================================

/**
 * Statuts d'une commande de livraison
 * - pending : En attente de paiement
 * - confirmed : Paiement confirmé (Règle 3)
 * - preparing : Restaurant prépare la commande
 * - ready : Commande prête pour récupération
 * - picked_up : Chauffeur a récupéré la commande (code vérifié)
 * - delivering : En cours de livraison
 * - delivered : Livrée au client
 * - cancelled : Annulée
 */
export type FoodOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivering'
  | 'delivered'
  | 'cancelled';

/**
 * Interface OrderItem
 * Représente un plat commandé avec quantité.
 */
export interface OrderItem {
  itemId: string;
  itemName: string;
  itemQuantity: number;
  itemPrice: number; // Prix unitaire au moment de la commande
}

/**
 * Interface FoodOrder
 * Représente une commande complète de livraison de repas.
 * 
 * Calcul du prix total (Règles 5, 6, 7) :
 * - basePrice = Σ(itemPrice * itemQuantity)
 * - deliveryCost = deliveryDistance * 1.50 + (isWeekend ? 1.50 : 0)
 * - totalOrderPrice = basePrice + deliveryCost
 */
export interface FoodOrder {
  id: string;
  userId: string; // Client qui commande
  restaurantId: string; // Restaurant
  driverId?: string; // Chauffeur assigné
  orderItems: OrderItem[];
  deliveryDistance: number; // Distance en km
  isWeekend: boolean;
  deliveryAddress: string;
  deliveryLocation?: {
    lat: number;
    lng: number;
  };
  // Prix calculés
  basePrice: number; // Coût total des articles
  deliveryCost: number; // Frais de livraison
  totalOrderPrice: number; // Prix total (arrondi à 2 décimales)
  // Statut et tracking
  status: FoodOrderStatus;
  pickupCode: string; // Code unique de récupération (Règle 4)
  paymentValidated: boolean; // Règle 3
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  confirmedAt?: Timestamp;
  pickedUpAt?: Timestamp;
  deliveredAt?: Timestamp;
  cancelledAt?: Timestamp;
  cancelledBy?: 'client' | 'restaurant' | 'driver';
  cancellationReason?: string;
  // Infos restaurant (dénormalisées pour affichage)
  restaurantName?: string;
  restaurantImage?: string;
  // Infos chauffeur (dénormalisées)
  driverName?: string;
  driverPhone?: string;
}

// ============================================================================
// AVIS ET ÉVALUATIONS
// ============================================================================

/**
 * Interface RestaurantReview (Règle 11)
 * Avis d'un client sur un restaurant.
 */
export interface RestaurantReview {
  id: string;
  userId: string;
  restaurantId: string;
  orderId: string; // Commande associée
  rating: number; // 1-5
  comment?: string;
  createdAt: Timestamp;
}

/**
 * Interface DeliveryReview (Règle 12)
 * Avis d'un client sur un livreur.
 */
export interface DeliveryReview {
  id: string;
  userId: string;
  driverId: string;
  orderId: string; // Commande associée
  rating: number; // 1-5
  comment?: string;
  createdAt: Timestamp;
}

// ============================================================================
// FILTRES
// ============================================================================

/**
 * Interface pour les filtres de recherche de restaurants (Règles 9, 10)
 */
export interface RestaurantFilters {
  cuisineType?: string;
  maxAvgPricePerPerson?: number;
  minRating?: number;
  searchQuery?: string;
}

/**
 * Interface pour les paramètres de calcul du prix de livraison
 */
export interface DeliveryPriceParams {
  deliveryDistance: number; // km
  isWeekend: boolean;
}

/**
 * Résultat du calcul de prix
 */
export interface DeliveryPriceResult {
  basePrice: number;
  deliveryCost: number;
  totalOrderPrice: number;
}
