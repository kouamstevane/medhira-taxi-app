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
 * Valide un IBAN selon la norme ISO 13616 avec vérification mod-97.
 *
 * Les IBAN européens doivent commencer par un code pays ISO (2 lettres) suivi
 * de 2 chiffres de contrôle. La validation mod-97 transforme l'IBAN en entier
 * puis vérifie que le reste de la division par 97 vaut 1.
 *
 * @param iban - L'IBAN à valider
 * @returns true si l'IBAN est valide, false sinon
 */
export function validateIBAN(iban: string): boolean {
  const cleanIban = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z0-9]{5,34}$/.test(cleanIban)) return false;

  // Si format IBAN européen (2 lettres pays + 2 chiffres contrôle + 7+ chars)
  // appliquer la vérification mod-97 (ISO 13616).
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{7,30}$/.test(cleanIban)) {
    const rearranged = cleanIban.slice(4) + cleanIban.slice(0, 4);
    const numeric = rearranged
      .split('')
      .map((c) => (c >= '0' && c <= '9' ? c : (c.charCodeAt(0) - 55).toString()))
      .join('');
    let remainder = 0;
    for (const digit of numeric) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
    return remainder === 1;
  }

  // Fallback pour les numéros de compte non-IBAN (ex: marchés hors Europe).
  return true;
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
