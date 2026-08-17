import * as admin from 'firebase-admin';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { encryptionMasterKey } from '../config/secrets.js';
import { encryptSensitiveData } from '../utils/encryption.js';
import {
  SaveStoreIntegrationSchema,
  StartRestaurantStoreSyncSchema,
  TestStoreConnectionSchema,
} from './menuImportContracts.js';
import { requestWooCommerce, validateWooCommerceTarget } from './woocommerceSecurity.js';

/**
 * Callable Function: testStoreConnection
 * Tests connectivity and authentication to a remote WooCommerce store without storing secrets.
 */
export const testStoreConnection = onCall(
  {
    region: 'europe-west1',
  },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }

    const validation = TestStoreConnectionSchema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', 'Paramètres de connexion invalides', validation.error.format());
    }

    const { restaurantId, siteUrl, consumerKey, consumerSecret } = validation.data;
    const db = admin.firestore();

    const restoSnap = await db.collection('restaurants').doc(restaurantId).get();
    if (!restoSnap.exists || restoSnap.data()?.ownerId !== request.auth.uid) {
      throw new HttpsError('permission-denied', "Vous n'êtes pas autorisé à configurer ce restaurant");
    }

    try {
      const target = await validateWooCommerceTarget(siteUrl);
      const res = await requestWooCommerce(target, '/wp-json/wc/v3/products?per_page=1', {
        consumerKey,
        consumerSecret,
      });

      if (res.status !== 200) {
        throw new Error(`La boutique WooCommerce a retourné le code HTTP ${res.status} (${res.statusText})`);
      }

      return {
        success: true,
        message: 'Connexion à la boutique WooCommerce réussie',
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new HttpsError('failed-precondition', `Échec du test de connexion: ${msg}`);
    }
  }
);

/**
 * Callable Function: saveStoreIntegration
 * Validates, encrypts and saves WooCommerce credentials in private_integrations/woocommerce.
 */
export const saveStoreIntegration = onCall(
  {
    region: 'europe-west1',
    secrets: [encryptionMasterKey],
  },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }

    const validation = SaveStoreIntegrationSchema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', 'Données de configuration invalides', validation.error.format());
    }

    const { restaurantId, siteUrl, consumerKey, consumerSecret } = validation.data;
    const db = admin.firestore();

    const restoSnap = await db.collection('restaurants').doc(restaurantId).get();
    if (!restoSnap.exists || restoSnap.data()?.ownerId !== request.auth.uid) {
      throw new HttpsError('permission-denied', "Vous n'êtes pas autorisé à configurer ce restaurant");
    }

    try {
      // 1. Verify connection first
      const target = await validateWooCommerceTarget(siteUrl);
      const testRes = await requestWooCommerce(target, '/wp-json/wc/v3/products?per_page=1', {
        consumerKey,
        consumerSecret,
      });

      if (testRes.status !== 200) {
        throw new Error(`Impossible de valider les identifiants WooCommerce (HTTP ${testRes.status})`);
      }

      // 2. Encrypt credentials with AES-256-GCM
      const masterKey = encryptionMasterKey.value();
      const payload = JSON.stringify({
        siteUrl: target.siteUrl,
        consumerKey,
        consumerSecret,
      });
      const encryptedCredentials = await encryptSensitiveData(payload, masterKey);

      // 3. Save to private_integrations/woocommerce
      const integRef = db.doc(`restaurants/${restaurantId}/private_integrations/woocommerce`);
      const now = admin.firestore.FieldValue.serverTimestamp();
      await integRef.set({
        provider: 'woocommerce',
        siteUrl: target.siteUrl,
        encryptedCredentials,
        updatedAt: now,
        lastTestedAt: now,
      });

      return {
        success: true,
        message: 'Intégration WooCommerce enregistrée et sécurisée avec succès',
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new HttpsError('internal', `Erreur lors de l'enregistrement de l'intégration: ${msg}`);
    }
  }
);

/**
 * Callable Function: startRestaurantStoreSync
 * Initiates a full synchronization job from a saved store integration.
 */
export const startRestaurantStoreSync = onCall(
  {
    region: 'europe-west1',
    secrets: [encryptionMasterKey],
  },
  async (request: CallableRequest<unknown>) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise');
    }

    const validation = StartRestaurantStoreSyncSchema.safeParse(request.data);
    if (!validation.success) {
      throw new HttpsError('invalid-argument', 'Paramètres de synchronisation invalides', validation.error.format());
    }

    const { restaurantId, integrationId } = validation.data;
    const db = admin.firestore();

    const restoSnap = await db.collection('restaurants').doc(restaurantId).get();
    if (!restoSnap.exists || restoSnap.data()?.ownerId !== request.auth.uid) {
      throw new HttpsError('permission-denied', "Vous n'êtes pas autorisé à synchroniser ce restaurant");
    }

    const integSnap = await db.doc(`restaurants/${restaurantId}/private_integrations/${integrationId}`).get();
    if (!integSnap.exists) {
      throw new HttpsError('not-found', `Aucune configuration trouvée pour l'intégration "${integrationId}"`);
    }

    const importDocRef = db.collection(`restaurants/${restaurantId}/menu_imports`).doc();
    const importId = importDocRef.id;
    const now = admin.firestore.FieldValue.serverTimestamp();

    await importDocRef.set({
      id: importId,
      restaurantId,
      type: 'woocommerce',
      integrationId,
      status: 'pending',
      totalItems: 0,
      processedItems: 0,
      failedItems: 0,
      errors: [],
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return { importId };
  }
);
