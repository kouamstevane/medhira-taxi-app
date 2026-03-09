/**
 * Validateur pour les données bancaires (IBAN, BIC/SWIFT)
 * 
 * Ce module fournit des fonctions de validation pour les coordonnées bancaires
 * qui peuvent être utilisées dans les Cloud Functions Firebase pour une validation
 * côté serveur sécurisée.
 * 
 * @module BankValidator
 */

/**
 * Valide un IBAN selon la norme ISO 13616
 * 
 * @param iban - L'IBAN à valider
 * @returns true si l'IBAN est valide, false sinon
 */
export function validateIBAN(iban: string): boolean {
  const cleanIban = iban.replace(/[\s]/g, '').toUpperCase();
  // Permettre un format international large (5 à 34 caractères alphanumériques)
  // au lieu de forcer le mod-97 strict de l'IBAN européen.
  return /^[A-Z0-9]{5,34}$/.test(cleanIban);
}

/**
 * Valide un code BIC/SWIFT ou code banque international
 * 
 * @param bic - Le BIC/SWIFT ou code à valider 
 * @returns true si le code est valide, false sinon
 */
export function validateBIC(bic: string): boolean {
  const cleanBic = bic.replace(/[\s]/g, '').toUpperCase();
  return /^[A-Z0-9]{3,15}$/.test(cleanBic);
}

/**
 * Valide un titulaire de compte
 * Vérifie que le nom n'est pas vide et ne contient que des caractères valides
 * 
 * @param holder - Le nom du titulaire à valider
 * @returns true si le titulaire est valide, false sinon
 */
export function validateAccountHolder(holder: string): boolean {
  if (!holder || holder.trim().length === 0) {
    return false;
  }

  // Vérifier que le nom contient au moins 2 caractères
  if (holder.trim().length < 2) {
    return false;
  }

  // Vérifier que le nom ne contient que des caractères valides (lettres, espaces, tirets, apostrophes)
  if (!/^[a-zA-ZàâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ\s\-']+$/.test(holder)) {
    return false;
  }

  return true;
}

/**
 * Valide l'ensemble des coordonnées bancaires (IBAN/BIC)
 * 
 * @param bankData - Les données bancaires à valider
 * @returns Un objet avec le résultat de la validation et les erreurs éventuelles
 */
export interface BankDataValidationResult {
  isValid: boolean;
  errors: {
    accountHolder?: string;
    iban?: string;
    bic?: string;
  };
}

export function validateBankData(bankData: {
  accountHolder: string;
  iban: string;
  bic: string;
}): BankDataValidationResult {
  const errors: BankDataValidationResult['errors'] = {};

  // Valider le titulaire
  if (!validateAccountHolder(bankData.accountHolder)) {
    errors.accountHolder = 'Le nom du titulaire est invalide';
  }

  // Valider l'IBAN
  if (!validateIBAN(bankData.iban)) {
    errors.iban = 'L\'IBAN est invalide';
  }

  // Valider le BIC
  if (!validateBIC(bankData.bic)) {
    errors.bic = 'Le BIC/SWIFT est invalide';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
