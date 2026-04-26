/**
 * Script de migration FCFA → CAD pour les données existantes
 *
 * CORRECTION FCFA→CAD #6: Cloud Function pour migrer toutes les données existantes
 * de FCFA (Cameroun) vers CAD (Canada) avec un taux de conversion de ~285 FCFA/CAD
 *
 * @module migrateCurrency
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from './utils/rateLimiter.js';

// Initialiser l'admin SDK si ce n'est pas déjà fait
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage();

/**
 * Taux de conversion FCFA → CAD
 * @constant {number}
 */
const CONVERSION_RATE = 285; // 1 CAD = 285 FCFA

/**
 * Collections à migrer
 */
const COLLECTIONS_TO_MIGRATE = [
  'wallets',
  'transactions',
  'bookings',
  'carTypes',
  'drivers', // Pour les champs de tarification
];

/**
 * Interface pour les statistiques de migration
 */
interface MigrationStats {
  collection: string;
  totalDocuments: number;
  migratedDocuments: number;
  failedDocuments: number;
  errors: Array<{ docId: string; error: string }>;
}

/**
 * Migre un montant de FCFA vers CAD
 * 
 * @param amountFCFA - Montant en FCFA
 * @returns Montant converti en CAD, arrondi à 2 décimales
 */
function convertFCFAToCAD(amountFCFA: number, conversionRate: number = CONVERSION_RATE): number {
  return Math.round((amountFCFA / conversionRate) * 100) / 100;
}

/**
 * Backup une collection vers Firebase Storage avant migration
 * 
 * @param collectionName - Nom de la collection à backup
 * @returns Promise résolue quand le backup est terminé
 */
async function backupCollection(collectionName: string): Promise<void> {
  logger.info(`📦 Backup de la collection: ${collectionName}`);
  
  const bucket = storage.bucket();
  const backupFileName = `backups/${collectionName}_${Date.now()}.json`;
  const file = bucket.file(backupFileName);
  
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let totalDocs = 0;
  const batchSize = 500;
  let allBackupData: Record<string, unknown>[] = [];
  
  while (true) {
    let query = db.collection(collectionName).orderBy('__name__').limit(batchSize);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) break;
    
    const batchData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    allBackupData.push(...batchData);
    totalDocs += snapshot.size;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    logger.info(`📦 Backup en cours: ${totalDocs} documents traités pour ${collectionName}`);
  }
  
  await file.save(JSON.stringify(allBackupData, null, 2), {
    contentType: 'application/json'
  });
  
  logger.info(` Backup terminé: ${backupFileName} (${totalDocs} documents)`);
}

/**
 * Migre la collection 'wallets'
 * 
 * @param stats - Objet statistiques à mettre à jour
 */
