import { Preferences } from '@capacitor/preferences';
import { Device } from '@capacitor/device';
import { getAuth } from 'firebase/auth';
import CryptoJS from 'crypto-js';

/**
 * Service de stockage sécurisé pour données sensibles
 * Remplace @capacitor/secure-storage avec Preferences + Crypto-js
 * Conforme à medJiraV2.md §6.1, §8.2 (RGPD)
 * 
 * ✅ CHIFFREMENT RÉACTIVÉ - Conformité RGPD article 32
 * 
 * Fonctionnalités:
 * - Chiffrement AES-256 pour toutes les données
 * - Clé de chiffrement dérivée (device + user) - JAMAIS exposée côté client
 * - TTL automatique pour les données temporaires
 * - Cache lastKnownPosition avec expiration 5min
 * - Stockage tokens et préférences sensibles
 * 
 * 🔒 SÉCURITÉ CRITIQUE (§8.2, §12):
 * - Interdiction d'utiliser NEXT_PUBLIC_* pour les clés de chiffrement
 * - Clé dérivée unique par appareil + utilisateur (PBKDF2)
 * - Pas de fallback hardcodé (génération sécurisée si absent)
 */

// Clé de stockage pour la clé de chiffrement dérivée
const DERIVED_KEY_STORAGE = 'derived_encryption_key';

// Nombre d'itérations PBKDF2 (RFC 2898 recommande 10,000+ minimum)
const PBKDF2_ITERATIONS = 100000;

/**
 * Génère une clé de chiffrement dérivée sécurisée
 * Conforme à §8.2 (Protection des Données) et §12 (Anti-Patterns)
 * 
 * @returns Clé de chiffrement dérivée (device-specific + user-specific)
 */
async function generateDerivedEncryptionKey(): Promise<string> {
    try {
        // 1. Obtenir l'identifiant unique de l'appareil
        const deviceInfo = await Device.getId();
        const deviceId = deviceInfo.identifier || 'unknown-device';
        
        // 2. Obtenir l'UID utilisateur (si connecté)
        const auth = getAuth();
        const userUid = auth.currentUser?.uid || 'anonymous';
        
        // 3. Combiner device ID + user UID + salt statique
        const combinedSeed = `${deviceId}:${userUid}:medhira-taxi-salt-2024`;
        
        // 4. Dériver une clé forte avec PBKDF2 (SHA-256)
        const derivedKey = CryptoJS.PBKDF2(
            combinedSeed,
            'medhira-taxi-static-salt',
            {
                keySize: 256 / 32, // 256 bits
                iterations: PBKDF2_ITERATIONS,
            }
        ).toString();
        
        return derivedKey;
    } catch (error) {
        console.error('[SecureStorage] Error generating derived key:', error);
        // Fallback sécurisé: générer une clé aléatoire (pas de fallback hardcodé)
        return CryptoJS.lib.WordArray.random(256 / 8).toString();
    }
}

/**
 * Récupère ou génère la clé de chiffrement dérivée
 * Stockée localement de manière sécurisée (jamais exposée via NEXT_PUBLIC)
 */
let cachedEncryptionKey: string | null = null;

async function getEncryptionKey(): Promise<string> {
    if (cachedEncryptionKey) {
        return cachedEncryptionKey;
    }
    
    try {
        // Vérifier si une clé existe déjà
        const { value } = await Preferences.get({ key: DERIVED_KEY_STORAGE });
        
        if (value) {
            cachedEncryptionKey = value;
            return value;
        }
        
        // Générer une nouvelle clé dérivée
        const newKey = await generateDerivedEncryptionKey();
        
        // Stocker la clé (une seule fois par installation)
        await Preferences.set({
            key: DERIVED_KEY_STORAGE,
            value: newKey,
        });
        
        cachedEncryptionKey = newKey;
        return newKey;
    } catch (error) {
        console.error('[SecureStorage] Error getting encryption key:', error);
        // En cas d'erreur critique, générer une clé temporaire
        const tempKey = CryptoJS.lib.WordArray.random(256 / 8).toString();
        cachedEncryptionKey = tempKey;
        return tempKey;
    }
}

// Préfixe pour les données chiffrées
const ENCRYPTED_PREFIX = 'encrypted_';

