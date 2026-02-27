import { z } from 'zod';

/**
 * Schéma pour la validation des coordonnées bancaires
 */
export const BankDetailsSchema = z.object({
  accountHolder: z.string().min(2, "Le nom du titulaire doit contenir au moins 2 caractères"),
  iban: z.string().regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/, "Format IBAN invalide"),
  bic: z.string().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, "Format BIC/SWIFT invalide"),
});

/**
 * Schéma pour le chiffrement des données sensibles
 */
export const EncryptionRequestSchema = z.object({
  plaintext: z.string().min(3).max(10240),
});

export type BankDetailsInput = z.infer<typeof BankDetailsSchema>;
export type EncryptionRequestInput = z.infer<typeof EncryptionRequestSchema>;