async function migrateWallets(stats: MigrationStats, conversionRate: number = CONVERSION_RATE): Promise<void> {
  logger.info('🔄 Migration de la collection wallets...');
  
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let totalProcessed = 0;
  let totalFailed = 0;
  const batchSize = 500;
  
  while (true) {
    let query = db.collection('wallets').orderBy('__name__').limit(batchSize);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) break;
    
    const batch = db.batch();
    let batchProcessed = 0;
    
    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        
        // Convertir le solde de FCFA à CAD
        if (data.balance && typeof data.balance === 'number') {
          const newBalance = convertFCFAToCAD(data.balance, conversionRate);
          
          batch.update(doc.ref, {
            balance: newBalance,
            currency: 'CAD',
            migratedAt: admin.firestore.FieldValue.serverTimestamp(),
            previousCurrency: 'FCFA',
            previousBalance: data.balance
          });
          
          batchProcessed++;
        }
      } catch (error) {
        totalFailed++;
        stats.errors.push({
          docId: doc.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    await batch.commit();
    totalProcessed += batchProcessed;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    logger.info(`🔄 Migration wallets en cours: ${totalProcessed} documents traités`);
  }
  
  stats.totalDocuments = totalProcessed + totalFailed;
  stats.migratedDocuments = totalProcessed;
  stats.failedDocuments = totalFailed;
  logger.info(` Migration wallets terminée: ${totalProcessed}/${stats.totalDocuments} documents`);
}

/**
 * Migre la collection 'transactions'
 * 
 * @param stats - Objet statistiques à mettre à jour
 */
async function migrateTransactions(stats: MigrationStats, conversionRate: number = CONVERSION_RATE): Promise<void> {
  logger.info('🔄 Migration de la collection transactions...');
  
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let totalProcessed = 0;
  let totalFailed = 0;
  const batchSize = 500;
  
  while (true) {
    let query = db.collection('transactions').orderBy('__name__').limit(batchSize);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) break;
    
    const batch = db.batch();
    let batchProcessed = 0;
    
    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        
        // Convertir les montants de FCFA à CAD
        const updates: Record<string, unknown> = {
          currency: 'CAD',
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          previousCurrency: 'FCFA'
        };
        
        if (data.amount && typeof data.amount === 'number') {
          updates.previousAmount = data.amount;
          updates.amount = convertFCFAToCAD(data.amount, conversionRate);
        }
        
        if (data.fee && typeof data.fee === 'number') {
          updates.previousFee = data.fee;
          updates.fee = convertFCFAToCAD(data.fee, conversionRate);
        }
        
        if (data.balanceBefore && typeof data.balanceBefore === 'number') {
          updates.previousBalanceBefore = data.balanceBefore;
          updates.balanceBefore = convertFCFAToCAD(data.balanceBefore, conversionRate);
        }
        
        if (data.balanceAfter && typeof data.balanceAfter === 'number') {
          updates.previousBalanceAfter = data.balanceAfter;
          updates.balanceAfter = convertFCFAToCAD(data.balanceAfter, conversionRate);
        }
        
        batch.update(doc.ref, updates);
        batchProcessed++;
      } catch (error) {
        totalFailed++;
        stats.errors.push({
          docId: doc.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    await batch.commit();
    totalProcessed += batchProcessed;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    logger.info(`🔄 Migration transactions en cours: ${totalProcessed} documents traités`);
  }
  
  stats.totalDocuments = totalProcessed + totalFailed;
  stats.migratedDocuments = totalProcessed;
  stats.failedDocuments = totalFailed;
  logger.info(` Migration transactions terminée: ${totalProcessed}/${stats.totalDocuments} documents`);
}

/**
 * Migre la collection 'bookings'
 * 
 * @param stats - Objet statistiques à mettre à jour
 */
async function migrateBookings(stats: MigrationStats, conversionRate: number = CONVERSION_RATE): Promise<void> {
  logger.info('🔄 Migration de la collection bookings...');
  
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let totalProcessed = 0;
  let totalFailed = 0;
  const batchSize = 500;
  
  while (true) {
    let query = db.collection('bookings').orderBy('__name__').limit(batchSize);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) break;
    
    const batch = db.batch();
    let batchProcessed = 0;
    
    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        
        // Convertir les montants de FCFA à CAD
        const updates: Record<string, unknown> = {
          currency: 'CAD',
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          previousCurrency: 'FCFA'
        };
        
        if (data.price && typeof data.price === 'number') {
          updates.previousPrice = data.price;
          updates.price = convertFCFAToCAD(data.price, conversionRate);
        }
        
        if (data.driverEarnings && typeof data.driverEarnings === 'number') {
          updates.previousDriverEarnings = data.driverEarnings;
          updates.driverEarnings = convertFCFAToCAD(data.driverEarnings, conversionRate);
        }
        
        if (data.commission && typeof data.commission === 'number') {
          updates.previousCommission = data.commission;
          updates.commission = convertFCFAToCAD(data.commission, conversionRate);
        }
        
        if (data.cancellationFee && typeof data.cancellationFee === 'number') {
          updates.previousCancellationFee = data.cancellationFee;
          updates.cancellationFee = convertFCFAToCAD(data.cancellationFee, conversionRate);
        }
        
        batch.update(doc.ref, updates);
        batchProcessed++;
      } catch (error) {
        totalFailed++;
        stats.errors.push({
          docId: doc.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    await batch.commit();
    totalProcessed += batchProcessed;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    logger.info(`🔄 Migration bookings en cours: ${totalProcessed} documents traités`);
  }
  
  stats.totalDocuments = totalProcessed + totalFailed;
  stats.migratedDocuments = totalProcessed;
  stats.failedDocuments = totalFailed;
  logger.info(` Migration bookings terminée: ${totalProcessed}/${stats.totalDocuments} documents`);
}

/**
 * Migre la collection 'carTypes'
 * 
 * @param stats - Objet statistiques à mettre à jour
 */
async function migrateCarTypes(stats: MigrationStats, conversionRate: number = CONVERSION_RATE): Promise<void> {
  logger.info('🔄 Migration de la collection carTypes...');
  
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let totalProcessed = 0;
  let totalFailed = 0;
  const batchSize = 500;
  
  while (true) {
    let query = db.collection('carTypes').orderBy('__name__').limit(batchSize);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) break;
    
    const batch = db.batch();
    let batchProcessed = 0;
    
    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        
        // Convertir les tarifs de FCFA à CAD
        const updates: Record<string, unknown> = {
          currency: 'CAD',
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          previousCurrency: 'FCFA'
        };
        
        if (data.basePrice && typeof data.basePrice === 'number') {
          updates.previousBasePrice = data.basePrice;
          updates.basePrice = convertFCFAToCAD(data.basePrice, conversionRate);
        }
        
        if (data.pricePerKm && typeof data.pricePerKm === 'number') {
          updates.previousPricePerKm = data.pricePerKm;
          updates.pricePerKm = convertFCFAToCAD(data.pricePerKm, conversionRate);
        }
        
        if (data.pricePerMinute && typeof data.pricePerMinute === 'number') {
          updates.previousPricePerMinute = data.pricePerMinute;
          updates.pricePerMinute = convertFCFAToCAD(data.pricePerMinute, conversionRate);
        }
        
        batch.update(doc.ref, updates);
        batchProcessed++;
      } catch (error) {
        totalFailed++;
        stats.errors.push({
          docId: doc.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    await batch.commit();
    totalProcessed += batchProcessed;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    logger.info(`🔄 Migration carTypes en cours: ${totalProcessed} documents traités`);
  }
  
  stats.totalDocuments = totalProcessed + totalFailed;
  stats.migratedDocuments = totalProcessed;
  stats.failedDocuments = totalFailed;
  logger.info(` Migration carTypes terminée: ${totalProcessed}/${stats.totalDocuments} documents`);
}

/**
 * Migre la collection 'drivers' (champs de tarification)
 * 
 * @param stats - Objet statistiques à mettre à jour
 */
async function migrateDrivers(stats: MigrationStats, conversionRate: number = CONVERSION_RATE): Promise<void> {
  logger.info('🔄 Migration de la collection drivers...');
  
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let totalProcessed = 0;
  let totalFailed = 0;
  const batchSize = 500;
  
  while (true) {
    let query = db.collection('drivers').orderBy('__name__').limit(batchSize);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) break;
    
    const batch = db.batch();
    let batchProcessed = 0;
    
    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        
        // Convertir les tarifs de FCFA à CAD
        const updates: Record<string, unknown> = {
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          previousCurrency: 'FCFA'
        };
        
        if (data.basePrice && typeof data.basePrice === 'number') {
          updates.previousBasePrice = data.basePrice;
          updates.basePrice = convertFCFAToCAD(data.basePrice, conversionRate);
        }
        
        if (data.pricePerKm && typeof data.pricePerKm === 'number') {
          updates.previousPricePerKm = data.pricePerKm;
          updates.pricePerKm = convertFCFAToCAD(data.pricePerKm, conversionRate);
        }
        
        if (data.pricePerMinute && typeof data.pricePerMinute === 'number') {
          updates.previousPricePerMinute = data.pricePerMinute;
          updates.pricePerMinute = convertFCFAToCAD(data.pricePerMinute, conversionRate);
        }
        
        batch.update(doc.ref, updates);
        batchProcessed++;
      } catch (error) {
        totalFailed++;
        stats.errors.push({
          docId: doc.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    await batch.commit();
    totalProcessed += batchProcessed;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    logger.info(`🔄 Migration drivers en cours: ${totalProcessed} documents traités`);
  }
  
  stats.totalDocuments = totalProcessed + totalFailed;
  stats.migratedDocuments = totalProcessed;
  stats.failedDocuments = totalFailed;
  logger.info(` Migration drivers terminée: ${totalProcessed}/${stats.totalDocuments} documents`);
}

/**
 * Cloud Function principale pour migrer toutes les données de FCFA vers CAD
 * 
 * @remarks
 * IMPORTANT: Cette fonction doit être exécutée une seule fois ou avec un flag de confirmation.
 * Elle effectue les opérations suivantes:
 * 1. Backup toutes les collections concernées vers Firebase Storage
 * 2. Convertit tous les soldes FCFA → CAD (taux: ~285 FCFA/CAD)
 * 3. Met à jour `currency: 'CAD'` sur tous les documents
 * 4. Convertit tous les `carTypes` (basePrice, pricePerKm, pricePerMinute)
 * 5. Log le nombre de documents migrés et les erreurs
 * 
 * @param data - Données de la fonction
 * @param data.confirm - Flag de confirmation requis (doit être "MIGRATE_TO_CAD_CONFIRMED")
 * @param context - Contexte de la fonction Cloud
 * @returns Promise avec les statistiques de migration
 */
export const migrateCurrencyToCAD = onCall(
  async (request) => {
    // Vérifier l'authentification
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'L\'utilisateur doit être authentifié pour exécuter cette migration.'
      );
    }
    
    // Vérifier le rôle admin via collection admins/{uid} (pattern canonique du projet)
    const adminDoc = await db.collection('admins').doc(request.auth.uid).get();
    if (!adminDoc.exists) {
      throw new HttpsError(
        'permission-denied',
        'Cette fonction est réservée aux administrateurs.'
      );
    }

    // Rate limit: migration is destructive and single-shot; never needs
    // more than a couple of calls per hour even during incident recovery.
    await enforceRateLimit({
      identifier: request.auth.uid,
      bucket: 'migrate:currencyToCAD',
      limit: 3,
      windowSec: 60 * 60,
    });

    const data = request.data as {
      confirm?: string;
      conversionRate?: number;
    };
    
    // Vérifier le flag de confirmation
    if (data.confirm !== 'MIGRATE_TO_CAD_CONFIRMED') {
      throw new HttpsError(
        'failed-precondition',
        'Le flag de confirmation est requis. Utilisez { confirm: "MIGRATE_TO_CAD_CONFIRMED" } pour confirmer la migration.'
      );
    }
    
    // Utiliser le taux de conversion fourni ou le taux par défaut
    const conversionRate = data.conversionRate || CONVERSION_RATE;
    
    logger.info('🚀 Démarrage de la migration FCFA → CAD...');
    logger.info(`📊 Taux de conversion: ${conversionRate} FCFA/CAD ${data.conversionRate ? '(fourni)' : '(par défaut)'}`);
    
    const allStats: MigrationStats[] = [];
    const startTime = Date.now();
    
    try {
      // Étape 1: Backup de toutes les collections
      logger.info('📦 Étape 1: Backup des collections...');
      for (const collectionName of COLLECTIONS_TO_MIGRATE) {
        await backupCollection(collectionName);
      }
      
      // Étape 2: Migration de chaque collection
      logger.info('🔄 Étape 2: Migration des collections...');
      
      // Migration wallets
      const walletsStats: MigrationStats = {
        collection: 'wallets',
        totalDocuments: 0,
        migratedDocuments: 0,
        failedDocuments: 0,
        errors: []
      };
      await migrateWallets(walletsStats, conversionRate);
      allStats.push(walletsStats);
      
      // Migration transactions
      const transactionsStats: MigrationStats = {
        collection: 'transactions',
        totalDocuments: 0,
        migratedDocuments: 0,
        failedDocuments: 0,
        errors: []
      };
      await migrateTransactions(transactionsStats, conversionRate);
      allStats.push(transactionsStats);
      
      // Migration bookings
      const bookingsStats: MigrationStats = {
        collection: 'bookings',
        totalDocuments: 0,
        migratedDocuments: 0,
        failedDocuments: 0,
        errors: []
      };
      await migrateBookings(bookingsStats, conversionRate);
      allStats.push(bookingsStats);
      
      // Migration carTypes
      const carTypesStats: MigrationStats = {
        collection: 'carTypes',
        totalDocuments: 0,
        migratedDocuments: 0,
        failedDocuments: 0,
        errors: []
      };
      await migrateCarTypes(carTypesStats, conversionRate);
      allStats.push(carTypesStats);
      
      // Migration drivers
      const driversStats: MigrationStats = {
        collection: 'drivers',
        totalDocuments: 0,
        migratedDocuments: 0,
        failedDocuments: 0,
        errors: []
      };
      await migrateDrivers(driversStats, conversionRate);
      allStats.push(driversStats);
      
      // Calculer les statistiques globales
      const totalDocuments = allStats.reduce((sum, stat) => sum + stat.totalDocuments, 0);
      const totalMigrated = allStats.reduce((sum, stat) => sum + stat.migratedDocuments, 0);
      const totalFailed = allStats.reduce((sum, stat) => sum + stat.failedDocuments, 0);
      const duration = Date.now() - startTime;
      
      logger.info(' Migration terminée avec succès!');
      logger.info(`📊 Statistiques globales:`);
      logger.info(`   - Documents totaux: ${totalDocuments}`);
      logger.info(`   - Documents migrés: ${totalMigrated}`);
      logger.info(`   - Documents échoués: ${totalFailed}`);
      logger.info(`   - Durée: ${Math.round(duration / 1000)}s`);
      
      // Retourner les statistiques détaillées
      return {
        success: true,
        message: 'Migration FCFA → CAD terminée avec succès',
        stats: {
          totalDocuments,
          migratedDocuments: totalMigrated,
          failedDocuments: totalFailed,
          duration: `${Math.round(duration / 1000)}s`,
          collections: allStats.map(stat => ({
            collection: stat.collection,
            total: stat.totalDocuments,
            migrated: stat.migratedDocuments,
            failed: stat.failedDocuments,
            errors: stat.errors.slice(0, 10) // Limiter à 10 erreurs par collection
          }))
        }
      };
    } catch (error) {
      logger.error('Erreur lors de la migration:', error);
      throw new HttpsError(
        'internal',
        `Erreur lors de la migration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);

/**
 * Cloud Function HTTP pour déclencher la migration via une requête HTTP
 * 
 * @remarks
 * Alternative à la fonction onCall pour les tests ou les scripts automatisés.
 * Nécessite également le flag de confirmation.
 * 
 * @param req - Requête HTTP
 * @param res - Réponse HTTP
 */
export const migrateCurrencyToCADHTTP = onRequest(
  async (req, res) => {
    // Vérifier la méthode HTTP
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
      return;
    }
    
    // Vérifier le flag de confirmation
    const confirm = req.body.confirm || req.query.confirm;
    if (confirm !== 'MIGRATE_TO_CAD_CONFIRMED') {
      res.status(400).json({
        error: 'Le flag de confirmation est requis',
        message: 'Utilisez ?confirm=MIGRATE_TO_CAD_CONFIRMED ou { confirm: "MIGRATE_TO_CAD_CONFIRMED" } dans le body'
      });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }
    let callerUid: string;
    try {
      const decodedToken = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
      callerUid = decodedToken.uid;
      const userDoc = await admin.firestore().collection('admins').where('userId', '==', decodedToken.uid).limit(1).get();
      if (userDoc.empty) {
        res.status(403).json({ error: 'Accès non autorisé — admin requis' });
        return;
      }
    } catch (error) {
      res.status(401).json({ error: 'Token invalide' });
      return;
    }

    // Rate limit (3/hour per admin): HTTP variant of the migration —
    // same destructive footprint as the onCall version.
    try {
      await enforceRateLimit({
        identifier: callerUid,
        bucket: 'migrate:currencyToCADHTTP',
        limit: 3,
        windowSec: 60 * 60,
      });
    } catch (err) {
      const isRateLimit = err instanceof HttpsError && err.code === 'resource-exhausted';
      res.status(isRateLimit ? 429 : 503).json({
        error: isRateLimit ? 'Trop de requêtes' : 'Service indisponible',
      });
      return;
    }
    
    logger.info('🚀 Démarrage de la migration FCFA → CAD (HTTP)...');
    
    const allStats: MigrationStats[] = [];
    const startTime = Date.now();
    
    try {
      // Étape 1: Backup de toutes les collections
      logger.info('📦 Étape 1: Backup des collections...');
      for (const collectionName of COLLECTIONS_TO_MIGRATE) {
        await backupCollection(collectionName);
      }
      
      // Étape 2: Migration de chaque collection
      logger.info('🔄 Étape 2: Migration des collections...');
      
      // Migration wallets
      const walletsStats: MigrationStats = {
        collection: 'wallets',
        totalDocuments: 0,
        migratedDocuments: 0,
        failedDocuments: 0,
        errors: []
      };
      await migrateWallets(walletsStats);
      allStats.push(walletsStats);
      
      // Migration transactions
      const transactionsStats: MigrationStats = {
        collection: 'transactions',
        totalDocuments: 0,
        migratedDocuments: 0,
        failedDocuments: 0,
        errors: []
      };
      await migrateTransactions(transactionsStats);
      allStats.push(transactionsStats);
      
      // Migration bookings
      const bookingsStats: MigrationStats = {
        collection: 'bookings',
        totalDocuments: 0,
        migratedDocuments: 0,
        failedDocuments: 0,
        errors: []
      };
      await migrateBookings(bookingsStats);
      allStats.push(bookingsStats);
      
      // Migration carTypes
      const carTypesStats: MigrationStats = {
        collection: 'carTypes',
        totalDocuments: 0,
        migratedDocuments: 0,
        failedDocuments: 0,
        errors: []
      };
      await migrateCarTypes(carTypesStats);
      allStats.push(carTypesStats);
      
      // Migration drivers
      const driversStats: MigrationStats = {
        collection: 'drivers',
        totalDocuments: 0,
        migratedDocuments: 0,
        failedDocuments: 0,
        errors: []
      };
      await migrateDrivers(driversStats);
      allStats.push(driversStats);
      
      // Calculer les statistiques globales
      const totalDocuments = allStats.reduce((sum, stat) => sum + stat.totalDocuments, 0);
      const totalMigrated = allStats.reduce((sum, stat) => sum + stat.migratedDocuments, 0);
      const totalFailed = allStats.reduce((sum, stat) => sum + stat.failedDocuments, 0);
      const duration = Date.now() - startTime;
      
      logger.info(' Migration terminée avec succès!');
      
      res.status(200).json({
        success: true,
        message: 'Migration FCFA → CAD terminée avec succès',
        stats: {
          totalDocuments,
          migratedDocuments: totalMigrated,
          failedDocuments: totalFailed,
          duration: `${Math.round(duration / 1000)}s`,
          collections: allStats.map(stat => ({
            collection: stat.collection,
            total: stat.totalDocuments,
            migrated: stat.migratedDocuments,
            failed: stat.failedDocuments,
            errors: stat.errors.slice(0, 10)
          }))
        }
      });
    } catch (error) {
      logger.error('Erreur lors de la migration:', error);
      res.status(500).json({
        error: 'Erreur lors de la migration',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Fonction de rollback pour restaurer les valeurs précédentes après une migration
 *
 * @remarks
 * Cette fonction permet de revenir en arrière après une migration FCFA→CAD
 * en restaurant les valeurs depuis les champs previous*.
 *
 * @param data - Données de la fonction
 * @param data.confirm - Flag de confirmation requis (doit être "ROLLBACK_CAD_TO_FCFA_CONFIRMED")
 * @param context - Contexte de la fonction Cloud
 * @returns Promise avec les statistiques de rollback
 */
export const rollbackCurrencyMigration = onCall(
  async (request) => {
    // Vérifier l'authentification
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'L\'utilisateur doit être authentifié pour exécuter ce rollback.'
      );
    }
    
    // Vérifier le rôle admin via collection admins/{uid} (pattern canonique du projet)
    const adminDoc = await db.collection('admins').doc(request.auth.uid).get();
    if (!adminDoc.exists) {
      throw new HttpsError(
        'permission-denied',
        'Cette fonction est réservée aux administrateurs.'
      );
    }

    // Rate limit: rollback is destructive and should not be looped.
    await enforceRateLimit({
      identifier: request.auth.uid,
      bucket: 'migrate:rollbackCurrency',
      limit: 3,
      windowSec: 60 * 60,
    });

    const data = request.data as {
      confirm?: string;
    };
    
    // Vérifier le flag de confirmation
    if (data.confirm !== 'ROLLBACK_CAD_TO_FCFA_CONFIRMED') {
      throw new HttpsError(
        'failed-precondition',
        'Le flag de confirmation est requis. Utilisez { confirm: "ROLLBACK_CAD_TO_FCFA_CONFIRMED" } pour confirmer le rollback.'
      );
    }
    
    logger.info('Démarrage du rollback CAD → FCFA...');
    
    const allStats: MigrationStats[] = [];
    const startTime = Date.now();
    
    try {
      // Rollback de chaque collection
      const rollbackFunctions = [
        { name: 'wallets', fn: rollbackWallets },
        { name: 'transactions', fn: rollbackTransactions },
        { name: 'bookings', fn: rollbackBookings },
        { name: 'carTypes', fn: rollbackCarTypes },
        { name: 'drivers', fn: rollbackDrivers },
      ];
      
      for (const { name, fn } of rollbackFunctions) {
        const stats: MigrationStats = {
          collection: name,
          totalDocuments: 0,
          migratedDocuments: 0,
          failedDocuments: 0,
          errors: []
        };
        await fn(stats);
        allStats.push(stats);
      }
      
      // Calculer les statistiques globales
      const totalDocuments = allStats.reduce((sum, stat) => sum + stat.totalDocuments, 0);
      const totalRolledBack = allStats.reduce((sum, stat) => sum + stat.migratedDocuments, 0);
      const totalFailed = allStats.reduce((sum, stat) => sum + stat.failedDocuments, 0);
      const duration = Date.now() - startTime;
      
      logger.info(' Rollback terminé avec succès!');
      logger.info(`📊 Statistiques globales:`);
      logger.info(`   - Documents totaux: ${totalDocuments}`);
      logger.info(`   - Documents restaurés: ${totalRolledBack}`);
      logger.info(`   - Documents échoués: ${totalFailed}`);
      logger.info(`   - Durée: ${Math.round(duration / 1000)}s`);
      
      return {
        success: true,
        message: 'Rollback CAD → FCFA terminé avec succès',
        stats: {
          totalDocuments,
          rolledBackDocuments: totalRolledBack,
          failedDocuments: totalFailed,
          duration: `${Math.round(duration / 1000)}s`,
          collections: allStats.map(stat => ({
            collection: stat.collection,
            total: stat.totalDocuments,
            rolledBack: stat.migratedDocuments,
            failed: stat.failedDocuments,
            errors: stat.errors.slice(0, 10)
          }))
        }
      };
    } catch (error) {
      logger.error('Erreur lors du rollback:', error);
      throw new HttpsError(
        'internal',
        `Erreur lors du rollback: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);

/**
 * Rollback la collection 'wallets'
 */
async function rollbackWallets(stats: MigrationStats): Promise<void> {
  logger.info('⏪ Rollback de la collection wallets...');
  
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let totalProcessed = 0;
  let totalFailed = 0;
  const batchSize = 500;
  
  while (true) {
    let query = db.collection('wallets').orderBy('__name__').limit(batchSize);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) break;
    
    const batch = db.batch();
    let batchProcessed = 0;
    
    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        
        // Vérifier si le document a été migré
        if (data.previousCurrency === 'FCFA' && data.previousBalance !== undefined) {
          batch.update(doc.ref, {
            balance: data.previousBalance,
            currency: 'FCFA',
            migratedAt: admin.firestore.FieldValue.delete(),
            previousCurrency: admin.firestore.FieldValue.delete(),
            previousBalance: admin.firestore.FieldValue.delete()
          });
          
          batchProcessed++;
        }
      } catch (error) {
        totalFailed++;
        stats.errors.push({
          docId: doc.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    await batch.commit();
    totalProcessed += batchProcessed;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    logger.info(`⏪ Rollback wallets en cours: ${totalProcessed} documents traités`);
  }
  
  stats.totalDocuments = totalProcessed + totalFailed;
  stats.migratedDocuments = totalProcessed;
  stats.failedDocuments = totalFailed;
  logger.info(` Rollback wallets terminé: ${totalProcessed}/${stats.totalDocuments} documents`);
}

/**
 * Rollback la collection 'transactions'
 */
async function rollbackTransactions(stats: MigrationStats): Promise<void> {
  logger.info('⏪ Rollback de la collection transactions...');
  
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let totalProcessed = 0;
  let totalFailed = 0;
  const batchSize = 500;
  
  while (true) {
    let query = db.collection('transactions').orderBy('__name__').limit(batchSize);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) break;
    
    const batch = db.batch();
    let batchProcessed = 0;
    
    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        
        // Vérifier si le document a été migré
        if (data.previousCurrency === 'FCFA') {
          const updates: Record<string, unknown> = {
            currency: 'FCFA',
            migratedAt: admin.firestore.FieldValue.delete(),
            previousCurrency: admin.firestore.FieldValue.delete()
          };
          
          if (data.previousAmount !== undefined) {
            updates.amount = data.previousAmount;
            updates.previousAmount = admin.firestore.FieldValue.delete();
          }
          
          if (data.previousFee !== undefined) {
            updates.fee = data.previousFee;
            updates.previousFee = admin.firestore.FieldValue.delete();
          }
          
          if (data.previousBalanceBefore !== undefined) {
            updates.balanceBefore = data.previousBalanceBefore;
            updates.previousBalanceBefore = admin.firestore.FieldValue.delete();
          }
          
          if (data.previousBalanceAfter !== undefined) {
            updates.balanceAfter = data.previousBalanceAfter;
            updates.previousBalanceAfter = admin.firestore.FieldValue.delete();
          }
          
          batch.update(doc.ref, updates);
          batchProcessed++;
        }
      } catch (error) {
        totalFailed++;
        stats.errors.push({
          docId: doc.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    await batch.commit();
    totalProcessed += batchProcessed;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    logger.info(`⏪ Rollback transactions en cours: ${totalProcessed} documents traités`);
  }
  
  stats.totalDocuments = totalProcessed + totalFailed;
  stats.migratedDocuments = totalProcessed;
  stats.failedDocuments = totalFailed;
  logger.info(` Rollback transactions terminé: ${totalProcessed}/${stats.totalDocuments} documents`);
}

/**
 * Rollback la collection 'bookings'
 */
async function rollbackBookings(stats: MigrationStats): Promise<void> {
  logger.info('⏪ Rollback de la collection bookings...');
  
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let totalProcessed = 0;
  let totalFailed = 0;
  const batchSize = 500;
  
  while (true) {
    let query = db.collection('bookings').orderBy('__name__').limit(batchSize);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) break;
    
    const batch = db.batch();
    let batchProcessed = 0;
    
    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        
        // Vérifier si le document a été migré
        if (data.previousCurrency === 'FCFA') {
          const updates: Record<string, unknown> = {
            currency: 'FCFA',
            migratedAt: admin.firestore.FieldValue.delete(),
            previousCurrency: admin.firestore.FieldValue.delete()
          };
          
          if (data.previousPrice !== undefined) {
            updates.price = data.previousPrice;
            updates.previousPrice = admin.firestore.FieldValue.delete();
          }
          
          if (data.previousDriverEarnings !== undefined) {
            updates.driverEarnings = data.previousDriverEarnings;
            updates.previousDriverEarnings = admin.firestore.FieldValue.delete();
          }
          
          if (data.previousCommission !== undefined) {
            updates.commission = data.previousCommission;
            updates.previousCommission = admin.firestore.FieldValue.delete();
          }
          
          if (data.previousCancellationFee !== undefined) {
            updates.cancellationFee = data.previousCancellationFee;
            updates.previousCancellationFee = admin.firestore.FieldValue.delete();
          }
          
          batch.update(doc.ref, updates);
          batchProcessed++;
        }
      } catch (error) {
        totalFailed++;
        stats.errors.push({
          docId: doc.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    await batch.commit();
    totalProcessed += batchProcessed;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    logger.info(`⏪ Rollback bookings en cours: ${totalProcessed} documents traités`);
  }
  
  stats.totalDocuments = totalProcessed + totalFailed;
  stats.migratedDocuments = totalProcessed;
  stats.failedDocuments = totalFailed;
  logger.info(` Rollback bookings terminé: ${totalProcessed}/${stats.totalDocuments} documents`);
}

/**
 * Rollback la collection 'carTypes'
 */
async function rollbackCarTypes(stats: MigrationStats): Promise<void> {
  logger.info('⏪ Rollback de la collection carTypes...');
  
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let totalProcessed = 0;
  let totalFailed = 0;
  const batchSize = 500;
  
  while (true) {
    let query = db.collection('carTypes').orderBy('__name__').limit(batchSize);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) break;
    
    const batch = db.batch();
    let batchProcessed = 0;
    
    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        
        // Vérifier si le document a été migré
        if (data.previousCurrency === 'FCFA') {
          const updates: Record<string, unknown> = {
            currency: 'FCFA',
            migratedAt: admin.firestore.FieldValue.delete(),
            previousCurrency: admin.firestore.FieldValue.delete()
          };
          
          if (data.previousBasePrice !== undefined) {
            updates.basePrice = data.previousBasePrice;
            updates.previousBasePrice = admin.firestore.FieldValue.delete();
          }
          
          if (data.previousPricePerKm !== undefined) {
            updates.pricePerKm = data.previousPricePerKm;
            updates.previousPricePerKm = admin.firestore.FieldValue.delete();
          }
          
          if (data.previousPricePerMinute !== undefined) {
            updates.pricePerMinute = data.previousPricePerMinute;
            updates.previousPricePerMinute = admin.firestore.FieldValue.delete();
          }
          
          batch.update(doc.ref, updates);
          batchProcessed++;
        }
      } catch (error) {
        totalFailed++;
        stats.errors.push({
          docId: doc.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    await batch.commit();
    totalProcessed += batchProcessed;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    logger.info(`⏪ Rollback carTypes en cours: ${totalProcessed} documents traités`);
  }
  
  stats.totalDocuments = totalProcessed + totalFailed;
  stats.migratedDocuments = totalProcessed;
  stats.failedDocuments = totalFailed;
  logger.info(` Rollback carTypes terminé: ${totalProcessed}/${stats.totalDocuments} documents`);
}

/**
 * Rollback la collection 'drivers' (champs de tarification)
 */
async function rollbackDrivers(stats: MigrationStats): Promise<void> {
  logger.info('⏪ Rollback de la collection drivers...');
  
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let totalProcessed = 0;
  let totalFailed = 0;
  const batchSize = 500;
  
  while (true) {
    let query = db.collection('drivers').orderBy('__name__').limit(batchSize);
    
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    
    const snapshot = await query.get();
    
    if (snapshot.empty) break;
    
    const batch = db.batch();
    let batchProcessed = 0;
    
    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        
        // Vérifier si le document a été migré
        if (data.previousCurrency === 'FCFA') {
          const updates: Record<string, unknown> = {
            migratedAt: admin.firestore.FieldValue.delete(),
            previousCurrency: admin.firestore.FieldValue.delete()
          };
          
          if (data.previousBasePrice !== undefined) {
            updates.basePrice = data.previousBasePrice;
            updates.previousBasePrice = admin.firestore.FieldValue.delete();
          }
          
          if (data.previousPricePerKm !== undefined) {
            updates.pricePerKm = data.previousPricePerKm;
            updates.previousPricePerKm = admin.firestore.FieldValue.delete();
          }
          
          if (data.previousPricePerMinute !== undefined) {
            updates.pricePerMinute = data.previousPricePerMinute;
            updates.previousPricePerMinute = admin.firestore.FieldValue.delete();
          }
          
          batch.update(doc.ref, updates);
          batchProcessed++;
        }
      } catch (error) {
        totalFailed++;
        stats.errors.push({
          docId: doc.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    await batch.commit();
    totalProcessed += batchProcessed;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    
    logger.info(`⏪ Rollback drivers en cours: ${totalProcessed} documents traités`);
  }
  
  stats.totalDocuments = totalProcessed + totalFailed;
  stats.migratedDocuments = totalProcessed;
  stats.failedDocuments = totalFailed;
  logger.info(` Rollback drivers terminé: ${totalProcessed}/${stats.totalDocuments} documents`);
}
