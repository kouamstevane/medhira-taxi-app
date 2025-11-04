/**
 * Logger Centralisé
 * 
 * Remplace console.log pour une gestion centralisée des logs
 * avec niveaux, timestamps et envoi potentiel vers un service externe.
 * 
 * @module utils/logger
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: any;
  stack?: string;
}

class Logger {
  private isDevelopment: boolean;
  private logs: LogEntry[] = [];

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  /**
   * Formater un message de log
   */
  private formatMessage(level: LogLevel, message: string, data?: any): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      data,
    };

    // Capturer la stack trace pour les erreurs
    if (level === 'error' && data instanceof Error) {
      entry.stack = data.stack;
    }

    return entry;
  }

  /**
   * Logger un message dans la console
   */
  private logToConsole(entry: LogEntry): void {
    const { level, message, timestamp, data } = entry;
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    switch (level) {
      case 'debug':
        console.debug(prefix, message, data || '');
        break;
      case 'info':
        console.info(prefix, message, data || '');
        break;
      case 'warn':
        console.warn(prefix, message, data || '');
        break;
      case 'error':
        console.error(prefix, message, data || '');
        if (entry.stack) {
          console.error('Stack:', entry.stack);
        }
        break;
    }
  }

  /**
   * Envoyer le log vers un service externe (Sentry, LogRocket, etc.)
   */
  private sendToExternalService(entry: LogEntry): void {
    // TODO: Intégrer avec Sentry ou autre service de monitoring
    // Exemple: Sentry.captureException(entry)
  }

  /**
   * Enregistrer un log
   */
  private log(level: LogLevel, message: string, data?: any): void {
    const entry = this.formatMessage(level, message, data);

    // Stocker le log en mémoire (limité aux 100 derniers)
    this.logs.push(entry);
    if (this.logs.length > 100) {
      this.logs.shift();
    }

    // Logger dans la console en développement
    if (this.isDevelopment) {
      this.logToConsole(entry);
    }

    // Envoyer les erreurs vers un service externe en production
    if (!this.isDevelopment && level === 'error') {
      this.sendToExternalService(entry);
    }
  }

  /**
   * Log de niveau DEBUG (détails techniques)
   */
  debug(message: string, data?: any): void {
    this.log('debug', message, data);
  }

  /**
   * Log de niveau INFO (informations générales)
   */
  info(message: string, data?: any): void {
    this.log('info', message, data);
  }

  /**
   * Log de niveau WARN (avertissements)
   */
  warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  /**
   * Log de niveau ERROR (erreurs)
   */
  error(message: string, error?: any): void {
    this.log('error', message, error);
  }

  /**
   * Récupérer l'historique des logs
   */
  getHistory(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Nettoyer l'historique
   */
  clearHistory(): void {
    this.logs = [];
  }
}

// Instance singleton du logger
export const logger = new Logger();

// Export des fonctions de logging pour utilisation directe
export const { debug, info, warn, error } = logger;
