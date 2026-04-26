/**
 * Service de logging structuré avec niveaux de sévérité
 * Permet de tracer toutes les opérations critiques avec contexte complet
 *
 * @module logger
 */

/**
 * Interface pour les entrées de log
 */
interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARNING' | 'ERROR';
  context: string;
  operation: string;
  userId: string | null;
  status: 'START' | 'SUCCESS' | 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG';
  errorMessage?: string;
  errorCode?: string;
  stack?: string;
  message?: string;
  [key: string]: string | number | boolean | null | undefined | object;
}

/**
 * Type pour les méthodes de logging externes
 */
type LogMethod = (message: string, ...args: unknown[]) => void;

/**
 * Configuration du logger
 */
interface LoggerConfig {
  logToConsole: boolean;
  externalLogger?: {
    info: LogMethod;
    warn: LogMethod;
    error: LogMethod;
  };
}

/**
 * Configuration globale du logger
 * Peut être modifiée pour utiliser un service externe (Sentry, LogRocket, etc.)
 */
const loggerConfig: LoggerConfig = {
  logToConsole: true,
  externalLogger: undefined,
};

/**
 * Configure le logger pour utiliser un service externe
 *
 * @param config - La configuration du logger
 *
 * @example
 * // Utiliser Sentry pour le logging en production
 * configureLogger({
 *   logToConsole: false,
 *   externalLogger: {
 *     info: (msg, data) => Sentry.captureMessage(msg, { level: 'info', extra: data }),
 *     warn: (msg, data) => Sentry.captureMessage(msg, { level: 'warning', extra: data }),
 *     error: (msg, data) => Sentry.captureException(new Error(msg), { extra: data }),
 *   }
 * });
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  if (config.logToConsole !== undefined) {
    loggerConfig.logToConsole = config.logToConsole;
  }
  if (config.externalLogger !== undefined) {
    loggerConfig.externalLogger = config.externalLogger;
  }
}

/**
 * Service de logging structuré avec niveaux de sévérité
 * Permet de tracer toutes les opérations critiques avec contexte complet
 */
export class StructuredLogger {
  private userId: string | null = null;
  private context: string;

  /**
   * Crée une nouvelle instance de StructuredLogger
   *
   * @param userId - L'ID de l'utilisateur (optionnel)
   * @param context - Le contexte du log (ex: 'DriverRegistration', 'PaymentProcessing')
   */
  constructor(userId: string | null = null, context: string = 'Application') {
    this.userId = userId;
    this.context = context;
  }

  /**
   * Logger une entrée vers la console et/ou un service externe
   *
   * @param logEntry - L'entrée de log à enregistrer
   * @param consoleMethod - La méthode console à utiliser (log, warn, error)
   */
  private logToConsole(logEntry: LogEntry, consoleMethod: LogMethod): void {
    if (!loggerConfig.logToConsole) {
      return;
    }
    
    const message = `[${this.context}] ${this.getStatusEmoji(logEntry.status)} ${this.getStatusText(logEntry.status)}: ${logEntry.operation}`;
    consoleMethod(message, logEntry);
  }

  /**
   * Logger vers un service externe si configuré
   *
   * @param logEntry - L'entrée de log à enregistrer
   */
  private logToExternal(logEntry: LogEntry): void {
    if (!loggerConfig.externalLogger) {
      return;
    }

    const message = `[${this.context}] ${logEntry.operation}`;
    const data = logEntry;

    switch (logEntry.level) {
      case 'INFO':
        loggerConfig.externalLogger.info(message, data);
        break;
      case 'WARNING':
        loggerConfig.externalLogger.warn(message, data);
        break;
      case 'ERROR':
        loggerConfig.externalLogger.error(message, data);
        break;
    }
  }

