/**
 * Configuration API
 * 
 * Gestion centralisée des appels API avec fetch ou axios.
 * Intercepteurs pour les erreurs, authentification, etc.
 * 
 * @module config/api
 */

import { env } from './env';
import { logger } from '@/utils/logger';

/**
 * Configuration de base pour les requêtes API
 */
const API_CONFIG = {
  baseURL: env.apiUrl || 'http://localhost:3000/api',
  timeout: 30000, // 30 secondes
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * Interface pour les options de requête
 */
interface RequestOptions extends RequestInit {
  timeout?: number;
  requiresAuth?: boolean;
}

/**
 * Classe API Client
 */
class APIClient {
  private baseURL: string;
  private defaultHeaders: HeadersInit;

  constructor(baseURL: string, headers: HeadersInit) {
    this.baseURL = baseURL;
    this.defaultHeaders = headers;
  }

  /**
   * Obtenir le token d'authentification via Firebase Auth
   */
  private async getAuthToken(): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    try {
      const { getAuth } = await import('firebase/auth');
      const user = getAuth().currentUser;
      return user ? await user.getIdToken() : null;
    } catch {
      return null;
    }
  }

  /**
   * Construire les headers de la requête
   */
  private async buildHeaders(requiresAuth: boolean = false): Promise<HeadersInit> {
    const headers: HeadersInit = { ...this.defaultHeaders };

    if (requiresAuth) {
      const token = await this.getAuthToken();
      if (token) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  /**
   * Gérer les erreurs de requête
   */
  private async handleResponse(response: Response): Promise<unknown> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: response.statusText,
      }));

      logger.error(`API Error: ${response.status}`, error);

      throw {
        status: response.status,
        message: error.message || 'Une erreur est survenue',
        data: error,
      };
    }

    return response.json();
  }

  /**
   * Effectuer une requête GET
   */
  async get<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { requiresAuth = false, timeout = API_CONFIG.timeout, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'GET',
        headers: await this.buildHeaders(requiresAuth),
        signal: controller.signal,
        ...fetchOptions,
      });

      return (await this.handleResponse(response)) as T;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Request timeout', { endpoint });
        throw new Error('La requête a expiré');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Effectuer une requête POST
   */
  async post<T>(endpoint: string, data?: unknown, options: RequestOptions = {}): Promise<T> {
    const { requiresAuth = false, timeout = API_CONFIG.timeout, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        headers: await this.buildHeaders(requiresAuth),
        body: JSON.stringify(data),
        signal: controller.signal,
        ...fetchOptions,
      });

      return (await this.handleResponse(response)) as T;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Request timeout', { endpoint });
        throw new Error('La requête a expiré');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Effectuer une requête PUT
   */
  async put<T>(endpoint: string, data?: unknown, options: RequestOptions = {}): Promise<T> {
    const { requiresAuth = false, timeout = API_CONFIG.timeout, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'PUT',
        headers: await this.buildHeaders(requiresAuth),
        body: JSON.stringify(data),
        signal: controller.signal,
        ...fetchOptions,
      });

      return (await this.handleResponse(response)) as T;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Request timeout', { endpoint });
        throw new Error('La requête a expiré');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Effectuer une requête DELETE
   */
  async delete<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { requiresAuth = false, timeout = API_CONFIG.timeout, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'DELETE',
        headers: await this.buildHeaders(requiresAuth),
        signal: controller.signal,
        ...fetchOptions,
      });

      return (await this.handleResponse(response)) as T;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Request timeout', { endpoint });
        throw new Error('La requête a expiré');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Instance API client exportée
 */
export const apiClient = new APIClient(API_CONFIG.baseURL, API_CONFIG.headers);

/**
 * Helper functions pour les appels API courants
 */
export const api = {
  get: <T>(endpoint: string, options?: RequestOptions) => apiClient.get<T>(endpoint, options),
  post: <T>(endpoint: string, data?: unknown, options?: RequestOptions) => apiClient.post<T>(endpoint, data, options),
  put: <T>(endpoint: string, data?: unknown, options?: RequestOptions) => apiClient.put<T>(endpoint, data, options),
  delete: <T>(endpoint: string, options?: RequestOptions) => apiClient.delete<T>(endpoint, options),
};
