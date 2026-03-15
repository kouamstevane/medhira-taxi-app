/**
 * Service de chiffrement pour les données sensibles (SSN/NIR, Données Bancaires)
 * Utilise l'API Web Crypto (SubtleCrypto) avec AES-256-GCM
 * 
 * IMPORTANT - NOTE DE SÉCURITÉ ⚠️
 * 
 * @deprecated CE SERVICE EST DÉPRÉCIÉ ET NE DOIT PLUS ÊTRE UTILISÉ.
 * 
 * Utilisez plutôt `serverEncryptionService` depuis `src/services/server-encryption.service.ts`
 * qui chiffre les données côté serveur via Firebase Cloud Functions.
 * 
 * Raison de la dépréciation:
 * - La clé de chiffrement était accessible dans le code client (contournable)
 * - Le salt global était stocké dans localStorage (vulnérable aux XSS)
 * - Ne protégeait pas réellement contre les attaques
 * 
 * Migration vers le chiffrement côté serveur:
 * 1. Remplacer `import { encryptionService } from '@/services/encryption.service'`
 *    par `import { serverEncryptionService } from '@/services/server-encryption.service'`
 * 2. Remplacer `encryptionService.encrypt(data)` par `serverEncryptionService.encrypt(data)`
 * 3. Remplacer `encryptionService.decrypt(data)` par `serverEncryptionService.decrypt(data)` (si utilisé)
 * 
 * Le nouveau service utilise:
 * - Firebase Cloud Functions pour le chiffrement côté serveur
 * - Firebase Secret Manager pour stocker la clé de chiffrement
 * - AES-256-GCM avec IV et salt uniques par chiffrement
 * 
 * @module EncryptionService
 * @deprecated Utilisez serverEncryptionService à la place
 * @see serverEncryptionService
 */

/**
 * Configuration du chiffrement
 */
const ENCRYPTION_CONFIG = {
  algorithm: 'AES-GCM',
  keyLength: 256, // bits
  pbkdf2Iterations: 100000,
  ivLength: 12, // bytes (recommandé pour GCM)
  saltLength: 16, // bytes
} as const;

/**
 * Type pour les données chiffrées
 */
export interface EncryptedData {
  data: string; // Données chiffrées en base64
  iv: string; // IV en base64
  salt: string; // Salt en base64 (unique par chiffrement)
}

/**
 * Service de chiffrement
 * 
 * NOTE: Ce service utilise un salt global pour la dérivation de clé.
 * Le salt est stocké avec les données chiffrées pour permettre le déchiffrement.
 * 
 * @deprecated Utilisez serverEncryptionService à la place
 */
class EncryptionService {
  private cryptoKey: CryptoKey | null = null;
  private readonly PASSPHRASE_ENV_VAR = 'SSN_ENCRYPTION_KEY';
  private globalSalt: Uint8Array | null = null;
  private deprecationWarningShown = false;

  /**
   * Initialise le service avec une clé dérivée de la passphrase
   * 
   * IMPORTANT: En production, utiliser Firebase Cloud Functions
   * avec Firebase Secrets Manager pour stocker la passphrase de manière sécurisée.
   * 
   * @deprecated Utilisez serverEncryptionService à la place
   */
  async initialize(): Promise<void> {
    // Afficher un avertissement de dépréciation une seule fois
    if (!this.deprecationWarningShown && typeof console !== 'undefined') {
      console.warn(
        'AVERTISSEMENT: encryption.service est déprécié.\n' +
        'Utilisez plutôt serverEncryptionService depuis src/services/server-encryption.service.ts\n' +
        'Le chiffrement côté serveur est plus sécurisé.'
      );
      this.deprecationWarningShown = true;
    }
    if (this.cryptoKey) {
      return; // Déjà initialisé
    }

    // Récupérer la passphrase depuis les variables d'environnement
    const passphrase = this.getPassphrase();
    
    if (!passphrase) {
      throw new Error('SSN_ENCRYPTION_KEY non définie dans les variables d\'environnement. Contactez l\'administrateur.');
    }

    // Générer un salt global unique pour cette instance de l'application
    // Ce salt sera utilisé pour dériver la clé de chiffrement
    if (!this.globalSalt) {
      // Essayer de récupérer le salt depuis localStorage (persistance entre sessions)
      const storedSalt = localStorage.getItem('encryption_global_salt');
      if (storedSalt) {
        this.globalSalt = this.base64ToArrayBuffer(storedSalt);
      } else {
        // Générer un nouveau salt et le stocker
        this.globalSalt = crypto.getRandomValues(new Uint8Array(ENCRYPTION_CONFIG.saltLength));
        localStorage.setItem('encryption_global_salt', this.arrayBufferToBase64(this.globalSalt));
      }
    }

    // Dériver la clé de chiffrement avec le salt global
    this.cryptoKey = await this.deriveKey(passphrase, this.globalSalt);
  }

