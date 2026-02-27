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
 * Valide un IBAN (International Bank Account Number)
 * Implémente l'algorithme de vérification IBAN (mod-97)
 * 
 * @param iban - L'IBAN à valider (espaces et tirets autorisés)
 * @returns true si l'IBAN est valide, false sinon
 */
export function validateIBAN(iban: string): boolean {
  // Retirer les espaces et les tirets
  const cleanIBAN = iban.replace(/[\s-]/g, '').toUpperCase();

  // Vérifier le format de base (2 lettres + 2 chiffres + jusqu'à 30 caractères alphanumériques)
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(cleanIBAN)) {
    return false;
  }

  // Algorithme de vérification IBAN (mod-97)
  // 1. Déplacer les 4 premiers caractères à la fin
  const rearranged = cleanIBAN.substring(4) + cleanIBAN.substring(0, 4);

  // 2. Remplacer les lettres par des chiffres (A=10, B=11, ..., Z=35)
  let numeric = '';
  for (let i = 0; i < rearranged.length; i++) {
    const char = rearranged[i];
    if (/[A-Z]/.test(char)) {
      numeric += (char.charCodeAt(0) - 55).toString();
    } else {
      numeric += char;
    }
  }

  // 3. Calculer le modulo 97
  // Pour les grands nombres, on utilise le calcul par blocs
  let remainder = 0;
  for (let i = 0; i < numeric.length; i++) {
    remainder = (remainder * 10 + parseInt(numeric[i], 10)) % 97;
  }

  // 4. L'IBAN est valide si le reste est 1
  return remainder === 1;
}

/**
 * Valide un BIC/SWIFT (Bank Identifier Code)
 * 
 * Format: 4 lettres (code banque) + 2 lettres (code pays) + 2 caractères (code localisation) + 3 caractères optionnels (code branche)
 * 
 * @param bic - Le BIC à valider
 * @returns true si le BIC est valide, false sinon
 */
export function validateBIC(bic: string): boolean {
  // Retirer les espaces
  const cleanBIC = bic.replace(/\s/g, '').toUpperCase();

  // Vérifier le format: 8 ou 11 caractères alphanumériques
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleanBIC)) {
    return false;
  }

  // Les 2 premiers caractères doivent être des lettres (code banque)
  // Les caractères 3-4 doivent être des lettres (code pays ISO 3166-1 alpha-2)
  const countryCode = cleanBIC.substring(4, 6);
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return false;
  }

  return true;
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
 * Valide l'ensemble des coordonnées bancaires
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

/**
 * Formate un IBAN pour l'affichage (ajoute des espaces tous les 4 caractères)
 * 
 * @param iban - L'IBAN à formater
 * @returns L'IBAN formaté avec des espaces
 */
export function formatIBAN(iban: string): string {
  const cleanIBAN = iban.replace(/[\s-]/g, '').toUpperCase();
  return cleanIBAN.replace(/(.{4})(?!$)/g, '$1 ');
}

/**
 * Extrait le code pays d'un IBAN
 * 
 * @param iban - L'IBAN
 * @returns Le code pays ISO 3166-1 alpha-2
 */
export function extractIBANCountryCode(iban: string): string | null {
  const cleanIBAN = iban.replace(/[\s-]/g, '').toUpperCase();
  if (cleanIBAN.length >= 2) {
    return cleanIBAN.substring(0, 2);
  }
  return null;
}
