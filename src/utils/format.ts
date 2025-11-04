/**
 * Utilitaires de formatage
 * 
 * Fonctions pour formater les nombres, dates, prix, etc.
 * 
 * @module utils/format
 */

/**
 * Formate un montant en FCFA avec séparateurs de milliers
 * 
 * @param amount - Montant à formater
 * @returns Montant formaté avec séparateurs
 * 
 * @example
 * formatCurrency(1500000) // "1 500 000 FCFA"
 */
export const formatCurrency = (amount: number): string => {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
};

/**
 * Formate un numéro de téléphone
 * 
 * @param phone - Numéro à formater
 * @returns Numéro formaté
 * 
 * @example
 * formatPhoneNumber("+237655744484") // "+237 6 55 74 44 84"
 */
export const formatPhoneNumber = (phone: string): string => {
  // Ajouter des espaces pour la lisibilité
  if (phone.startsWith('+237')) {
    return phone.replace(/(\+237)(\d)(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5 $6');
  }
  return phone;
};

/**
 * Formate une distance en km
 * 
 * @param distance - Distance en kilomètres
 * @param decimals - Nombre de décimales (par défaut 1)
 * @returns Distance formatée
 * 
 * @example
 * formatDistance(5.678) // "5.7 km"
 */
export const formatDistance = (distance: number, decimals: number = 1): string => {
  return `${distance.toFixed(decimals)} km`;
};

/**
 * Formate une durée en minutes
 * 
 * @param minutes - Durée en minutes
 * @returns Durée formatée
 * 
 * @example
 * formatDuration(45) // "45 min"
 * formatDuration(90) // "1h 30min"
 */
export const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
};

/**
 * Formate une date en format français
 * 
 * @param date - Date à formater
 * @returns Date formatée
 * 
 * @example
 * formatDate(new Date()) // "4 novembre 2025"
 */
export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
};

/**
 * Formate une date avec l'heure
 * 
 * @param date - Date à formater
 * @returns Date et heure formatées
 * 
 * @example
 * formatDateTime(new Date()) // "4 novembre 2025 à 13:45"
 */
export const formatDateTime = (date: Date): string => {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};
