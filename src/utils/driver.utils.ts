import { translate } from '@/locales';

/**
 * Utilitaires pour les fonctionnalités chauffeur
 *
 * Ce module fournit des fonctions utilitaires pour les opérations
 * spécifiques aux chauffeurs dans l'application.
 *
 * @module driver.utils
 */

/**
 * Détermine le message d'information à afficher sur le dashboard chauffeur
 * selon le contexte de soumission, de vérification email et le statut du compte.
 *
 * @param submissionParam - Paramètre URL indiquant si le formulaire vient d'être soumis
 * @param emailVerifiedParam - Paramètre URL indiquant si l'email vient d'être vérifié
 * @param userEmailVerified - État de vérification email de l'utilisateur Firebase Auth
 * @param driverStatus - Statut du compte chauffeur dans Firestore
 * @returns Le message d'information à afficher, ou null si aucun message n'est nécessaire
 *
 * @example
 * const message = getDriverDashboardInfoMessage('1', null, false, 'pending');
 * // Returns: "Votre candidature a bien été enregistrée. Un email de validation vient d'être envoyé..."
 */
export const getDriverDashboardInfoMessage = (
  submissionParam: string | null,
  emailVerifiedParam: string | null,
  userEmailVerified: boolean,
  driverStatus: string | undefined,
  t: (key: string) => string = translate
): string | null => {
  // Priorité 1 : Message de confirmation de soumission (première inscription)
  if (submissionParam === '1') {
    return t('driver.submissionConfirmation');
  }

  // Priorité 2 : Message de confirmation de vérification email
  if (emailVerifiedParam === '1') {
    return t('driver.emailValidationSuccess');
  }

  // Priorité 3 : Message selon le statut du compte et l'état de vérification email
  if (driverStatus === 'pending') {
    if (userEmailVerified) {
      return t('driver.emailValidatedPendingReview');
    } else {
      return t('driver.emailValidationRequired');
    }
  }

  // Aucun message nécessaire
  return null;
};