  /**
   * Obtenir l'emoji correspondant au statut
   *
   * @param status - Le statut du log
   * @returns L'emoji correspondant
   */
  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'START':
        return '▶️';
      case 'SUCCESS':
        return '';
      case 'ERROR':
        return '❌';
      case 'WARNING':
        return '⚠️';
      default:
        return '📝';
    }
  }

  /**
   * Obtenir le texte correspondant au statut
   *
   * @param status - Le statut du log
   * @returns Le texte correspondant
   */
  private getStatusText(status: string): string {
    switch (status) {
      case 'START':
        return 'DÉBUT';
      case 'SUCCESS':
        return 'SUCCÈS';
      case 'ERROR':
        return 'ERREUR';
      case 'WARNING':
        return 'AVERTISSEMENT';
      default:
        return 'INFO';
    }
  }

  /**
   * Logger le début d'une opération
   *
   * @param operation - Le nom de l'opération
   * @param details - Détails additionnels à logger
   */
  logStart(operation: string, details?: Record<string, unknown>): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      context: this.context,
      operation,
      userId: this.userId,
      status: 'START',
      ...details
    };
    
    this.logToConsole(logEntry, console.log);
    this.logToExternal(logEntry);
  }

  /**
   * Logger la réussite d'une opération
   *
   * @param operation - Le nom de l'opération
   * @param details - Détails additionnels à logger
   */
  logSuccess(operation: string, details?: Record<string, unknown>): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      context: this.context,
      operation,
      userId: this.userId,
      status: 'SUCCESS',
      ...details
    };
    
    this.logToConsole(logEntry, console.log);
    this.logToExternal(logEntry);
  }

  /**
   * Logger une erreur avec stack trace complète
   *
   * @param operation - Le nom de l'opération
   * @param error - L'erreur à logger
   * @param details - Détails additionnels à logger
   */
  logError(operation: string, error: Error, details?: Record<string, unknown>): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      context: this.context,
      operation,
      userId: this.userId,
      status: 'ERROR',
      errorMessage: error.message,
      errorCode: (error as Error & { code?: string }).code,
      stack: error.stack,
      ...details
    };
    
    this.logToConsole(logEntry, console.error);
    this.logToExternal(logEntry);
  }

  /**
   * Logger un avertissement
   *
   * @param operation - Le nom de l'opération
   * @param message - Le message d'avertissement
   * @param details - Détails additionnels à logger
   */
  logWarning(operation: string, message: string, details?: Record<string, unknown>): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'WARNING',
      context: this.context,
      operation,
      userId: this.userId,
      status: 'WARNING',
      message,
      ...details
    };
    
    this.logToConsole(logEntry, console.warn);
    this.logToExternal(logEntry);
  }

  /**
   * Mettre à jour le userId
   *
   * @param userId - Le nouvel ID utilisateur
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Mettre à jour le contexte
   *
   * @param context - Le nouveau contexte
   */
  setContext(context: string): void {
    this.context = context;
  }

  /**
   * Logger un message informatif (compatibilité avec l'ancienne API)
   *
   * @param message - Le message à logger
   * @param data - Données additionnelles
   *
   * @deprecated Utilisez logStart() ou logSuccess() pour plus de précision
   */
  info(message: string, data?: Record<string, unknown>): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      context: this.context,
      operation: message,
      userId: this.userId,
      status: 'INFO',
      ...data
    };
    
    this.logToConsole(logEntry, console.info);
    this.logToExternal(logEntry);
  }

  /**
   * Logger un avertissement (compatibilité avec l'ancienne API)
   *
   * @param message - Le message à logger
   * @param data - Données additionnelles
   *
   * @deprecated Utilisez logWarning() pour plus de précision
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.logWarning(message, message, data);
  }

  /**
   * Logger une erreur (compatibilité avec l'ancienne API)
   *
   * @param message - Le message d'erreur
   * @param error - L'erreur ou les données additionnelles
   *
   * @deprecated Utilisez logError() pour plus de précision
   */
  error(message: string, error?: Error | unknown): void {
    if (error instanceof Error) {
      this.logError(message, error);
    } else {
      const extraData = (error !== null && typeof error === 'object') ? (error as Record<string, unknown>) : {};
      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        context: this.context,
        operation: message,
        userId: this.userId,
        status: 'ERROR',
        errorMessage: message,
        ...extraData
      };
      
      this.logToConsole(logEntry, console.error);
      this.logToExternal(logEntry);
    }
  }

  /**
   * Logger un message de debug (compatibilité avec l'ancienne API)
   *
   * @param message - Le message à logger
   * @param data - Données additionnelles
   *
   * @deprecated Les logs de debug sont désactivés en production
   */
  debug(message: string, data?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'production') {
      return;
    }
    
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      context: this.context,
      operation: message,
      userId: this.userId,
      status: 'DEBUG',
      ...data
    };
    
    this.logToConsole(logEntry, console.debug);
    // Pas d'envoi vers un service externe pour les logs de debug
  }
}

/**
 * Crée une nouvelle instance de StructuredLogger avec un contexte spécifique
 *
 * @param context - Le contexte du logger
 * @param userId - L'ID utilisateur optionnel
 * @returns Une nouvelle instance de StructuredLogger
 *
 * @example
 * const logger = createLogger('PaymentProcessing', 'user123');
 * logger.logStart('processPayment', { amount: 100 });
 */
export function createLogger(context: string, userId?: string): StructuredLogger {
  return new StructuredLogger(userId || null, context);
}

/**
 * Instance singleton du logger pour compatibilité avec le code existant
 * Cette instance utilise un contexte générique 'Application'
 *
 * @deprecated Préférez utiliser createLogger() pour un contexte spécifique
 *
 * @example
 * // Ancienne utilisation (toujours supportée pour compatibilité)
 * import { logger } from '@/utils/logger';
 * logger.info('Message');
 *
 * // Nouvelle utilisation recommandée
 * import { createLogger } from '@/utils/logger';
 * const logger = createLogger('MyContext');
 * logger.logStart('myOperation');
 */
export const logger = new StructuredLogger(null, 'Application');
