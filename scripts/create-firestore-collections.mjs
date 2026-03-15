import admin from 'firebase-admin';
import serviceAccount from '../src/config/keys/serviceAccountKey.json' with { type: 'json' };

// Initialiser Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'medjira-service'
});

const db = admin.firestore();

// Définition des collections et leur structure de base
const collections = [
  {
    name: 'users',
    sampleDoc: {
      _init: true,
      _timestamp: admin.firestore.FieldValue.serverTimestamp()
    }
  },
  {
    name: 'drivers',
    sampleDoc: {
      _init: true,
      _timestamp: admin.firestore.FieldValue.serverTimestamp()
    }
  },
  {
    name: 'wallets',
    sampleDoc: {
      _init: true,
      _timestamp: admin.firestore.FieldValue.serverTimestamp()
    }
  },
  {
    name: 'transactions',
    sampleDoc: {
      _init: true,
      _timestamp: admin.firestore.FieldValue.serverTimestamp()
    }
  },
  {
    name: 'admins',
    sampleDoc: {
      _init: true,
      _timestamp: admin.firestore.FieldValue.serverTimestamp()
    }
  },
  {
    name: 'carTypes',
    sampleDoc: {
      _init: true,
      _timestamp: admin.firestore.FieldValue.serverTimestamp()
    }
  },
  {
    name: 'ratings',
    sampleDoc: {
      _init: true,
      _timestamp: admin.firestore.FieldValue.serverTimestamp()
    }
  },
  {
    name: 'parcels',
    sampleDoc: {
      _init: true,
      _timestamp: admin.firestore.FieldValue.serverTimestamp()
    }
  }
];

async function createCollections() {
  console.log('🔍 Début de la création des collections Firestore...\n');

  try {
    // Lister les collections existantes
    console.log('📋 Récupération des collections existantes...');
    const existingCollections = await db.listCollections();
    const existingCollectionNames = existingCollections.map(col => col.id);
    
    console.log(`Collections existantes: ${existingCollectionNames.join(', ') || 'Aucune'}\n`);

    // Créer les collections manquantes
    for (const collection of collections) {
      console.log(`📝 Vérification de la collection "${collection.name}"...`);
      
      if (!existingCollectionNames.includes(collection.name)) {
        console.log(` Collection "${collection.name}" manquante`);
        console.log(`📝 Création de la collection "${collection.name}"...`);
        
        try {
          // Créer un document de marqueur pour créer la collection
          const docRef = await db.collection(collection.name).add(collection.sampleDoc);
          
          console.log(` Collection "${collection.name}" créée avec succès (document ID: ${docRef.id})`);
          console.log('');
        } catch (error) {
          console.error(`Erreur lors de la création de "${collection.name}":`, error.message);
          console.log('');
        }
      } else {
        console.log(` Collection "${collection.name}" existe déjà`);
        console.log('');
      }
    }

    // Attendre un peu pour que les collections soient propagées
    console.log('⏳ Attente de la propagation des collections...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('');

    // Vérification finale
    console.log('🔍 Vérification finale des collections...');
    const finalCollections = await db.listCollections();
    const finalCollectionNames = finalCollections.map(col => col.id);
    
    console.log(`Collections finales: ${finalCollectionNames.join(', ')}`);
    console.log('');

    // Comparaison
    const expectedCollections = collections.map(c => c.name);
    const missingCollections = expectedCollections.filter(c => !finalCollectionNames.includes(c));
    
    if (missingCollections.length === 0) {
      console.log(' Toutes les collections requises existent maintenant!');
    } else {
      console.log(` Collections toujours manquantes: ${missingCollections.join(', ')}`);
    }
    
    console.log('');
    console.log('📊 Résumé:');
    console.log(`   Collections existantes: ${finalCollectionNames.length}`);
    console.log(`   Collections attendues: ${expectedCollections.length}`);
    console.log(`   Collections manquantes: ${missingCollections.length}`);
    console.log('');
    console.log('📝 Note importante:');
    console.log('   Firestore ne supporte pas les collections vides.');
    console.log('   Chaque collection contient un document de marqueur (_init: true)');
    console.log('   Ces documents peuvent être supprimés une fois que la collection est utilisée.');
    console.log('');
    console.log(' Opération terminée!');

  } catch (error) {
    console.error('Erreur générale:', error);
  }
}

// Exécuter la création des collections
createCollections().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Erreur:', error);
  process.exit(1);
});
