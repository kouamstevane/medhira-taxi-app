/**
 * FICHIER DE RÉFÉRENCE - COLLECTIONS FIREBASE
 * ==========================================
 * 
 * Ce fichier documente toutes les collections (tables) de la base de données
 * Firebase Firestore pour l'application Medjira Taxi.
 * 
 * Dernière mise à jour : 12 mars 2026
 * Basé sur : firestore.rules et firestore.indexes.json
 */

// ============================================================================
// COLLECTIONS PRINCIPALES
// ============================================================================

/**
 * Collection USERS (Clients)
 * --------------------------
 * Description : Utilisateurs clients de l'application
 * Authentification : Téléphone (SMS) OU Email
 * 
 * Règles de sécurité :
 * - Read : Tous les utilisateurs authentifiés
 * - Create : Propriétaire uniquement (userType = 'client')
 * - Update : Propriétaire uniquement
 * - Delete : Non autorisé
 */
export interface UserCollection {
  userId: string;
  userType: 'client';
  email?: string;
  phoneNumber?: string;
  firstName?: string;
  lastName?: string;
  profileImage?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Collection DRIVERS (Chauffeurs)
 * -------------------------------
 * Description : Chauffeurs de l'application
 * Authentification : Email UNIQUEMENT (avec vérification obligatoire)
 * 
 * Règles de sécurité :
 * - Read : Tous les utilisateurs authentifiés
 * - Create : Propriétaire uniquement (email obligatoire, phoneNumber = null, userType = 'chauffeur')
 * - Update : Propriétaire OU admin
 * - Delete : Admin OU propriétaire (si statut = 'rejected' ou 'draft')
 * 
 * Statuts possibles :
 * - 'draft' : Brouillon d'inscription
 * - 'pending' : En attente de validation
 * - 'approved' : Approuvé
 * - 'rejected' : Rejeté
 * - 'suspended' : Suspendu
 * - 'action_required' : Action requise
 */
export interface DriverCollection {
  // === Champs existants (inchangés) ===
  driverId: string
  userType: 'chauffeur'          // JAMAIS modifié — compatibilité Cloud Function
  email: string
  phoneNumber: null              // Toujours null — interdiction d'auth par téléphone
  firstName: string
  lastName: string
  city?: string
  zipCode?: string
  phone: string
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended' | 'action_required'
  isAvailable: boolean
  rating: number
  tripsCompleted: number
  createdAt: Date
  updatedAt: Date

  // === Nouveaux champs ===
  driverType: 'chauffeur' | 'livreur' | 'les_deux'
  cityId: string                 // ex: 'edmonton'
  activeMode?: 'taxi' | 'livraison'  // pertinent si driverType === 'les_deux'
  vehicleType?: 'velo' | 'scooter' | 'moto' | 'voiture'
  activeDeliveryOrderId?: string | null
  fcmToken?: string              // Token FCM pour notifications push

  // Véhicule livreur (si driverType inclut 'livreur')
  deliveryVehicle?: {
    type: 'velo' | 'scooter' | 'moto' | 'voiture'
    brand?: string
    model?: string
    year?: number
    plate?: string               // absent si type === 'velo'
  }

  // Véhicule chauffeur — standardisé make→brand, plateNumber→plate, +3 nouveaux champs
  car?: {
    brand?: string
    model?: string
    year: number
    color?: string
    seats?: number
    fuelType?: string
    mileage?: number
    techControlDate?: string
    plate?: string
  }

  // Gains livreur
  deliveriesCompleted?: number
  deliveryEarnings?: number

  // Notation
  ratingsCount?: number

  // NOTE RGPD (#C2) : Les champs sensibles suivants ont été retirés de la
  // racine `drivers/{uid}` et vivent désormais dans la sous-collection
  // `drivers/{uid}/private/personal` (voir interface `DriverPrivate`) :
  //   - ssn, bank, address, dob, nationality, idNumber, documents
}

/**
 * Sous-collection PRIVATE (dans DRIVERS)
 * --------------------------------------
 * Chemin : drivers/{uid}/private/personal
 * Description : Données PII/sensibles (RGPD #C2) — séparées du doc racine.
 *
 * Règles de sécurité :
 * - Read : Propriétaire uniquement OU admin
 * - Write : Propriétaire uniquement (champs sensibles) OU admin
 *
 * Aucun autre chauffeur ni client authentifié ne peut lire ces champs.
 */
export interface DriverPrivate {
  // Identité personnelle
  dob?: string
  nationality?: string
  idNumber?: string

