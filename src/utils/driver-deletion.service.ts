/**
 * Service de Suppression Complète des Chauffeurs
 *
 * Ce service gère la suppression définitive et irréversible d'un chauffeur,
 * incluant toutes les données associées dans Firestore et Firebase Storage.
 *
 * Conformité RGPD : Droit à l'oubli
 *
 * Collections nettoyées :
 * - drivers/{driverId} - Document principal
 * - users/{driverId} - Document utilisateur
 * - wallets/{driverId} - Portefeuille
 * - transactions - Transactions du chauffeur
 * - bookings - Réservations du chauffeur
 * - parcels - Livraisons du chauffeur
 * - active_bookings - Courses actives
 * - calls - Appels VOIP
 * - vehicles - Véhicules associés
 * - admins/{driverId} - Si le chauffeur est aussi admin
 *
 * Storage nettoyé :
 * - drivers/{driverId}/profile/* - Photos de profil
 * - drivers/{driverId}/documents/* - Documents
 * - profile_images/{driverId} - Images alternatives
 *
 * @module DriverDeletionService
 */

import { adminDb } from '@/config/firebase-admin';
import * as admin from 'firebase-admin';
import { auditLoggingService, AuditLogLevel } from '@/services/audit-logging.service';

/**
 * Résultat de la suppression d'un chauffeur
 */
export interface DriverDeletionResult {
  success: boolean;
  deletedCollections: string[];
  deletedFiles: number;
  errors: string[];
  duration: number; // en millisecondes
}

/**
 * Statistiques de suppression pour le logging
 */
interface DeletionStats {
  collectionsDeleted: Map<string, number>;
  filesDeleted: number;
  errors: string[];
  startTime: number;
}

/**
 * Service de suppression complète des chauffeurs
 */
class DriverDeletionService {
  private readonly MAX_BATCH_SIZE = 500; // Firestore batch limit
  private readonly MAX_LISTING_RESULTS = 1000; // Storage list limit

