/**
 * Module de chiffrement côté serveur pour Firebase Cloud Functions
 * 
 * Ce module fournit des fonctions de chiffrement sécurisées pour les données sensibles
 * (SSN/NIR, coordonnées bancaires) utilisées dans les Cloud Functions.
 * 
 * ⚠️ IMPORTANT: Ce module est conçu pour être utilisé EXCLUSIVEMENT dans Cloud Functions.
 * NE PAS utiliser ce code côté client.
 * 
 * Architecture:
 * - Utilise l'API Web Crypto native de Node.js (crypto.subtle)
 * - Clé de chiffrement dérivée de Firebase Secret Manager (ou variable d'environnement)
 * - AES-256-GCM pour le chiffrement symétrique
 * - IV (Initialization Vector) unique pour chaque chiffrement
 * - Salt unique par opération de chiffrement
 * 
 * @module EncryptionUtils
 */

import * as crypto from 'crypto';

/**
 * Configuration du chiffrement
 */
const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-gcm',
  keyLength: 32, // bytes (256 bits)
  ivLength: 12, // bytes (recommandé pour GCM)
  saltLength: 16, // bytes
  pbkdf2Iterations: 100000,
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
 * Récupère la clé de chiffrement principale depuis Firebase Secret Manager
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠️ MIGRATION VERS FIREBASE SECRET MANAGER - GUIDE COMPLET
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ÉTAT ACTUEL (DÉVELOPPEMENT):
 * - Utilise la variable d'environnement ENCRYPTION_MASTER_KEY
 * - Convenable pour le développement local et les tests
 * - ⚠️ NE PAS UTILISER EN PRODUCTION
 *
 * ÉTAT CIBLE (PRODUCTION):
 * - Utiliser Firebase Secret Manager pour stocker la clé maîtresse
 * - Gestion centralisée des secrets avec rotation automatique
 * - Audit trail et contrôle d'accès granulaire
 * - Conformité RGPD et SOC2
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ÉTAPES DE MIGRATION VERS SECRET MANAGER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. INSTALLER LE SDK SECRET MANAGER:
 *    npm install --save firebase-admin/secret-manager
 *
 * 2. CRÉER UN SECRET DANS FIREBASE SECRET MANAGER:
 *    # Via la CLI Firebase
 *    firebase secrets:create encryption-master-key
 *
 *    # Via la console Google Cloud
 *    # https://console.cloud.google.com/security/secret-manager
 *
 * 3. GÉNÉRER ET STOCKER LA CLÉ MAÎTRESSE:
 *    # Générer une clé aléatoire 256-bit (32 bytes)
 *    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 *    # Ajouter la clé au Secret Manager
 *    firebase secrets:add encryption-master-key --data-file <key-file>
 *
 *    # OU définir directement
 *    firebase secrets:update encryption-master-key --data "VOTRE_CLÉ_EN_BASE64"
 *
 * 4. ACCORDER LES PERMISSIONS IAM:
 *    # Votre compte de service Cloud Functions doit avoir le rôle:
 *    gcloud projects add-iam-policy-binding PROJECT_ID \
 *      --member="serviceAccount:PROJECT_ID@appspot.gserviceaccount.com" \
 *      --role="roles/secretmanager.secretAccessor"
 *
 * 5. MODIFIER CE CODE POUR UTILISER SECRET MANAGER:
 *    ────────────────────────────────────────────────────────────────────────────────
 *    // REMPLACER LE CODE ACTUEL PAR:
 *
 *    import * as secretManager from 'firebase-admin/secret-manager';
 *
 *    async function getMasterKey(): Promise<Buffer> {
 *      try {
 *        // Récupérer le secret depuis Secret Manager
 *        const [version] = await secretManager.getSecret({
 *          name: `projects/${process.env.GCLOUD_PROJECT}/secrets/encryption-master-key/versions/latest`,
 *        });
 *
 *        // Le secret est en base64, le convertir en Buffer
 *        return Buffer.from(version.payload.data, 'base64');
 *      } catch (error) {
 *        console.error('Erreur lors de la récupération du secret:', error);
 *        throw new Error(
 *          'Impossible de récupérer la clé de chiffrement depuis Secret Manager. ' +
 *          'Vérifiez que le secret existe et que les permissions IAM sont correctes.'
 *        );
 *      }
 *    }
 *    ────────────────────────────────────────────────────────────────────────────────
 *
 * 6. CONFIGURER LES VARIABLES D'ENVIRONEMENT:
 *    # Dans firebase.json ou via la console
 *    firebase functions:config:set gcp.project="PROJECT_ID"
 *
 * 7. TESTER LA MIGRATION:
 *    - Déployer les Cloud Functions: firebase deploy --only functions
 *    - Tester le chiffrement/déchiffrement avec les nouvelles données
 *    - Vérifier les logs Cloud Functions pour confirmer l'utilisation de Secret Manager
 *    - Surveiller les métriques de performance (latence d'accès aux secrets)
 *
 * 8. NETTOYAGE:
 *    - Supprimer l'ancienne variable d'environnement ENCRYPTION_MASTER_KEY
 *    - Révoquer tout accès direct aux anciennes clés
 *    - Mettre à jour la documentation
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * AVANTAGES DE SECRET MANAGER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ✅ Sécurité renforcée:
 *    - Clés stockées chiffrées au repos
 *    - Contrôle d'accès basé sur IAM
 *    - Audit logging automatique
 *
 * ✅ Rotation des clés:
 *    - Rotation automatique des secrets
 *    - Gestion des versions de secrets
 *    - Rollback facile en cas de problème
 *
 * ✅ Conformité:
 *    - Conforme RGPD (article 32)
 *    - Certifications SOC2, ISO 27001
 *    - Ready pour la certification HDS (données de santé)
 *
 * ✅ Opérationnel:
 *    - Centralisation des secrets
 *    - Gestion multi-environnements (dev, staging, prod)
 *    - Intégration native avec Cloud Functions
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * COÛTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - 6 premières versions: Gratuit
 * - 10 000 accès: Gratuit (~0.10€/1000 accès ensuite)
 * - Stockage: 0.03€/GiB/mois
 *
 * Estimation pour une application VTC moyenne:
 * - ~1000 inscriptions/jour = 30 000 accès/mois = ~3€/mois
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * RÉFÉRENCES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Documentation: https://firebase.google.com/docs/functions/secret-manager
 * - Guide de migration: https://cloud.google.com/secret-manager/docs/migrating
 * - Pricing: https://cloud.google.com/secret-manager/pricing
 *
 * @returns La clé de chiffrement principale
 */
async function getMasterKey(): Promise<Buffer> {
  // ═══════════════════════════════════════════════════════════════════════════════
  // ⚠️ ATTENTION: Code actuel pour DÉVELOPPEMENT uniquement
  // ═══════════════════════════════════════════════════════════════════════════════
  // Pour migrer vers Secret Manager, suivez les étapes détaillées ci-dessus.
  
  // Pour le développement, utiliser une variable d'environnement
  const envKey = process.env.ENCRYPTION_MASTER_KEY;
  
  if (!envKey) {
    throw new Error(
      'ENCRYPTION_MASTER_KEY non définie. ' +
      'En production, configurez Firebase Secret Manager (voir documentation ci-dessus). ' +
      'En développement, définissez ENCRYPTION_MASTER_KEY dans .env ' +
      'Utilisez: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  
  // La clé doit être en base64 et faire 32 bytes (256 bits)
  return Buffer.from(envKey, 'base64');
}

/**
 * Dérive une clé de chiffrement à partir de la clé maîtresse et d'un salt
 * Utilise PBKDF2 avec SHA-256
 * 
 * @param masterKey - La clé maîtresse
 * @param salt - Le salt pour la dérivation
 * @returns La clé dérivée
 */
function deriveKey(masterKey: Buffer, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    masterKey,
    salt,
    ENCRYPTION_CONFIG.pbkdf2Iterations,
    ENCRYPTION_CONFIG.keyLength,
    'sha256'
  );
}

/**
 * Chiffre une donnée sensible côté serveur
 * 
 * ✅ CHIFFREMENT RÉACTIVÉ - Conformité RGPD article 32
 * Les données sensibles (SSN, coordonnées bancaires) sont chiffrées avec AES-256-GCM.
 * 
 * @param plainText - Le texte en clair à chiffrer
 * @returns Les données chiffrées avec IV et salt
 * @throws Error si le chiffrement échoue
 */
export async function encryptSensitiveData(plainText: string): Promise<EncryptedData> {
  if (!plainText || plainText.length === 0) {
    throw new Error('Le texte à chiffrer ne peut pas être vide');
  }
  
  try {
    // Récupérer la clé maîtresse
    const masterKey = await getMasterKey();
    
    // Générer un salt unique pour ce chiffrement
    const salt = crypto.randomBytes(ENCRYPTION_CONFIG.saltLength);
    
    // Dériver une clé spécifique pour ce chiffrement
    const key = deriveKey(masterKey, salt);
    
    // Générer un IV unique pour ce chiffrement
    const iv = crypto.randomBytes(ENCRYPTION_CONFIG.ivLength);
    
    // Créer le cipher
    const cipher = crypto.createCipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);
    
    // Chiffrer les données
    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Récupérer le tag d'authentification (GCM)
    const authTag = cipher.getAuthTag();
    
    // Combiner encrypted data + auth tag
    const combined = Buffer.concat([
      Buffer.from(encrypted, 'base64'),
      authTag
    ]);
    
    return {
      data: combined.toString('base64'),
      iv: iv.toString('base64'),
      salt: salt.toString('base64'),
    };
  } catch (error: any) {
    console.error('Erreur lors du chiffrement:', error);
    throw new Error(`Échec du chiffrement: ${error.message}`);
  }
}

/**
 * Déchiffre une donnée sensible côté serveur
 * 
 * ✅ CHIFFREMENT RÉACTIVÉ - Conformité RGPD article 32
 * Les données sensibles sont déchiffrées avec AES-256-GCM.
 * 
 * @param encryptedData - Les données chiffrées avec IV et salt
 * @returns Le texte en clair
 * @throws Error si le déchiffrement échoue
 */
export async function decryptSensitiveData(encryptedData: EncryptedData): Promise<string> {
    if (!encryptedData) {
        throw new Error('Données chiffrées manquantes');
    }

    if (!encryptedData.data) {
        throw new Error('Données chiffrées invalides: champ data manquant');
    }

    if (!encryptedData.iv) {
        throw new Error('Données chiffrées invalides: IV manquant');
    }

    if (!encryptedData.salt) {
        throw new Error('Données chiffrées invalides: salt manquant');
    }

  
  try {
    // Récupérer la clé maîtresse
    const masterKey = await getMasterKey();
    
    // Décoder les données
    const combined = Buffer.from(encryptedData.data, 'base64');
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const salt = Buffer.from(encryptedData.salt, 'base64');
    
    // Dériver la clé spécifique
    const key = deriveKey(masterKey, salt);
    
    // Séparer les données chiffrées du tag d'authentification
    // Pour AES-256-GCM, le tag fait 16 bytes
    const authTagLength = 16;
    const encrypted = combined.subarray(0, combined.length - authTagLength);
    const authTag = combined.subarray(combined.length - authTagLength);
    
    // Créer le decipher
    const decipher = crypto.createDecipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    // Déchiffrer les données
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error: any) {
    console.error('Erreur lors du déchiffrement:', error);
    throw new Error(`Échec du déchiffrement: ${error.message}`);
  }
}

/**
 * Valide la structure des données chiffrées
 * Vérifie que les données chiffrées ont la structure attendue {data, iv, salt}
 * 
 * @param field - Les données chiffrées à valider
 * @returns true si la structure est valide, false sinon
 */
export function isValidEncryptedData(field: any): boolean {
  return field != null &&
         typeof field.data === 'string' &&
         field.data.length > 0 &&
         typeof field.iv === 'string' &&
         field.iv.length > 0 &&
         typeof field.salt === 'string' &&
         field.salt.length > 0;
}

/**
 * Génère une clé de chiffrement aléatoire pour le développement
 * 
 * ⚠️ À UTILISER UNIQUEMENT POUR LE DÉVELOPPEMENT
 * ⚠️ EN PRODUCTION, UTILISER FIREBASE SECRET MANAGER
 * 
 * @returns Une clé de chiffrement aléatoire en base64
 */
export function generateDevKey(): string {
  const key = crypto.randomBytes(ENCRYPTION_CONFIG.keyLength);
  return key.toString('base64');
}