  // Adresse complète
  address?: string

  // Données fiscales / bancaires (chiffrées AES-GCM)
  ssn?: { data: string; iv: string; salt: string }
  bank?: { data: string; iv: string; salt: string }

  // Documents KYC (URLs Firebase Storage + statut de vérification)
  documents?: {
    [documentKey: string]: {
      url: string | null
      status: 'pending' | 'approved' | 'rejected' | 'not_submitted'
      rejectionReason?: string
      approvedBy?: string
      submittedAt?: Date
      reviewedAt?: Date
    }
  }

  updatedAt?: Date
}

/**
 * Collection ADMINS
 * -----------------
 * Description : Administrateurs de l'application
 * 
 * Règles de sécurité :
 * - Read : Tous les utilisateurs authentifiés
 * - Write : Non autorisé via client SDK (Admin SDK uniquement)
 */
export interface AdminCollection {
  adminId: string;
  email: string;
  createdAt: Date;
}

/**
 * Collection WALLETS
 * ------------------
 * Description : Portefeuilles des utilisateurs (solde, etc.)
 * 
 * Règles de sécurité :
 * - Read : Propriétaire uniquement
 * - Create : Propriétaire uniquement
 * - Update : Propriétaire uniquement
 * - Delete : Non autorisé
 */
export interface WalletCollection {
  userId: string;
  balance: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Collection TRANSACTIONS
 * -----------------------
 * Description : Transactions financières (débits, crédits)
 * 
 * Règles de sécurité :
 * - Read : Client OU chauffeur impliqué
 * - Create : Utilisateurs authentifiés
 * - Update : Non autorisé
 * - Delete : Non autorisé
 */
export interface TransactionCollection {
  transactionId: string;
  userId: string; // Client
  driverId?: string; // Chauffeur (optionnel)
  amount: number;
  type: 'credit' | 'debit';
  status: 'pending' | 'completed' | 'failed';
  description: string;
  createdAt: Date;
}

/**
 * Collection BOOKINGS
 * -------------------
 * Description : Réservations/courses des clients
 * 
 * Règles de sécurité :
 * - Read : Client propriétaire OU chauffeur assigné OU tous si status = 'pending'
 * - Create : Utilisateurs authentifiés
 * - Update : Client OU chauffeur assigné
 * - Delete : Non autorisé
 * 
 * Statuts possibles :
 * - 'pending' : En attente d'acceptation
 * - 'accepted' : Accepté par un chauffeur
 * - 'in_progress' : En cours
 * - 'completed' : Terminé
 * - 'cancelled' : Annulé
 */
export interface BookingCollection {
  bookingId: string;
  userId: string; // Client
  driverId?: string; // Chauffeur assigné
  status: 'pending' | 'accepted' | 'driver_arrived' | 'in_progress' | 'completed' | 'cancelled' | 'failed';
  pickup: {
    address: string;
    latitude: number;
    longitude: number;
  };
  dropoff: {
    address: string;
    latitude: number;
    longitude: number;
  };
  carType?: string;
  estimatedPrice?: number;
  finalPrice?: number;
  distance?: number;
  duration?: number;
  createdAt: Date;
  acceptedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledBy?: 'client' | 'driver';
  cancellationReason?: string;
  
}

/**
 * Sous-collection CANDIDATES (dans BOOKINGS)
 * ------------------------------------------
 * Description : Candidatures des chauffeurs pour une course
 * 
 * Règles de sécurité :
 * - Read : Chauffeur concerné OU chauffeur assigné
 * - Create : Client propriétaire OU chauffeur
 * - Update : Chauffeur concerné OU chauffeur assigné OU client
 * - Delete : Non autorisé
 * 
 * Statuts possibles :
 * - 'pending' : En attente
 * - 'accepted' : Accepté
 * - 'rejected' : Rejeté
 * - 'expired' : Expiré
 */
export interface CandidateSubCollection {
  candidateId: string; // UID du chauffeur
  bookingId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  proposedPrice?: number;
  estimatedArrival?: number;
  createdAt: Date;
  respondedAt?: Date;
}

/**
 * Sous-collection MESSAGES (dans BOOKINGS)
 * ----------------------------------------
 * Description : Messages entre client et chauffeur
 * 
 * Règles de sécurité :
 * - Read : Client OU chauffeur assigné
 * - Create : Client OU chauffeur assigné
 * - Update : Client OU chauffeur assigné
 * - Delete : Non autorisé
 */
export interface MessageSubCollection {
  messageId: string;
  bookingId: string;
  senderId: string;
  senderType: 'client' | 'driver';
  content: string;
  read: boolean;
  createdAt: Date;
  readAt?: Date;
}

/**
 * Collection ACTIVE_BOOKINGS
 * --------------------------
 * Description : Courses actuellement en cours (vue optimisée)
 * 
 * Règles de sécurité :
 * - Read : Client propriétaire OU chauffeur assigné
 * - Create : Client propriétaire
 * - Update : Client OU chauffeur assigné
 * - Delete : Client OU chauffeur assigné
 */
export interface ActiveBookingCollection {
  bookingId: string;
  userId: string;
  driverId: string;
  status: 'accepted' | 'in_progress';
  currentLocation?: {
    latitude: number;
    longitude: number;
  };
  updatedAt: Date;
}

/**
 * Collection PARCELS
 * ------------------
 * Description : Colis/livraisons
 * 
 * Règles de sécurité :
 * - Read : Expéditeur OU destinataire OU chauffeur
 * - Create : Utilisateurs authentifiés
 * - Update : Expéditeur OU chauffeur
 * - Delete : Non autorisé
 */
export interface ParcelCollection {
  parcelId: string;
  senderId: string;
  /** UID du destinataire si trouvé par téléphone, sinon chaîne vide (invité) */
  receiverId: string;
  /** Téléphone E.164 du destinataire (toujours rempli, sert au SMS) */
  recipientPhone: string;
  recipientName: string;
  /** true si le destinataire n'a PAS de compte → notifié par SMS uniquement */
  recipientIsGuest: boolean;
  driverId: string | null;
  status: 'pending' | 'accepted' | 'in_transit' | 'delivered' | 'cancelled';
  pickupLocation: {
    address: string;
    latitude: number;
    longitude: number;
    country: string; // ISO 3166-1 alpha-2 (CM, CA)
  };
  dropoffLocation: {
    address: string;
    latitude: number;
    longitude: number;
    country: string;
  };
  description: string;
  weight: number;
  sizeCategory: 'small' | 'medium' | 'large';
  pickupInstructions?: string;
  estimatedPrice: number;
  finalPrice: number | null;
  price: number;
  currency: string;
  distanceKm: number;
  durationMinutes: number;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt?: Date;
  pickedUpAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
}

/**
 * Collection VEHICLES
 * -------------------
 * Description : Véhicules des chauffeurs
 * 
 * Règles de sécurité :
 * - Read : Tous les utilisateurs authentifiés
 * - Write : Propriétaire du véhicule uniquement
 */
export interface VehicleCollection {
  vehicleId: string;
  ownerId: string; // UID du chauffeur
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  color: string;
  category: string;
  seats: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Collection CONFIG
 * -----------------
 * Description : Configuration globale de l'application
 * 
 * Règles de sécurité :
 * - Read : Tous les utilisateurs authentifiés
 * - Write : Non autorisé via client SDK (Admin SDK uniquement)
 */
export interface ConfigCollection {
  key: string;
  value: unknown;
  updatedAt: Date;
}

/**
 * Collection CARTYPES
 * -------------------
 * Description : Types de véhicules disponibles
 * 
 * Règles de sécurité :
 * - Read : Tous les utilisateurs authentifiés
 * - Write : Non autorisé via client SDK (Admin SDK uniquement)
 */
export interface CarTypeCollection {
  carTypeId: string;
  name: string;
  description: string;
  basePrice: number;
  pricePerKm: number;
  pricePerMinute: number;
  icon: string;
  seats: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Collection CALLS
 * ----------------
 * Description : Appels VoIP entre clients et chauffeurs (Twilio Voice)
 * 
 * Règles de sécurité :
 * - Read : Appelant OU appelé
 * - Create : Appelant uniquement
 * - Update : Appelant OU appelé
 * - Delete : Non autorisé (TTL Firestore natif sur `expiresAt`, 24h)
 * 
 * Statuts possibles :
 * - 'ringing' : En sonnerie
 * - 'accepted' : Accepté
 * - 'declined' : Refusé
 * - 'ended' : Terminé
 * - 'failed' : Échoué
 */
export interface CallCollection {
  callId: string;
  callerId: string;
  calleeId: string;
  rideId: string; // Booking ID associé
  status: 'ringing' | 'accepted' | 'declined' | 'ended' | 'failed';
  channel: string;
  token: string;
  callerMetadata: {
    uid: string;
    name: string;
    avatar?: string;
  };
  startTime: Date;
  answerTime?: Date;
  endTime?: Date;
  reason?: string;
  expiresAt?: Date;
}

/**
 * Collection AUDIT_LOGS
 * ---------------------
 * Description : Logs d'audit pour conformité RGPD
 * 
 * Règles de sécurité :
 * - Read : Admins uniquement
 * - Create : Tous les utilisateurs authentifiés
 * - Update : Non autorisé
 * - Delete : Admins uniquement (pour nettoyage RGPD)
 */
export interface AuditLogCollection {
  logId: string;
  userId: string;
  action: string;
  resource: string;
  details: unknown;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

/**
 * Collection RESTAURANTS
 * ----------------------
 * Description : Comptes restaurants partenaires pour la livraison de repas
 * 
 * Règles de sécurité :
 * - Read : Tous les utilisateurs authentifiés
 * - Create : Utilisateurs authentifiés (status initial = 'pending_approval')
 * - Update : Propriétaire (ownerId) OU admin
 * - Delete : Admin uniquement
 * 
 * Statuts possibles :
 * - 'pending_approval' : En attente de validation admin
 * - 'approved' : Approuvé et visible
 * - 'suspended' : Suspendu
 * - 'rejected' : Rejeté
 */
export interface RestaurantCollection {
  restaurantId: string;
  ownerId: string;
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  cuisineType: string[];
  avgPricePerPerson: number;
  commissionRate: number;
  status: 'pending_approval' | 'approved' | 'suspended' | 'rejected';
  rating: number;
  totalReviews: number;
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  // SOUS-COLLECTION
  menu_items?: MenuItemSubCollection[];
}

/**
 * Sous-collection MENU_ITEMS (dans RESTAURANTS)
 * ---------------------------------------------
 * Description : Plats du menu d'un restaurant
 * 
 * Règles de sécurité :
 * - Read : Tous les utilisateurs authentifiés
 * - Create/Update/Delete : Propriétaire du restaurant parent uniquement
 */
export interface MenuItemSubCollection {
  itemId: string;
  restaurantId: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  imageUrl?: string;
  isAvailable: boolean;
  preparationTime?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Collection FOOD_ORDERS
 * ----------------------
 * Description : Commandes de livraison de repas
 * 
 * Règles de sécurité :
 * - Read : Client (userId) OU Chauffeur (driverId) OU Restaurant (restaurantId owner)
 * - Create : Authentifié (paymentValidated requis)
 * - Update : Client OU chauffeur assigné OU admin
 * - Delete : Non autorisé
 * 
 * Statuts possibles :
 * - 'pending', 'confirmed', 'preparing', 'ready',
 * - 'picked_up', 'delivering', 'delivered', 'cancelled'
 */
export interface FoodOrderCollection {
  orderId: string;
  userId: string;
  restaurantId: string;
  driverId?: string;
  orderItems: { itemName: string; itemQuantity: number; itemPrice: number }[];
  deliveryDistance: number;
  isWeekend: boolean;
  deliveryAddress: string;
  basePrice: number;
  deliveryCost: number;
  totalOrderPrice: number;
  status: 'pending_payment' | 'pending' | 'confirmed' | 'accepted' | 'preparing' | 'ready' | 'driver_heading_to_restaurant' | 'driver_arrived_restaurant' | 'picked_up' | 'out_for_delivery' | 'arriving' | 'delivering' | 'delivered' | 'no_driver_available' | 'cancelled' | 'cancelled_by_restaurant';
  pickupCode: string;
  paymentValidated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Collection RESTAURANT_REVIEWS
 * -----------------------------
 * Description : Avis des clients sur les restaurants
 * 
 * Règles de sécurité :
 * - Read : Tous les utilisateurs authentifiés
 * - Create : Authentifié (userId == request.auth.uid)
 * - Update/Delete : Non autorisé
 */
export interface RestaurantReviewCollection {
  reviewId: string;
  userId: string;
  restaurantId: string;
  orderId: string;
  rating: number;
  comment?: string;
  createdAt: Date;
}

/**
 * Collection DELIVERY_REVIEWS
 * ---------------------------
 * Description : Avis des clients sur les livreurs
 * 
 * Règles de sécurité :
 * - Read : Tous les utilisateurs authentifiés
 * - Create : Authentifié (userId == request.auth.uid)
 * - Update/Delete : Non autorisé
 */
export interface DeliveryReviewCollection {
  reviewId: string;
  userId: string;
  driverId: string;
  orderId: string;
  rating: number;
  comment?: string;
  createdAt: Date;
}

/**
 * Collection DRIVER_REQUESTS
 * --------------------------
 * Description : Demandes de courses destinées aux chauffeurs (vue optimisée)
 * Architecture hybride : bookings (source de vérité) + driver_requests (vue optimisée)
 * 
 * Règles de sécurité :
 * - Read : Chauffeur concerné uniquement
 * - Create : Utilisateurs authentifiés
 * - Update : Chauffeur concerné uniquement
 * - Delete : Non autorisé (cleanup automatique via Cloud Functions)
 */
export interface DriverRequestCollection {
  driverId: string;
  
