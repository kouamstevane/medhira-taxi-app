import { z } from 'zod';

/**
 * Schéma pour la validation des coordonnées bancaires (IBAN/BIC)
 */
export const BankDetailsSchema = z.object({
  accountHolder: z.string().min(2, "Le nom du titulaire doit contenir au moins 2 caractères"),
  iban: z.string()
    .transform(v => v.replace(/[\s]/g, ''))
    .pipe(z.string().regex(/^[a-zA-Z0-9]{5,34}$/, "Numéro de compte / IBAN invalide")),
  bic: z.string()
    .transform(v => v.replace(/[\s]/g, ''))
    .pipe(z.string().regex(/^[a-zA-Z0-9]{3,15}$/, "Code banque / BIC invalide")),
});

/**
 * Schéma pour le chiffrement des données sensibles
 */
export const EncryptionRequestSchema = z.object({
  plaintext: z.string().min(3).max(10240),
});

export type BankDetailsInput = z.infer<typeof BankDetailsSchema>;
export type EncryptionRequestInput = z.infer<typeof EncryptionRequestSchema>;

/**
 * Schéma pour le véhicule chauffeur (voiture commerciale).
 * Accepte les champs optionnels envoyés par le client — la logique métier
 * (ex: year >= 2010) reste dans la Cloud Function.
 */
const CarSchema = z.object({
  brand: z.string().min(1).max(80).optional(),
  model: z.string().min(1).max(80).optional(),
  year: z.coerce.number().int().min(1900).max(2100),
  color: z.string().min(1).max(40).optional(),
  seats: z.coerce.number().int().min(1).max(20).optional(),
  fuelType: z.string().min(1).max(40).optional(),
  mileage: z.coerce.number().min(0).max(10_000_000).optional(),
  techControlDate: z.string().max(40).optional(),
  plate: z.string().max(20).optional(),
}).strict();

/**
 * Schéma pour le véhicule livreur (vélo/scooter/moto/voiture).
 */
const DeliveryVehicleSchema = z.object({
  type: z.enum(['velo', 'scooter', 'moto', 'voiture']),
  brand: z.string().min(1).max(80).optional(),
  model: z.string().min(1).max(80).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  plate: z.string().max(20).optional(),
}).strict();

/**
 * Schéma strict pour les champs publics du profil chauffeur écrits par
 * la Cloud Function `createDriverProfile` à la racine de `drivers/{uid}`.
 *
 * Règles RGPD #C2 : les champs sensibles (ssn/bank/dob/nationality/address/
 * idNumber/documents) sont interdits à la racine (déplacés dans la
 * sous-collection privée). Le schéma strict rejettera toute clé inconnue,
 * ce qui inclut ces champs interdits.
 */
export const DriverProfilePublicDataSchema = z.object({
  uid: z.string().min(1).max(128).optional(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().max(254),
  phone: z.string().min(3).max(32),
  phoneNumber: z.null().optional(),
  city: z.string().min(1).max(80).optional(),
  zipCode: z.string().min(1).max(16).optional(),
  userType: z.literal('chauffeur'),
  driverType: z.enum(['chauffeur', 'livreur', 'les_deux']),
  vehicleType: z.enum(['velo', 'scooter', 'moto', 'voiture']).optional(),
  cityId: z.string().min(1).max(64).optional(),
  status: z.enum(['pending', 'action_required', 'rejected']),
  isAvailable: z.boolean().optional(),
  rating: z.number().min(0).max(5).optional(),
  tripsCompleted: z.coerce.number().int().min(0).optional(),
  activeMode: z.enum(['taxi', 'livraison']).nullable().optional(),
  activeDeliveryOrderId: z.string().nullable().optional(),
  fcmToken: z.string().max(512).optional(),
  car: CarSchema.optional(),
  deliveryVehicle: DeliveryVehicleSchema.optional(),
  deliveriesCompleted: z.coerce.number().int().min(0).optional(),
  deliveryEarnings: z.coerce.number().min(0).optional(),
  ratingsCount: z.coerce.number().int().min(0).optional(),
  createdAt: z.union([z.number(), z.string(), z.object({ seconds: z.number(), nanoseconds: z.number() }), z.null()]).optional(),
  updatedAt: z.union([z.number(), z.string(), z.object({ seconds: z.number(), nanoseconds: z.number() }), z.null()]).optional(),
}).strict();

/**
 * Schéma de l'enveloppe reçue par la Cloud Function `createDriverProfile`.
 */
export const CreateDriverProfileRequestSchema = z.object({
  driverId: z.string().min(1).max(128),
  driverData: DriverProfilePublicDataSchema,
}).strict();

export type DriverProfilePublicDataInput = z.infer<typeof DriverProfilePublicDataSchema>;
export type CreateDriverProfileRequestInput = z.infer<typeof CreateDriverProfileRequestSchema>;

// ============================================================================
// Wallet — Schémas de validation pour les Cloud Functions onCall
// ============================================================================

/** `walletFailTransaction` — body { transactionId, reason } */
export const WalletFailTransactionSchema = z.object({
  transactionId: z.string().min(1),
  reason: z.string().min(1),
});

/** `walletPayBooking` — body { bookingId } */
export const WalletPayBookingSchema = z.object({
  bookingId: z.string().min(1),
});

/** `walletRefundTransaction` — body { originalTransactionId } */
export const WalletRefundTransactionSchema = z.object({
  originalTransactionId: z.string().min(1),
});

export type WalletFailTransactionInput = z.infer<typeof WalletFailTransactionSchema>;
export type WalletPayBookingInput = z.infer<typeof WalletPayBookingSchema>;
export type WalletRefundTransactionInput = z.infer<typeof WalletRefundTransactionSchema>;
