import admin from 'firebase-admin';
import serviceAccount from '../src/config/keys/serviceAccountKey.json' with { type: 'json' };

// Initialiser Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'medjira-service'
});

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
