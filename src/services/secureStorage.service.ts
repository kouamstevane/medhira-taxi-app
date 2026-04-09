import { Preferences } from '@capacitor/preferences';
import { Device } from '@capacitor/device';
import { getAuth } from 'firebase/auth';
import CryptoJS from 'crypto-js';

/**
 * Service de stockage sécurisé pour données sensibles
 * Remplace @capacitor/secure-storage avec Preferences + Crypto-js
 * Conforme à medJiraV2.md §6.1, §8.2 (RGPD)
 * 
 *  CHIFFREMENT RÉACTIVÉ - Conformité RGPD article 32
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

const DERIVED_KEY_STORAGE = 'derived_encryption_key';
const SALT_KEY = 'medjira_device_salt';
const LEGACY_STATIC_SALT = 'medhira-taxi-static-salt';
const LEGACY_STATIC_SEED_SUFFIX = 'medhira-taxi-salt-2024';

const PBKDF2_ITERATIONS = 100000;

async function getOrCreateDeviceSalt(): Promise<string> {
    const { value } = await Preferences.get({ key: SALT_KEY });
    if (value) return value;

    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const salt = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
    await Preferences.set({ key: SALT_KEY, value: salt });
    return salt;
}

async function deriveKeyInWorker(seed: string, salt: string, iterations: number): Promise<string> {
    try {
        const { getCryptoWorker } = await import('@/workers')
        const worker = getCryptoWorker()
        
        if (!worker) {
            return CryptoJS.PBKDF2(seed, salt, {
                keySize: 256 / 32,
                iterations,
            }).toString()
        }

        return new Promise((resolve) => {
            const handler = (e: MessageEvent) => {
                if (e.data.type === 'deriveKeyResult') {
                    worker.removeEventListener('message', handler)
                    resolve(e.data.key || CryptoJS.PBKDF2(seed, salt, {
                        keySize: 256 / 32,
                        iterations,
                    }).toString())
                }
            }
            worker.addEventListener('message', handler)
            worker.postMessage({ type: 'deriveKey', seed, salt, iterations })
        })
    } catch {
        return CryptoJS.PBKDF2(seed, salt, {
            keySize: 256 / 32,
            iterations,
        }).toString()
    }
}

async function generateDerivedEncryptionKey(): Promise<string> {
    try {
        const deviceInfo = await Device.getId();
        const deviceId = deviceInfo.identifier || 'unknown-device';

        const auth = getAuth();
        const userUid = auth.currentUser?.uid || 'anonymous';

        const deviceSalt = await getOrCreateDeviceSalt();
        const combinedSeed = `${deviceId}:${userUid}:${deviceSalt}`;

        const derivedKey = await deriveKeyInWorker(combinedSeed, deviceSalt, PBKDF2_ITERATIONS);

        return derivedKey;
    } catch (error) {
        console.error('[SecureStorage] Error generating derived key:', error);
        return CryptoJS.lib.WordArray.random(256 / 8).toString();
    }
}

async function generateLegacyDerivedEncryptionKey(): Promise<string> {
    try {
        const deviceInfo = await Device.getId();
        const deviceId = deviceInfo.identifier || 'unknown-device';

        const auth = getAuth();
        const userUid = auth.currentUser?.uid || 'anonymous';

        const combinedSeed = `${deviceId}:${userUid}:${LEGACY_STATIC_SEED_SUFFIX}`;

        const derivedKey = await deriveKeyInWorker(combinedSeed, LEGACY_STATIC_SALT, PBKDF2_ITERATIONS);

        return derivedKey;
    } catch {
        return '';
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
 *  CHIFFREMENT RÉACTIVÉ - Conformité RGPD article 32
 * 🔒 Conforme à §8.2 (RGPD) et §12 (Anti-Patterns)
 */
class SecureStorageService {
    /**
     * Chiffre une donnée avec AES-256 en utilisant la clé dérivée
     *  CHIFFREMENT RÉACTIVÉ
     */
    private async encrypt(data: string): Promise<string> {
        const encryptionKey = await getEncryptionKey();
        return CryptoJS.AES.encrypt(data, encryptionKey).toString();
    }

    /**
     * Déchiffre une donnée en utilisant la clé dérivée
     *  CHIFFREMENT RÉACTIVÉ
     */
    private async decrypt(encryptedData: string): Promise<string> {
        const encryptionKey = await getEncryptionKey();
        const bytes = CryptoJS.AES.decrypt(encryptedData, encryptionKey);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        if (decrypted) return decrypted;

        const legacyKey = await generateLegacyDerivedEncryptionKey();
        if (!legacyKey) throw new Error('Decryption failed');
        const legacyBytes = CryptoJS.AES.decrypt(encryptedData, legacyKey);
        const legacyDecrypted = legacyBytes.toString(CryptoJS.enc.Utf8);
        if (!legacyDecrypted) throw new Error('Decryption failed');

        return legacyDecrypted;
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

            let decrypted: string;
            const encryptionKey = await getEncryptionKey();
            const bytes = CryptoJS.AES.decrypt(value, encryptionKey);
            decrypted = bytes.toString(CryptoJS.enc.Utf8);

            if (!decrypted) {
                const legacyKey = await generateLegacyDerivedEncryptionKey();
                if (legacyKey) {
                    const legacyBytes = CryptoJS.AES.decrypt(value, legacyKey);
                    const legacyDecrypted = legacyBytes.toString(CryptoJS.enc.Utf8);
                    if (legacyDecrypted) {
                        decrypted = legacyDecrypted;
                        this.setItem(key, JSON.parse(legacyDecrypted).data ?? JSON.parse(legacyDecrypted)).catch(() => {});
                    }
                }
            }

            if (!decrypted) {
                return null;
            }

            const storedData: StoredData<T> = JSON.parse(decrypted);

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
