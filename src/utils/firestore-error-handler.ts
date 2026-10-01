/**
 * Firestore Error Handler Utility
 *
 * Fournit des fonctions pour détecter et formater les erreurs Firestore
 * afin d'afficher des messages d'erreur explicites aux utilisateurs.
 *
 * @module utils/firestore-error-handler
 */

import { translate } from '@/locales';

/**
 * Détecte si une erreur est une erreur de permission Firestore
 *
 * @param error - L'erreur à analyser
 * @returns true si c'est une erreur de permission Firestore
 *
 * @example
 * ```ts
 * try {
 *   await updateDoc(docRef, data);
 * } catch (error) {
 *   if (isFirestorePermissionError(error)) {
 *     console.log("Erreur de permission détectée");
 *   }
 * }
 * ```
 */
export function isFirestorePermissionError(error: unknown): boolean {
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    const errorCode = (error as { code?: string }).code?.toLowerCase();

    return (
      errorMessage.includes('missing or insufficient permissions') ||
      errorMessage.includes('permission-denied') ||
      errorMessage.includes('permission denied') ||
      errorCode === 'permission-denied' ||
      errorCode === 'permission_denied'
    );
  }

  // Vérifier les objets d'erreur Firebase
  if (error && typeof error === 'object') {
    const errorCode = (error as { code?: string }).code?.toLowerCase();
    return errorCode === 'permission-denied' || errorCode === 'permission_denied';
  }

  return false;
}

/**
 * Détecte si une erreur est une erreur de document non trouvé
 *
 * @param error - L'erreur à analyser
 * @returns true si c'est une erreur de document non trouvé
 */
export function isFirestoreNotFoundError(error: unknown): boolean {
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    const errorCode = (error as { code?: string }).code?.toLowerCase();

    return (
      errorMessage.includes('not found') ||
      errorCode === 'not-found' ||
      errorCode === 'not_found'
    );
  }

  if (error && typeof error === 'object') {
    const errorCode = (error as { code?: string }).code?.toLowerCase();
    return errorCode === 'not-found' || errorCode === 'not_found';
  }

  return false;
}

/**
 * Détecte si une erreur est une erreur de réseau
 *
 * @param error - L'erreur à analyser
 * @returns true si c'est une erreur de réseau
 */
export function isFirestoreNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    const errorCode = (error as { code?: string }).code?.toLowerCase();

    return (
      errorMessage.includes('network') ||
      errorMessage.includes('offline') ||
      errorMessage.includes('connection') ||
      errorCode === 'unavailable' ||
      errorCode === 'network-error'
    );
  }

  if (error && typeof error === 'object') {
    const errorCode = (error as { code?: string }).code?.toLowerCase();
    return errorCode === 'unavailable' || errorCode === 'network-error';
  }

  return false;
}

/**
 * Formate un message d'erreur Firestore pour l'afficher à l'utilisateur
 *
 * @param error - L'erreur à formater
 * @param context - Clé de traduction du contexte de l'erreur (ex: "errors.context.profileUpdate")
 * @returns Un message d'erreur explicite dans la langue active
 *
 * @example
 * ```ts
 * try {
 *   await updateDoc(docRef, data);
 * } catch (error) {
 *   const message = getFirestoreErrorMessage(error, 'errors.context.profileUpdate');
 *   showError(message);
 * }
 * ```
 */
export function getFirestoreErrorMessage(error: unknown, context?: string, t?: (key: string, params?: Record<string, string | number>) => string): string {
  const tr = t ?? translate;
  const contextPrefix = context ? ` ${tr(context)}` : '';

  if (isFirestorePermissionError(error)) {
    return tr('errors.firestorePermission', { context: contextPrefix });
  }

  if (isFirestoreNotFoundError(error)) {
    return tr('errors.firestoreNotFound', { context: contextPrefix });
  }

  if (isFirestoreNetworkError(error)) {
    return tr('errors.firestoreNetwork', { context: contextPrefix });
  }

  // Erreur générique
  if (error instanceof Error) {
    console.error('Erreur Firestore:', {
      message: error.message,
      code: (error as { code?: string }).code,
      name: error.name,
      stack: error.stack
    });
  } else {
    console.error('Erreur inconnue:', error);
  }

  return tr('errors.firestoreGeneric', { context: contextPrefix });
}

/**
 * Extrait les informations détaillées d'une erreur Firestore pour le logging
 *
 * @param error - L'erreur à analyser
 * @returns Un objet contenant les détails de l'erreur
 */
export function getFirestoreErrorDetails(error: unknown): {
  type: string;
  code?: string;
  message: string;
  isPermissionError: boolean;
  isNotFoundError: boolean;
  isNetworkError: boolean;
} {
  const details = {
    type: 'UnknownError',
    code: undefined as string | undefined,
    message: 'Erreur inconnue',
    isPermissionError: false,
    isNotFoundError: false,
    isNetworkError: false
  };

  if (error instanceof Error) {
    details.type = error.name;
    details.code = (error as { code?: string }).code;
    details.message = error.message;
    details.isPermissionError = isFirestorePermissionError(error);
    details.isNotFoundError = isFirestoreNotFoundError(error);
    details.isNetworkError = isFirestoreNetworkError(error);
  } else if (error && typeof error === 'object') {
    details.type = 'ObjectError';
    details.code = (error as { code?: string }).code;
    details.message = (error as { message?: string }).message || 'Erreur objet';
    details.isPermissionError = isFirestorePermissionError(error);
    details.isNotFoundError = isFirestoreNotFoundError(error);
    details.isNetworkError = isFirestoreNetworkError(error);
  } else if (typeof error === 'string') {
    details.type = 'StringError';
    details.message = error;
  }

  return details;
}

/**
 * Affiche les détails d'une erreur Firestore dans la console
 * Utile pour le debugging en développement
 *
 * @param error - L'erreur à logger
 * @param context - Le contexte de l'erreur
 */
export function logFirestoreError(error: unknown, context?: string): void {
  const details = getFirestoreErrorDetails(error);

  console.group(`🔴 Firestore Error${context ? ` - ${context}` : ''}`);
  console.error('Type:', details.type);
  console.error('Code:', details.code || 'N/A');
  console.error('Message:', details.message);
  console.error('Permission Error:', details.isPermissionError);
  console.error('Not Found Error:', details.isNotFoundError);
  console.error('Network Error:', details.isNetworkError);
  console.error('Full Error:', error);
  console.groupEnd();
}
