/**
 * Export centralisé des composants UI
 * 
 * Permet d'importer plusieurs composants depuis un seul point d'entrée
 * Exemple: import { Button, Alert, LoadingSpinner } from '@/components/ui'
 */

export { Button } from './Button';
export type { ButtonVariant, ButtonSize } from './Button';

export { LoadingSpinner } from './LoadingSpinner';

export { Alert } from './Alert';
export type { AlertType } from './Alert';
