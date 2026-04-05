/**
 * Service d'Audit Logging - Sécurité et Conformité RGPD
 * 
 * Ce service enregistre toutes les opérations sensibles sur les données personnelles
 * conformément aux exigences RGPD et aux meilleures pratiques de sécurité.
 * 
 * Types d'événements audités:
 * - Accès aux données SSN/NIR
 * - Opérations bancaires (chiffrement, validation)
 * - Modifications de données sensibles
 * - Tentatives d'accès non autorisées
 * - Échecs de validation
 * 
 * @module AuditLoggingService
 */

import { db, auth } from '../config/firebase';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

/**
 * Types d'événements d'audit
 */
export enum AuditEventType {
  // Données personnelles
  SSN_ENCRYPTED = 'SSN_ENCRYPTED',
  SSN_DECRYPT_ATTEMPT = 'SSN_DECRYPT_ATTEMPT',
  SSN_ACCESS = 'SSN_ACCESS',
  
  // Données bancaires
  BANK_DATA_ENCRYPTED = 'BANK_DATA_ENCRYPTED',
  BANK_DATA_VALIDATED = 'BANK_DATA_VALIDATED',
  BANK_DATA_VALIDATION_FAILED = 'BANK_DATA_VALIDATION_FAILED',
  
  // Documents
  DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED',
  DOCUMENT_DELETED = 'DOCUMENT_DELETED',
  DOCUMENT_ACCESS = 'DOCUMENT_ACCESS',
  
  // Sécurité
  UNAUTHORIZED_ACCESS_ATTEMPT = 'UNAUTHORIZED_ACCESS_ATTEMPT',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Inscription chauffeur
  DRIVER_REGISTRATION_STARTED = 'DRIVER_REGISTRATION_STARTED',
  DRIVER_REGISTRATION_COMPLETED = 'DRIVER_REGISTRATION_COMPLETED',
  DRIVER_REGISTRATION_FAILED = 'DRIVER_REGISTRATION_FAILED',
  DRIVER_DRAFT_SAVED = 'DRIVER_DRAFT_SAVED',
  
  // Email de vérification
  EMAIL_VERIFICATION_SENT = 'EMAIL_VERIFICATION_SENT',
  EMAIL_VERIFICATION_FAILED = 'EMAIL_VERIFICATION_FAILED',
  
  // Suppression chauffeur
  DRIVER_DELETED = 'DRIVER_DELETED',
}

/**
 * Niveaux de gravité pour les logs
 */
export enum AuditLogLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Interface pour les entrées d'audit
 */
export interface AuditLogEntry {
  eventType: AuditEventType;
  userId: string;
  level: AuditLogLevel;
  action: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  success: boolean;
  errorMessage?: string | null;
  timestamp: Timestamp | Date | null;
}

/**
 * Configuration du service d'audit
 */
const AUDIT_CONFIG = {
  collectionName: 'audit_logs',
  maxRetentionPolicy: 365, // jours (conformité RGPD)
  anonymizeAfterDays: 90, // Anonymisation des IPs après 90 jours
};

/**
 * Service d'Audit Logging
 */
class AuditLoggingService {
  private collectionName = AUDIT_CONFIG.collectionName;

  /**
   * Enregistre un événement d'audit
   * 
   * @param entry - Les données de l'événement à logger
   * @returns Promise<void>
   */
  async log(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      
      //  PRIORITÉ: Utiliser l'userId fourni en paramètre d'abord, puis currentUser.uid
      // Cela garantit que l'userId est disponible même si auth.currentUser est temporairement null
      const userId = entry.userId || currentUser?.uid || 'anonymous';
      
      //  VALIDATION CRITIQUE: Si pas d'userId valide, logger en console seulement
      // pour éviter les erreurs Firestore "Missing or insufficient permissions"
      if (!userId || userId === 'anonymous') {
          console.warn('[AuditLogging] Pas d\'userId valide, logging en console seulement:', entry);
          return;
      }


      
      // Récupérer les informations de contexte (IP, User Agent)
      const context = this.getContext();

      // Créer l'entrée d'audit
      const auditEntry: Record<string, unknown> = {
        eventType: entry.eventType,
        userId,
        level: entry.level,
        action: entry.action,
        details: this.sanitizeDetails(entry.details) ?? null,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        success: entry.success,
        errorMessage: entry.errorMessage ?? null,
        timestamp: serverTimestamp(),
      };

      //  NETTOYAGE CRITIQUE : Supprimer les valeurs `undefined` car Firestore ne les accepte pas
      // On convertit les `undefined` récursifs en `null` dans `details`
      if (auditEntry.details) {
        const details = auditEntry.details as Record<string, unknown>;
        Object.keys(details).forEach(key => {
          if (details[key] === undefined) {
            details[key] = null;
          }
        });
      }

      // Ajouter à Firestore
      await addDoc(collection(db, this.collectionName), auditEntry);
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string };
      console.error('[AuditLogging] Erreur lors de l\'écriture dans Firestore:', {
        message: err.message,
        code: err.code,
        entry: entry.eventType
      });
      
