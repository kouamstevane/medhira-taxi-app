/**
 * Utilitaires de validation pour les Cloud Functions
 * 
 * Ce module fournit des fonctions utilitaires pour valider
 * les données sensibles et les champs requis.
 * 
 * @module validation
 */

/**
 * Vérifie si une valeur est des données chiffrées au format attendu
 * 
 * @param value - La valeur à vérifier
 * @returns true si la valeur est au format de données chiffrées attendu
 * 
 * @example
 * const encrypted = { data: 'encrypted_string', iv: 'iv_string', salt: 'salt_string' };
 * isEncryptedData(encrypted); // true
 */
export const isEncryptedData = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  const data = value as { data?: unknown; iv?: unknown; salt?: unknown };
  return typeof data.data === 'string' && typeof data.iv === 'string' && typeof data.salt === 'string';
};

/**
 * Vérifie si un objet contient tous les champs requis
 * 
 * @param data - L'objet à vérifier
 * @param fields - La liste des champs requis
 * @returns true si tous les champs requis sont présents et non null/undefined
 * 
 * @example
 * const data = { firstName: 'John', lastName: 'Doe', email: 'john@example.com' };
 * hasRequiredFields(data, ['firstName', 'lastName']); // true
 * hasRequiredFields(data, ['firstName', 'phoneNumber']); // false
 */
export const hasRequiredFields = (data: Record<string, unknown>, fields: string[]): boolean =>
  fields.every((field) => data[field] !== null && data[field] !== undefined);
