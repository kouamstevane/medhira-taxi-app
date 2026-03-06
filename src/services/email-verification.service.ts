/**
 * Service client pour l'envoi d'emails de vérification via Resend
 * 
 * ✅ SOLUTION ANTI-SPAM : Utilise Resend + react-email
 * - Remplace sendEmailVerification de Firebase Auth
 * - Meilleure délivrabilité avec SPF/DKIM configuré
 * - Templates React modernes et personnalisables
 * - Tracking et monitoring intégrés
 * 
 * @module EmailVerificationService
 */

import { getFunctions, httpsCallable, Functions } from 'firebase/functions';

/**
 * Interface pour la réponse de la Cloud Function
 */
interface SendVerificationEmailResponse {
  success: boolean;
  messageId?: string;
}

/**
 * Interface pour les données d'entrée
 */
interface SendVerificationEmailData {
  email: string;
  displayName?: string;
}

/**
 * Service d'envoi d'emails de vérification
 * 
 * Utilise la Cloud Function Firebase 'sendVerificationEmail' qui
 * envoie les emails via Resend avec des templates react-email.
 */
class EmailVerificationService {
  private functions: Functions;

  constructor() {
    // ✅ FIX: Initialiser Firebase Functions avec la région spécifiée
    // La région peut être configurée via variable d'environnement NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION
    // Par défaut: europe-west1 (doit correspondre au déploiement des fonctions)
    const functionsRegion = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1';
    this.functions = getFunctions(undefined, functionsRegion);
  }

  /**
   * Envoie un email de vérification via Resend
   * 
   * @param email - Adresse email de l'utilisateur
   * @param displayName - Nom d'affichage optionnel
   * @returns Promise avec le résultat de l'envoi
   * 
   * @throws Error si l'envoi échoue
   * 
   * @example
   * ```ts
   * const emailVerificationService = new EmailVerificationService();
   * try {
   *   const result = await emailVerificationService.sendVerificationEmail(
   *     'user@example.com',
   *     'John Doe'
   *   );
   *   console.log('Email envoyé:', result.messageId);
   * } catch (error) {
   *   console.error('Erreur:', error.message);
   * }
   * ```
   */
  async sendVerificationEmail(
    email: string,
    displayName?: string
  ): Promise<SendVerificationEmailResponse> {
    try {
      // Appeler la Cloud Function
      const sendVerificationEmailFunction = httpsCallable<
        SendVerificationEmailData,
        SendVerificationEmailResponse
      >(this.functions, 'sendVerificationEmail');

      const result = await sendVerificationEmailFunction({
        email,
        displayName,
      });

      console.log('[EmailVerificationService] Email de vérification envoyé:', {
        email,
        messageId: result.data.messageId,
        success: result.data.success,
      });

      return result.data;
    } catch (error: any) {
      console.error('[EmailVerificationService] Erreur lors de l\'envoi de l\'email:', {
        code: error.code,
        message: error.message,
        email,
      });

      // Gérer les erreurs spécifiques
      if (error.code === 'unauthenticated') {
        throw new Error('Vous devez être connecté pour effectuer cette action.');
      } else if (error.code === 'invalid-argument') {
        throw new Error('L\'adresse email fournie est invalide.');
      } else if (error.code === 'resource-exhausted') {
        throw new Error('Trop de tentatives. Veuillez réessayer dans quelques minutes.');
      } else if (error.code === 'permission-denied') {
        throw new Error('Clé API Resend invalide. Veuillez contacter le support.');
      } else {
        throw new Error(
          error.message || 'Erreur lors de l\'envoi de l\'email de vérification.'
        );
      }
    }
  }

  /**
   * Vérifie si le service est disponible
   * 
   * @returns true si Firebase Functions est disponible
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined';
  }
}

// Exporter une instance singleton
export const emailVerificationService = new EmailVerificationService();

// Exporter le type pour TypeScript
export default EmailVerificationService;