  // SOUS-COLLECTION REQUESTS
  requests?: DriverRequestSubCollection[];
}

/**
 * Sous-collection REQUESTS (dans DRIVER_REQUESTS)
 * -----------------------------------------------
 * Description : Demandes individuelles pour un chauffeur
 * 
 * Règles de sécurité :
 * - Read : Chauffeur concerné uniquement
 * - Create : Utilisateurs authentifiés
 * - Update : Chauffeur concerné uniquement
 * - Delete : Non autorisé
 * 
 * Statuts possibles :
 * - 'pending' : En attente
 * - 'accepted' : Accepté
 * - 'rejected' : Refusé
 * - 'expired' : Expiré
 */
export interface DriverRequestSubCollection {
  requestId: string;
  driverId: string;
  bookingId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  respondedAt?: Date;
}

/**
 * Collection NOTIFICATIONS
 * ------------------------
 * Description : Historique des notifications pour le centre de notifications
 * 
 * Règles de sécurité :
 * - Read : Destinataire uniquement
 * - Create : Utilisateurs authentifiés
 * - Update : Destinataire (marquer comme lu)
 * - Delete : Destinataire ou admin
 */
export interface NotificationCollection {
  notificationId: string;
  userId: string;
  title: string;
  body: string;
  type: 'booking_request' | 'trip_started' | 'trip_completed' | 'driver_arrived' | 'payment_received' | 'food_order' | 'food_order_update' | 'alert' | 'info';
  metadata?: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────
// LIVREUR FEATURE — Nouveaux types (2026-04-07)
// ─────────────────────────────────────────────────────────────

export type DriverType = 'chauffeur' | 'livreur' | 'les_deux'
export type VehicleType = 'velo' | 'scooter' | 'moto' | 'voiture'
export type DeliveryPreference = 'leave_at_door' | 'meet_outside' | 'meet_at_door'
export type DeliveryStatus =
  | 'assigned'
  | 'refused'
  | 'heading_to_restaurant'
  | 'arrived_restaurant'
  | 'waiting'
  | 'picked_up'
  | 'heading_to_client'
  | 'arrived_client'
  | 'delivered'
  | 'cancelled'

export interface DocumentEntry {
  url: string | null
  status: 'pending' | 'approved' | 'rejected' | 'not_submitted'
  rejectionReason?: string
  submittedAt?: Date
  reviewedAt?: Date
}

export interface FoodDeliveryOrder {
  orderId: string
  driverId: string
  restaurantId: string
  clientId: string
  cityId: string
  status: DeliveryStatus
  deliveryPreference: DeliveryPreference
  pinCode?: string                  // 4 chiffres — présent si meet_outside | meet_at_door
  proofPhotoUrl?: string            // URL photo — présent si leave_at_door après livraison
  restaurantAddress: {
    address: string
    lat: number
    lng: number
  }
  clientNeighbourhood: string       // Quartier client (révélé dès l'assignation)
  clientAddress: {
    address: string                 // Adresse complète (révélée seulement au statut picked_up)
    lat: number
    lng: number
    instructions?: string
  }
  restaurantWaitingStartedAt?: Date
  cancellationReason?: 'excessive_wait' | 'driver_cancelled' | 'restaurant_cancelled'
  cancellationReasonFreeText?: string
  cancellationImpactOnStats: boolean  // false si excessive_wait
  orderItems: {
    name: string
    qty: number
    price: number
  }[]
  orderNumber: string               // ex: '#402'
  restaurantName: string
  restaurantPhone: string
  clientPhone: string
  totalAmount: number
  driverEarnings: number            // montant net livreur après commission
  createdAt: Date
  updatedAt: Date
  deliveredAt?: Date
}

export interface DriverRating {
  ratingId: string
  driverId: string
  clientId: string
  orderId: string
  orderType: 'livraison' | 'taxi'
  score: number                     // 1 à 5
  comment?: string
  createdAt: Date
}

export interface CityDocument {
  cityId: string                    // ex: 'edmonton'
  name: string                      // ex: 'Edmonton'
  country: string                   // 'CA'
  currency: string                  // 'CAD'
  isActive: boolean
  deliveryZones?: {
    name: string
    polygon: { lat: number; lng: number }[]
  }[]
  createdAt: Date
  updatedAt: Date
}

// ============================================================================
// INDEXES FIRESTORE
// ============================================================================

/**
 * Indexes composites définis dans firestore.indexes.json
 * ------------------------------------------------------
 * 
 * 1. bookings (collectionGroup)
 *    - status ASC, createdAt DESC, __name__ DESC
 *    - driverId ASC, status ASC, completedAt DESC, __name__ DESC
 *    - userId ASC, createdAt DESC, __name__ DESC
 * 
 * 2. parcels (collectionGroup)
 *    - customer ASC, createdAt DESC, __name__ DESC
 *    - senderId ASC, createdAt DESC, __name__ DESC
 * 
 * 3. calls (collectionGroup)
 *    - rideId ASC, status ASC, startTime DESC
 *    - calleeId ASC, status ASC, startTime DESC
 *    - callerId ASC, startTime DESC
 * 
 * 4. messages (collectionGroup)
 *    - read ASC, senderType ASC
 * 
 * 5. requests (collectionGroup)
 *    - status ASC, createdAt DESC, __name__ DESC
 * 
 * 6. notifications (collectionGroup)
 *    - userId ASC, createdAt DESC
 */

// ============================================================================
// EXPORTS
// ============================================================================

export const FIRESTORE_COLLECTIONS = {
  USERS: 'users',
  DRIVERS: 'drivers',
  ADMINS: 'admins',
  WALLETS: 'wallets',
  TRANSACTIONS: 'transactions',
  BOOKINGS: 'bookings',
  ACTIVE_BOOKINGS: 'active_bookings',
  PARCELS: 'parcels',
  VEHICLES: 'vehicles',
  CONFIG: 'config',
  CARTYPES: 'carTypes',
  CALLS: 'calls',
  AUDIT_LOGS: 'audit_logs',
  DRIVER_REQUESTS: 'driver_requests',
  NOTIFICATIONS: 'notifications',
  // Food Delivery Module
  RESTAURANTS: 'restaurants',
  FOOD_ORDERS: 'food_orders',
  RESTAURANT_REVIEWS: 'restaurant_reviews',
  DELIVERY_REVIEWS: 'delivery_reviews',
  FOOD_DELIVERY_ORDERS: 'food_delivery_orders',
  DRIVER_RATINGS: 'driver_ratings',
  CITIES: 'cities',
} as const;

export const FIRESTORE_SUBCOLLECTIONS = {
  CANDIDATES: 'candidates',
  MESSAGES: 'messages',
  REQUESTS: 'requests',
  // Food Delivery Module
  MENU_ITEMS: 'menu_items',
} as const;

export type FirestoreCollection = typeof FIRESTORE_COLLECTIONS[keyof typeof FIRESTORE_COLLECTIONS];
export type FirestoreSubCollection = typeof FIRESTORE_SUBCOLLECTIONS[keyof typeof FIRESTORE_SUBCOLLECTIONS];
