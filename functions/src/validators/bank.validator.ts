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
  // CORRECTION FCFA→CAD #2: Revenir à l'ancien regex plus flexible pour IBAN
  // Format: 2 lettres pays + 2 chiffres check + 11-30 caractères alphanumériques (BBAN)
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(cleanIban)) {
    return false;
  }
  
  // Algorithme mod-97 pour validation du checksum IBAN
  const rearranged = cleanIban.substring(4) + cleanIban.substring(0, 4);
  const numeric = rearranged.split('').map(char => {
    const code = char.charCodeAt(0);
    return code >= 65 && code <= 90 ? (code - 55).toString() : char;
  }).join('');
  
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = remainder.toString() + numeric.substring(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }
  
  return remainder === 1;
}

/**
 * Valide un code BIC/SWIFT selon la norme ISO 9362
 * 
 * @param bic - Le BIC/SWIFT à valider (4 lettres banque + 2 lettres pays + 2 caractères localisation + 3 caractères branche optionnels)
 * @returns true si le BIC est valide, false sinon
 */
export function validateBIC(bic: string): boolean {
  const cleanBic = bic.replace(/[\s]/g, '').toUpperCase();
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(cleanBic);
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