  /**
   * Récupère la passphrase de chiffrement depuis les variables d'environnement
   * 
   * SÉCURITÉ: En production, la passphrase ne doit JAMAIS être exposée côté client.
   * Utiliser Firebase Cloud Functions pour chiffrer les données côté serveur.
   */
  private getPassphrase(): string {
    // Vérifier les variables d'environnement (côté client)
    if (typeof process !== 'undefined' && process.env?.[this.PASSPHRASE_ENV_VAR]) {
      const passphrase = process.env[this.PASSPHRASE_ENV_VAR];
      if (!passphrase) {
        throw new Error(`Environment variable ${this.PASSPHRASE_ENV_VAR} is not defined`);
      }
      return passphrase;
    }

    // Fallback pour le développement (NE PAS UTILISER EN PRODUCTION)
    if (typeof window !== 'undefined' && (window as any).__SSN_ENCRYPTION_KEY__) {
      return (window as any).__SSN_ENCRYPTION_KEY__;
    }

    // En production, retourner une chaîne vide pour forcer l'erreur
    return '';
  }

  /**
   * Dérive une clé de chiffrement à partir d'une passphrase et d'un salt
   * Utilise PBKDF2 avec SHA-256
   */
  private async deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passphraseBuffer = encoder.encode(passphrase);

    // Importer la passphrase comme clé
    const importedKey = await crypto.subtle.importKey(
      'raw',
      passphraseBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // Dériver la clé de chiffrement
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new Uint8Array(salt),
        iterations: ENCRYPTION_CONFIG.pbkdf2Iterations,
        hash: 'SHA-256',
      },
      importedKey,
      {
        name: ENCRYPTION_CONFIG.algorithm,
        length: ENCRYPTION_CONFIG.keyLength,
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Chiffre une donnée sensible (ex: SSN/NIR, données bancaires)
   * 
   * IMPORTANT: Un salt unique est généré pour chaque chiffrement
   * et stocké avec les données chiffrées pour permettre le déchiffrement.
   * 
   * @param plainText - Le texte en clair à chiffrer
   * @returns Les données chiffrées avec IV et salt
   */
  async encrypt(plainText: string): Promise<EncryptedData> {
    if (!this.cryptoKey) {
      await this.initialize();
    }

    if (!this.cryptoKey) {
      throw new Error('Service de chiffrement non initialisé. Veuillez réessayer.');
    }

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(plainText);

    // Générer un IV unique pour ce chiffrement
    const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_CONFIG.ivLength));

    // Générer un salt unique pour ce chiffrement (permet de dériver une clé unique)
    // NOTE: Dans cette implémentation simplifiée, nous utilisons le même salt global
    // pour dériver la clé, mais nous stockons l'IV avec les données.
    // Pour une sécurité renforcée, générer un nouveau salt par chiffrement:
    const salt = crypto.getRandomValues(new Uint8Array(ENCRYPTION_CONFIG.saltLength));
    const dataSpecificKey = await this.deriveKey(this.getPassphrase(), salt);

    // Chiffrer les données avec la clé spécifique
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: ENCRYPTION_CONFIG.algorithm,
        iv: iv,
      },
      dataSpecificKey,
      dataBuffer
    );

    return {
      data: this.arrayBufferToBase64(encryptedBuffer),
      iv: this.arrayBufferToBase64(iv),
      salt: this.arrayBufferToBase64(salt), // Stocker le VRAI salt pour permettre le déchiffrement
    };
  }

  /**
   * Déchiffre une donnée sensible
   * 
   * @param encryptedData - Les données chiffrées avec IV et salt
   * @returns Le texte en clair
   */
  async decrypt(encryptedData: EncryptedData): Promise<string> {
    if (!this.cryptoKey) {
      await this.initialize();
    }

    if (!this.cryptoKey) {
      throw new Error('Service de chiffrement non initialisé. Veuillez réessayer.');
    }

    const encryptedBuffer = this.base64ToArrayBuffer(encryptedData.data);
    const iv = this.base64ToArrayBuffer(encryptedData.iv);
    const salt = this.base64ToArrayBuffer(encryptedData.salt);

    // Dériver la clé spécifique à partir du salt stocké avec les données
    const dataSpecificKey = await this.deriveKey(this.getPassphrase(), salt);

    // Déchiffrer les données
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: ENCRYPTION_CONFIG.algorithm,
        iv: new Uint8Array(iv),
      },
      dataSpecificKey,
      new Uint8Array(encryptedBuffer)
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  }

  /**
   * Convertit un ArrayBuffer en base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convertit une chaîne base64 en ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Vérifie si le service est disponible
   */
  isAvailable(): boolean {
    return typeof crypto !== 'undefined' && 
           typeof crypto.subtle !== 'undefined';
  }

  /**
   * Réinitialise le service (pour les tests ou changement de clé)
   * ATTENTION: Réinitialiser le service rendra les données chiffrées précédemment illisibles
   * si le salt global change.
   */
  reset(): void {
    this.cryptoKey = null;
    this.globalSalt = null;
    localStorage.removeItem('encryption_global_salt');
  }

  /**
   * Efface le salt global (pour les tests ou migration)
   * ATTENTION: Cela rendra toutes les données chiffrées illisibles
   */
  clearGlobalSalt(): void {
    this.globalSalt = null;
    localStorage.removeItem('encryption_global_salt');
  }
}

// Exporter une instance singleton
export const encryptionService = new EncryptionService();

// Exporter le type pour TypeScript
export default EncryptionService;