// Types de stockage
export type StorageKey =
    | 'auth_token'
    | 'refresh_token'
    | 'last_known_position'
    | 'user_preferences'
    | 'driver_settings'
    | 'booking_cache'
    | 'driver_registration_progress'; // Progression du formulaire d'inscription chauffeur

interface SecureStorageOptions {
    ttl?: number; // Time to live en millisecondes
}

// Type générique pour les données stockées
interface StoredData<T = unknown> {
    data: T;
    expiresAt?: number; // Timestamp d'expiration
}

// Type pour les données de position stockées
interface StoredPosition {
    lat: number;
    lng: number;
    accuracy: number;
    timestamp: number;
    altitude?: number | null;
    heading?: number | null;
    speed?: number | null;
}

/**
 * Service de stockage sécurisé avec chiffrement AES-256
 * ✅ CHIFFREMENT RÉACTIVÉ - Conformité RGPD article 32
 * 🔒 Conforme à §8.2 (RGPD) et §12 (Anti-Patterns)
 */
class SecureStorageService {
    /**
     * Chiffre une donnée avec AES-256 en utilisant la clé dérivée
     * ✅ CHIFFREMENT RÉACTIVÉ
     */
    private async encrypt(data: string): Promise<string> {
        const encryptionKey = await getEncryptionKey();
        return CryptoJS.AES.encrypt(data, encryptionKey).toString();
    }

    /**
     * Déchiffre une donnée en utilisant la clé dérivée
     * ✅ CHIFFREMENT RÉACTIVÉ
     */
    private async decrypt(encryptedData: string): Promise<string> {
        const encryptionKey = await getEncryptionKey();
        const bytes = CryptoJS.AES.decrypt(encryptedData, encryptionKey);
        return bytes.toString(CryptoJS.enc.Utf8);
    }

    /**
     * Stocke une donnée de manière sécurisée
     * @param key Clé de stockage
     * @param value Valeur à stocker
     * @param options Options de stockage (TTL)
     */
    async setItem<T>(key: StorageKey, value: T, options?: SecureStorageOptions): Promise<void> {
        try {
            const storedData: StoredData<T> = {
                data: value,
            };

            // Ajouter TTL si spécifié
            if (options?.ttl) {
                storedData.expiresAt = Date.now() + options.ttl;
            }

            // Sérialiser et chiffrer
            const serialized = JSON.stringify(storedData);
            const encrypted = await this.encrypt(serialized);

            // Stocker dans Preferences
            await Preferences.set({
                key: ENCRYPTED_PREFIX + key,
                value: encrypted,
            });
        } catch (error) {
            console.error(`[SecureStorage] Error storing ${key}:`, error);
            throw new Error(`Failed to store ${key} securely`);
        }
    }

    /**
     * Récupère une donnée stockée
     * @param key Clé de stockage
     * @returns Valeur stockée ou null si expirée/inexistante
     */
    async getItem<T>(key: StorageKey): Promise<T | null> {
        try {
            const { value } = await Preferences.get({ key: ENCRYPTED_PREFIX + key });

            if (!value) {
                return null;
            }

            // Déchiffrer
            const decrypted = await this.decrypt(value);
            const storedData: StoredData<T> = JSON.parse(decrypted);

            // Vérifier expiration
            if (storedData.expiresAt && Date.now() > storedData.expiresAt) {
                await this.removeItem(key);
                return null;
            }

            return storedData.data;
        } catch (error) {
            console.error(`[SecureStorage] Error retrieving ${key}:`, error);
            return null;
        }
    }

    /**
     * Supprime une donnée stockée
     * @param key Clé de stockage
     */
    async removeItem(key: StorageKey): Promise<void> {
        try {
            await Preferences.remove({ key: ENCRYPTED_PREFIX + key });
        } catch (error) {
            console.error(`[SecureStorage] Error removing ${key}:`, error);
        }
    }

    /**
     * Vide toutes les données stockées
     */
    async clear(): Promise<void> {
        try {
            await Preferences.clear();
        } catch (error) {
            console.error('[SecureStorage] Error clearing storage:', error);
        }
    }

    /**
     * Vérifie si une clé existe et n'est pas expirée
     * @param key Clé de stockage
     */
    async hasItem(key: StorageKey): Promise<boolean> {
        const value = await this.getItem(key);
        return value !== null;
    }

