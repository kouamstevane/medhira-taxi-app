/**
 * Export centralisé des hooks personnalisés
 * 
 * Permet d'importer plusieurs hooks depuis un seul point d'entrée
 * Exemple: import { useAuth, useGoogleMaps } from '@/hooks'
 */

export { useAuth } from './useAuth';
export { useGoogleMaps } from './useGoogleMaps';
export { usePlacesAutocomplete } from './usePlacesAutocomplete';
export { useVoipCall } from './useVoipCall';