      if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
        console.warn('[AuditLogging] Permission refusée - l\'utilisateur est peut-être déconnecté');
      }
    }
  }

  /**
   * Logger un événement de chiffrement SSN
   */
  async logSSNEncryption(userId: string, success: boolean, error?: string): Promise<void> {
    await this.log({
      eventType: AuditEventType.SSN_ENCRYPTED,
      userId,
      level: success ? AuditLogLevel.INFO : AuditLogLevel.ERROR,
      action: 'Chiffrement du SSN/NIR',
      success,
      errorMessage: error,
      details: {
        dataCategory: 'personal_identifiable_information',
        encryptionMethod: 'AES-256-GCM',
      },
    });
  }

  /**
   * Logger un événement de validation bancaire
   */
  async logBankValidation(
    userId: string,
    success: boolean,
    errors?: Record<string, string>
  ): Promise<void> {
    await this.log({
      eventType: success 
        ? AuditEventType.BANK_DATA_VALIDATED 
        : AuditEventType.BANK_DATA_VALIDATION_FAILED,
      userId,
      level: success ? AuditLogLevel.INFO : AuditLogLevel.WARNING,
      action: 'Validation des coordonnées bancaires',
      success,
      details: {
        dataCategory: 'banking_information',
        validationErrors: errors,
      },
    });
  }

  /**
   * Logger un événement de chiffrement bancaire
   */
  async logBankEncryption(userId: string, success: boolean, error?: string): Promise<void> {
    await this.log({
      eventType: AuditEventType.BANK_DATA_ENCRYPTED,
      userId,
      level: success ? AuditLogLevel.INFO : AuditLogLevel.ERROR,
      action: 'Chiffrement des données bancaires',
      success,
      errorMessage: error,
      details: {
        dataCategory: 'banking_information',
        encryptionMethod: 'AES-256-GCM',
      },
    });
  }

  /**
   * Logger un événement d'upload de document
   */
  async logDocumentUpload(
    userId: string,
    documentType: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    await this.log({
      eventType: AuditEventType.DOCUMENT_UPLOADED,
      userId,
      level: success ? AuditLogLevel.INFO : AuditLogLevel.ERROR,
      action: `Upload de document: ${documentType}`,
      success,
      errorMessage: error,
      details: {
        documentType,
        dataCategory: 'document',
      },
    });
  }

  /**
   * Logger une tentative d'accès non autorisée
   */
  async logUnauthorizedAccess(
    userId: string,
    resource: string,
    reason: string
  ): Promise<void> {
    await this.log({
      eventType: AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
      userId,
      level: AuditLogLevel.CRITICAL,
      action: 'Tentative d\'accès non autorisée',
      success: false,
      errorMessage: reason,
      details: {
        resource,
        severity: 'high',
      },
    });
  }

  /**
   * Logger un événement de dépassement de rate limit
   */
  async logRateLimitExceeded(userId: string, operation: string): Promise<void> {
    await this.log({
      eventType: AuditEventType.RATE_LIMIT_EXCEEDED,
      userId,
      level: AuditLogLevel.WARNING,
      action: `Rate limit dépassé pour: ${operation}`,
      success: false,
      details: {
        operation,
        severity: 'medium',
      },
    });
  }

  /**
   * Logger le début d'une inscription chauffeur
   */
  async logDriverRegistrationStarted(userId: string): Promise<void> {
    await this.log({
      eventType: AuditEventType.DRIVER_REGISTRATION_STARTED,
      userId,
      level: AuditLogLevel.INFO,
      action: 'Début inscription chauffeur',
      success: true,
      details: {
        registrationFlow: 'driver_onboarding',
      },
    });
  }

  /**
   * Logger la sauvegarde d'un brouillon
   */
  async logDriverDraftSaved(userId: string, step: number): Promise<void> {
    await this.log({
      eventType: AuditEventType.DRIVER_DRAFT_SAVED,
      userId,
      level: AuditLogLevel.INFO,
      action: `Sauvegarde brouillon - Étape ${step}`,
      success: true,
      details: {
        registrationFlow: 'driver_onboarding',
        step,
      },
    });
  }

  /**
   * Logger la complétion d'une inscription
   */
  async logDriverRegistrationCompleted(userId: string): Promise<void> {
    await this.log({
      eventType: AuditEventType.DRIVER_REGISTRATION_COMPLETED,
      userId,
      level: AuditLogLevel.INFO,
      action: 'Inscription chauffeur complétée',
      success: true,
      details: {
        registrationFlow: 'driver_onboarding',
        status: 'pending_verification',
      },
    });
  }

  /**
   * Logger un échec d'inscription
   */
  async logDriverRegistrationFailed(
    userId: string,
    error: string,
    step?: number
  ): Promise<void> {
    await this.log({
      eventType: AuditEventType.DRIVER_REGISTRATION_FAILED,
      userId,
      level: AuditLogLevel.ERROR,
      action: `Échec inscription${step ? ` - Étape ${step}` : ''}`,
      success: false,
      errorMessage: error,
      details: {
        registrationFlow: 'driver_onboarding',
        step,
      },
    });
  }

  /**
   * Récupère le contexte de la requête (IP, User Agent)
   * Note: Côté client, l'IP n'est pas disponible directement
   * Cette méthode devrait être enrichie côté serveur
   */
  private getContext(): { ipAddress?: string; userAgent?: string } {
    if (typeof window !== 'undefined') {
      return {
        userAgent: navigator.userAgent,
        // IP address sera ajoutée côté serveur via Cloud Function
      };
    }
    return {};
  }

  /**
   * Nettoie les détails pour ne pas logger d'informations sensibles
   * 
   * @param details - Les détails à nettoyer
   * @returns Les détails nettoyés
   */
  private sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!details) return undefined;

    const sanitized = { ...details };
    
    // Liste des champs sensibles à masquer
    const sensitiveFields = ['ssn', 'nir', 'iban', 'bic', 'accountHolder', 'password'];
    
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}

// Export du singleton
export const auditLoggingService = new AuditLoggingService();

// Export par défaut
export default auditLoggingService;