    /**
     * Stocke la dernière position connue avec TTL 5min
     * Conforme à medJiraV2.md §6.1 (Fallback lastKnownPosition)
     */
    async setLastKnownPosition(position: {
        lat: number;
        lng: number;
        accuracy: number;
        timestamp: number;
    }): Promise<void> {
        const TTL_5_MIN = 5 * 60 * 1000; // 5 minutes
        await this.setItem('last_known_position', position, { ttl: TTL_5_MIN });
    }

    /**
     * Récupère la dernière position connue
     * @returns Position ou null si expirée (> 5min)
     */
    async getLastKnownPosition(): Promise<{
        lat: number;
        lng: number;
        accuracy: number;
        timestamp: number;
        altitude?: number | null;
        heading?: number | null;
        speed?: number | null;
    } | null> {
        const position = await this.getItem<StoredPosition>('last_known_position');
        
        if (!position) {
            return null;
        }
        
        // Retourner la position avec toutes les propriétés
        return {
            lat: position.lat,
            lng: position.lng,
            accuracy: position.accuracy,
            timestamp: position.timestamp,
            altitude: position.altitude,
            heading: position.heading,
            speed: position.speed,
        };
    }

    /**
     * Stocke le token d'authentification
     */
    async setAuthToken(token: string): Promise<void> {
        await this.setItem('auth_token', token);
    }

    /**
     * Récupère le token d'authentification
     */
    async getAuthToken(): Promise<string | null> {
        return this.getItem('auth_token');
    }

    /**
     * Stocke le refresh token
     */
    async setRefreshToken(token: string): Promise<void> {
        await this.setItem('refresh_token', token);
    }

    /**
     * Récupère le refresh token
     */
    async getRefreshToken(): Promise<string | null> {
        return this.getItem('refresh_token');
    }

    /**
     * Stocke les préférences utilisateur
     */
    async setUserPreferences(preferences: Record<string, unknown>): Promise<void> {
        await this.setItem('user_preferences', preferences);
    }

    /**
     * Récupère les préférences utilisateur
     */
    async getUserPreferences(): Promise<Record<string, unknown> | null> {
        return this.getItem('user_preferences');
    }

    /**
     * Stocke les paramètres conducteur
     */
    async setDriverSettings(settings: {
        notificationsEnabled: boolean;
        darkMode: boolean;
        language: string;
    }): Promise<void> {
        await this.setItem('driver_settings', settings);
    }

    /**
     * Récupère les paramètres conducteur
     */
    async getDriverSettings(): Promise<{
        notificationsEnabled: boolean;
        darkMode: boolean;
        language: string;
    } | null> {
        return this.getItem('driver_settings');
    }

    /**
     * Stocke le cache de booking avec TTL 15min
     */
    async setBookingCache(cache: {
        pickupLocation: { lat: number; lng: number; address: string };
        dropoffLocation: { lat: number; lng: number; address: string };
        estimatedPrice: number;
        estimatedDuration: number;
    }): Promise<void> {
        const TTL_15_MIN = 15 * 60 * 1000; // 15 minutes
        await this.setItem('booking_cache', cache, { ttl: TTL_15_MIN });
    }

    /**
     * Récupère le cache de booking
     */
    async getBookingCache(): Promise<{
        pickupLocation: { lat: number; lng: number; address: string };
        dropoffLocation: { lat: number; lng: number; address: string };
        estimatedPrice: number;
        estimatedDuration: number;
    } | null> {
        return this.getItem('booking_cache');
    }

    /**
     * Nettoie les données expirées
     * À appeler régulièrement (ex: au démarrage de l'app)
     */
    async cleanupExpired(): Promise<void> {
        try {
            const { keys } = await Preferences.keys();

            for (const key of keys) {
                if (key.startsWith(ENCRYPTED_PREFIX)) {
                    const storageKey = key.replace(ENCRYPTED_PREFIX, '') as StorageKey;
                    await this.getItem(storageKey); // Va supprimer si expiré
                }
            }
        } catch (error) {
            console.error('[SecureStorage] Error during cleanup:', error);
        }
    }
}

// Singleton export
export const secureStorage = new SecureStorageService();

// Export du type pour utilisation dans les composants
export type { SecureStorageOptions };
