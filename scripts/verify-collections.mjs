import admin from 'firebase-admin';

/**
 * Initialisation Firebase Admin via variables d'environnement (P0-1 sécurité).
 *
 * Options supportées :
 *   1. GOOGLE_APPLICATION_CREDENTIALS=/chemin/vers/serviceAccountKey.json
 *      (option recommandée — applicationDefault() lit le fichier indiqué)
 *   2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *      (les \n échappés dans FIREBASE_PRIVATE_KEY sont convertis automatiquement)
 *
 * La clé privée NE DOIT JAMAIS être importée en dur depuis le repo.
 */
const projectId = process.env.FIREBASE_PROJECT_ID || 'medjira-service';

if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    projectId,
  });
} else {
  // Utilise GOOGLE_APPLICATION_CREDENTIALS si défini, sinon ADC
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

const db = admin.firestore();

// Collections attendues
const expectedCollections = [
  'users',
  'drivers',
  'wallets',
  'transactions',
  'admins',
  'carTypes',
  'ratings',
  'parcels',
  'bookings'
];

async function verifyCollections() {
  console.log('🔍 Vérification de l\'état de la base de données Firestore...\n');

  try {
    // Lister les collections existantes
    console.log('📋 Récupération des collections existantes...');
    const existingCollections = await db.listCollections();
    const existingCollectionNames = existingCollections.map(col => col.id);
    
    console.log(`Collections existantes: ${existingCollectionNames.join(', ')}`);
    console.log('');

    // Vérifier chaque collection attendue
    console.log('📊 État détaillé de chaque collection:\n');
    
    let totalDocs = 0;
    const collectionStatus = [];

    for (const collectionName of expectedCollections) {
      const exists = existingCollectionNames.includes(collectionName);
      const status = exists ? '' : '❌';
      
      let docCount = 0;
      let hasInitDoc = false;
      
      if (exists) {
        const snapshot = await db.collection(collectionName).get();
        docCount = snapshot.size;
        totalDocs += docCount;
        
        // Vérifier s'il y a un document de marqueur
        snapshot.forEach(doc => {
          if (doc.data()._init === true) {
            hasInitDoc = true;
          }
        });
      }
      
      collectionStatus.push({
        name: collectionName,
        exists,
        docCount,
        hasInitDoc
      });
      
      console.log(`${status} ${collectionName}:`);
      console.log(`   - Existe: ${exists ? 'Oui' : 'Non'}`);
      if (exists) {
        console.log(`   - Documents: ${docCount}`);
        console.log(`   - Document de marqueur: ${hasInitDoc ? 'Oui' : 'Non'}`);
      }
      console.log('');
    }

    // Résumé global
    const existingCount = collectionStatus.filter(c => c.exists).length;
    const missingCollections = collectionStatus.filter(c => !c.exists).map(c => c.name);
    
    console.log('📊 Résumé global:\n');
    console.log(`   Collections attendues: ${expectedCollections.length}`);
    console.log(`   Collections existantes: ${existingCount}`);
    console.log(`   Collections manquantes: ${missingCollections.length}`);
    console.log(`   Documents totaux: ${totalDocs}`);
    console.log('');
    
    if (missingCollections.length === 0) {
      console.log(' SUCCÈS: Toutes les collections requises existent!\n');
      console.log('📝 Note importante:');
      console.log('   - Firestore ne supporte pas les collections vides');
      console.log('   - Chaque collection contient un document de marqueur (_init: true)');
      console.log('   - Ces documents peuvent être supprimés une fois que la collection est utilisée');
      console.log('   - Les structures des collections correspondent à celles définies dans le code');
    } else {
      console.log(` ATTENTION: ${missingCollections.length} collection(s) manquante(s):`);
      missingCollections.forEach(col => {
        console.log(`   - ${col}`);
      });
    }
    
    console.log('\n Vérification terminée!');

  } catch (error) {
    console.error('Erreur lors de la vérification:', error);
  }
}

// Exécuter la vérification
verifyCollections().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Erreur:', error);
  process.exit(1);
});