  /**
   * Supprime complètement un chauffeur et toutes ses données associées
   * 
   * @param driverId - L'ID du chauffeur à supprimer
   * @param adminId - L'ID de l'admin qui effectue la suppression
   * @returns Promise<DriverDeletionResult> - Le résultat de la suppression
   */
  async deleteDriverCompletely(
    driverId: string,
    adminId: string
  ): Promise<DriverDeletionResult> {
    const startTime = Date.now();
    const stats: DeletionStats = {
      collectionsDeleted: new Map(),
      filesDeleted: 0,
      errors: [],
      startTime,
    };

    console.log(`🗑️  Début suppression complète du chauffeur ${driverId} par admin ${adminId}`);

    try {
      // 1. Supprimer le document principal du chauffeur
      await this.deleteDocument('drivers', driverId, stats);
      console.log(` Document principal 'drivers/${driverId}' supprimé`);

      // 2. Supprimer le document utilisateur associé
      await this.deleteDocument('users', driverId, stats);
      console.log(` Document 'users/${driverId}' supprimé`);

      // 3. Supprimer le portefeuille
      await this.deleteDocument('wallets', driverId, stats);
      console.log(` Document 'wallets/${driverId}' supprimé`);

      // 4. Supprimer les véhicules associés
      await this.deleteVehicles(driverId, stats);
      console.log(` Véhicules associés supprimés`);

      // 5. Supprimer les transactions du chauffeur
      await this.deleteCollectionByField('transactions', 'driverId', driverId, stats);
      console.log(` Transactions du chauffeur supprimées`);

      // 6. Supprimer les réservations du chauffeur
      await this.deleteCollectionByField('bookings', 'driverId', driverId, stats);
      console.log(` Réservations du chauffeur supprimées`);

      // 7. Supprimer les livraisons du chauffeur
      await this.deleteCollectionByField('parcels', 'driverId', driverId, stats);
      console.log(` Livraisons du chauffeur supprimées`);

      // 8. Supprimer les courses actives
      await this.deleteCollectionByField('active_bookings', 'driverId', driverId, stats);
      console.log(` Courses actives supprimées`);

      // 9. Supprimer les appels VOIP où le chauffeur est impliqué
      await this.deleteCalls(driverId, stats);
      console.log(` Appels VOIP supprimés`);

      // 10. Supprimer le document admin si le chauffeur est aussi admin
      await this.deleteDocument('admins', driverId, stats);
      console.log(` Document admin éventuel supprimé`);

      // 11. Supprimer les fichiers Storage
      await this.deleteDriverStorageFiles(driverId, stats);
      console.log(` Fichiers Storage supprimés (${stats.filesDeleted} fichiers)`);

      // 12. Supprimer le compte Firebase Auth (RGPD)
      try {
        await admin.auth().deleteUser(driverId);
        console.log(` Compte Firebase Auth '${driverId}' supprimé`);
      } catch (authError: any) {
        // Si l'utilisateur n'existe pas déjà dans Auth, ce n'est pas une erreur bloquante
        if (authError.code !== 'auth/user-not-found') {
          throw authError;
        }
        console.warn(`Compte Firebase Auth '${driverId}' non trouvé lors de la suppression`);
      }

      // 13. Logger l'audit
      await this.logDeletionAudit(driverId, adminId, stats);

      const duration = Date.now() - startTime;
      console.log(` Suppression complète terminée en ${duration}ms`);

      return {
        success: stats.errors.length === 0,
        deletedCollections: Array.from(stats.collectionsDeleted.keys()),
        deletedFiles: stats.filesDeleted,
        errors: stats.errors,
        duration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      stats.errors.push(`Erreur critique: ${errorMessage}`);
      console.error(`Erreur lors de la suppression du chauffeur ${driverId}:`, error);

      // Logger l'échec
      await this.logDeletionAudit(driverId, adminId, stats, false, errorMessage);

      throw error;
    }
  }

  /**
   * Supprime un document spécifique s'il existe
   */
  private async deleteDocument(
    collectionName: string,
    documentId: string,
    stats: DeletionStats
  ): Promise<void> {
    try {
      const docRef = adminDb.collection(collectionName).doc(documentId);
      const doc = await docRef.get();

      if (doc.exists) {
        await docRef.delete();
        this.incrementCollectionStat(collectionName, stats);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      stats.errors.push(`${collectionName}/${documentId}: ${errorMessage}`);
      console.warn(` Erreur suppression ${collectionName}/${documentId}:`, error);
    }
  }

  /**
   * Supprime tous les documents d'une collection où un champ correspond à une valeur
   */
  private async deleteCollectionByField(
    collectionName: string,
    fieldName: string,
    value: string,
    stats: DeletionStats
  ): Promise<void> {
    try {
      let hasMore = true;
      let lastDocId: string | null = null;

      while (hasMore) {
        let query = adminDb
          .collection(collectionName)
          .where(fieldName, '==', value)
          .limit(this.MAX_BATCH_SIZE);

        // Pagination pour les grandes collections
        if (lastDocId) {
          query = query.startAfter(lastDocId);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        // Supprimer par batch de 500
        const batch = adminDb.batch();
        let count = 0;

        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
          lastDocId = doc.id;
          count++;
        });

        await batch.commit();
        this.incrementCollectionStat(collectionName, stats, count);

        // Si on a récupéré moins de documents que la limite, c'est fini
        if (snapshot.docs.length < this.MAX_BATCH_SIZE) {
          hasMore = false;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      stats.errors.push(`${collectionName} (${fieldName}=${value}): ${errorMessage}`);
      console.warn(` Erreur suppression collection ${collectionName}:`, error);
    }
  }

  /**
   * Supprime les véhicules associés au chauffeur
   */
  private async deleteVehicles(
    driverId: string,
    stats: DeletionStats
  ): Promise<void> {
    try {
      const snapshot = await adminDb
        .collection('vehicles')
        .where('ownerId', '==', driverId)
        .limit(this.MAX_BATCH_SIZE)
        .get();

      if (!snapshot.empty) {
        const batch = adminDb.batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        this.incrementCollectionStat('vehicles', stats, snapshot.docs.length);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      stats.errors.push(`vehicles (ownerId=${driverId}): ${errorMessage}`);
      console.warn(` Erreur suppression véhicules:`, error);
    }
  }

  /**
   * Supprime les appels VOIP où le chauffeur est impliqué
   */
  private async deleteCalls(
    driverId: string,
    stats: DeletionStats
  ): Promise<void> {
    try {
      // Supprimer les appels où le chauffeur est l'appelant
      await this.deleteCollectionByField('calls', 'callerId', driverId, stats);

      // Supprimer les appels où le chauffeur est le receveur
      await this.deleteCollectionByField('calls', 'calleeId', driverId, stats);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      stats.errors.push(`calls: ${errorMessage}`);
      console.warn(` Erreur suppression appels:`, error);
    }
  }

  /**
   * Supprime tous les fichiers Storage associés au chauffeur
   *  CORRECTION: Ajoute vérification de l'accessibilité du bucket avant suppression
   */
  private async deleteDriverStorageFiles(
    driverId: string,
    stats: DeletionStats
  ): Promise<void> {
    const pathsToDelete = [
      `drivers/${driverId}/profile/`,
      `drivers/${driverId}/documents/`,
      `profile_images/${driverId}`,
    ];

    //  CORRECTION: Vérifier que le bucket Storage est accessible avant de traiter les fichiers
    let bucket: any = null;
    try {
      bucket = admin.storage().bucket();

      // Tenter de récupérer les métadonnées du bucket pour vérifier l'accessibilité
      try {
        await bucket.getMetadata();
        console.log(' Bucket Storage accessible');
      } catch (metadataError) {
        const errorMsg = metadataError instanceof Error ? metadataError.message : 'Erreur inconnue';
        throw new Error(`Bucket Storage inaccessible: ${errorMsg}`);
      }
    } catch (bucketError) {
      const errorMessage = bucketError instanceof Error ? bucketError.message : 'Erreur inconnue';
      stats.errors.push(`Storage (initialisation): ${errorMessage}`);
      console.error('Erreur critique d\'accès au bucket Storage:', bucketError);
      //  CORRECTION: Re-lancer l'erreur pour signaler le problème critique
      throw bucketError;
    }

    // Maintenant que le bucket est vérifié comme accessible, traiter chaque chemin
    for (const path of pathsToDelete) {
      try {
        const [files] = await bucket.getFiles({
          prefix: path,
        });

        if (files.length > 0) {
          // Supprimer les fichiers par batch de 100
          for (let i = 0; i < files.length; i += 100) {
            const batch = files.slice(i, i + 100);
            await Promise.all(batch.map((file: any) => file.delete()));
            stats.filesDeleted += batch.length;
          }
          console.log(` ${files.length} fichier(s) supprimé(s) dans ${path}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        stats.errors.push(`Storage (${path}): ${errorMessage}`);
        console.warn(` Erreur suppression Storage ${path}:`, error);
        //  CORRECTION: Re-lancer si c'est une erreur de permission critique
        if (errorMessage.includes('permission') || errorMessage.includes('authorized')) {
          throw error;
        }
      }
    }
  }

  /**
   * Incrémente les statistiques de suppression pour une collection
   */
  private incrementCollectionStat(
    collectionName: string,
    stats: DeletionStats,
    count: number = 1
  ): void {
    const currentCount = stats.collectionsDeleted.get(collectionName) || 0;
    stats.collectionsDeleted.set(collectionName, currentCount + count);
  }

  /**
   * Logger l'audit de la suppression
   */
  private async logDeletionAudit(
    driverId: string,
    adminId: string,
    stats: DeletionStats,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    try {
      const duration = Date.now() - stats.startTime;
      const collectionsSummary = Object.fromEntries(stats.collectionsDeleted);

      await auditLoggingService.log({
        eventType: 'DRIVER_DELETED' as any,
        userId: adminId,
        level: success ? AuditLogLevel.INFO : AuditLogLevel.ERROR,
        action: 'Suppression définitive complète du chauffeur',
        success,
        errorMessage,
        details: {
          targetDriverId: driverId,
          duration,
          collectionsDeleted: collectionsSummary,
          filesDeleted: stats.filesDeleted,
          errors: stats.errors,
        },
      });
    } catch (error) {
      console.error('Erreur lors du logging d\'audit:', error);
    }
  }

  /**
   * Récupère les statistiques de suppression avant suppression (pour confirmation)
   */
  async getDeletionStats(driverId: string): Promise<{
    collectionsCount: Record<string, number>;
    estimatedFilesCount: number;
  }> {
    const collectionsCount: Record<string, number> = {};
    let estimatedFilesCount = 0;

    // Compter les documents dans chaque collection
    const collectionsToCheck = [
      { name: 'drivers', field: null },
      { name: 'users', field: null },
      { name: 'wallets', field: null },
      { name: 'transactions', field: 'driverId' },
      { name: 'bookings', field: 'driverId' },
      { name: 'parcels', field: 'driverId' },
      { name: 'active_bookings', field: 'driverId' },
      { name: 'vehicles', field: 'ownerId' },
    ];

    for (const collection of collectionsToCheck) {
      try {
        let query: any = adminDb.collection(collection.name);

        if (collection.field) {
          query = query.where(collection.field, '==', driverId);
        } else {
          query = query.doc(driverId);
        }

        const snapshot = await query.count().get();
        const count = snapshot.data().count;
        collectionsCount[collection.name] = count;
      } catch (error) {
        console.warn(` Erreur comptage ${collection.name}:`, error);
        collectionsCount[collection.name] = 0;
      }
    }

    // Estimer les fichiers Storage
    try {
      const bucket = admin.storage().bucket();
      const paths = [
        `drivers/${driverId}/profile/`,
        `drivers/${driverId}/documents/`,
        `profile_images/${driverId}`,
      ];

      for (const path of paths) {
        const [files] = await bucket.getFiles({ prefix: path });
        estimatedFilesCount += files.length;
      }
    } catch (error) {
      console.warn(' Erreur estimation fichiers Storage:', error);
    }

    return {
      collectionsCount,
      estimatedFilesCount,
    };
  }
}

// Export du singleton
export const driverDeletionService = new DriverDeletionService();

// Export par défaut
export default driverDeletionService;
