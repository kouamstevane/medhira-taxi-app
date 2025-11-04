/**
 * Utilitaires de Validation
 * 
 * Fonctions de validation pour les formulaires et données utilisateur.
 * 
 * @module lib/validation
 */

/**
 * Validation d'email
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validation de mot de passe
 * - Au moins 8 caractères
 * - Au moins une majuscule
 * - Au moins une minuscule
 * - Au moins un chiffre
 */
export const isValidPassword = (password: string): boolean => {
  if (password.length < 8) return false;
  
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  
  return hasUpperCase && hasLowerCase && hasNumber;
};

/**
 * Obtenir les critères de validation du mot de passe
 */
export const getPasswordCriteria = (password: string) => {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };
};

/**
 * Validation de numéro de téléphone
 * Format international avec indicatif pays
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  // Accepte les formats: +237655744484, +33612345678, etc.
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

/**
 * Validation de montant (positif et avec max 2 décimales)
 */
export const isValidAmount = (amount: number, min: number = 0, max?: number): boolean => {
  if (amount < min) return false;
  if (max && amount > max) return false;
  
  // Vérifier max 2 décimales
  const decimals = amount.toString().split('.')[1];
  if (decimals && decimals.length > 2) return false;
  
  return true;
};

/**
 * Validation de longueur de texte
 */
export const isValidLength = (text: string, min: number, max: number): boolean => {
  const length = text.trim().length;
  return length >= min && length <= max;
};

/**
 * Validation de nom (lettres, espaces, tirets uniquement)
 */
export const isValidName = (name: string): boolean => {
  const nameRegex = /^[a-zA-ZÀ-ÿ\s'-]+$/;
  return nameRegex.test(name) && name.trim().length >= 2;
};

/**
 * Validation de plaque d'immatriculation (format Cameroun)
 */
export const isValidLicensePlate = (plate: string): boolean => {
  // Format: XX 1234 XX ou XX-1234-XX
  const plateRegex = /^[A-Z]{2}[\s-]?\d{4}[\s-]?[A-Z]{2}$/i;
  return plateRegex.test(plate);
};

/**
 * Validation d'URL
 */
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validation de date (ne peut pas être dans le passé)
 */
export const isValidFutureDate = (date: Date | string): boolean => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj > new Date();
};

/**
 * Validation d'âge minimum
 */
export const isValidAge = (birthDate: Date | string, minAge: number = 18): boolean => {
  const dateObj = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  const today = new Date();
  const age = today.getFullYear() - dateObj.getFullYear();
  const monthDiff = today.getMonth() - dateObj.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateObj.getDate())) {
    return age - 1 >= minAge;
  }
  
  return age >= minAge;
};

/**
 * Sanitize string (enlever les caractères dangereux)
 */
export const sanitizeString = (str: string): string => {
  return str
    .trim()
    .replace(/[<>]/g, '') // Enlever < et >
    .replace(/javascript:/gi, '') // Enlever javascript:
    .replace(/on\w+=/gi, ''); // Enlever les event handlers
};

/**
 * Valider un objet selon un schéma
 */
export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean;
  message?: string;
}

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

export interface ValidationErrors {
  [key: string]: string;
}

export const validateObject = (data: Record<string, any>, schema: ValidationSchema): ValidationErrors => {
  const errors: ValidationErrors = {};

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];

    // Required check
    if (rules.required && (!value || (typeof value === 'string' && !value.trim()))) {
      errors[field] = rules.message || `${field} est requis`;
      continue;
    }

    // Skip other validations if field is not required and empty
    if (!value) continue;

    // Length validations
    if (rules.minLength && value.length < rules.minLength) {
      errors[field] = rules.message || `${field} doit contenir au moins ${rules.minLength} caractères`;
      continue;
    }

    if (rules.maxLength && value.length > rules.maxLength) {
      errors[field] = rules.message || `${field} ne doit pas dépasser ${rules.maxLength} caractères`;
      continue;
    }

    // Pattern validation
    if (rules.pattern && !rules.pattern.test(value)) {
      errors[field] = rules.message || `${field} n'est pas valide`;
      continue;
    }

    // Custom validation
    if (rules.custom && !rules.custom(value)) {
      errors[field] = rules.message || `${field} n'est pas valide`;
    }
  }

  return errors;
};
