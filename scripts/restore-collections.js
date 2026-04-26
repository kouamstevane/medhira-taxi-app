/**
 * Script pour recréer les collections Firestore manquantes
 * Ce script crée les collections avec leur structure mais sans données
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialiser Firebase Admin
// Utiliser les identifiants par défaut de l'environnement (GOOGLE_APPLICATION_CREDENTIALS)
// ou les identifiants de l'application Firebase si disponibles
try {
  initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'medjira-service'
  });
  console.log(' Firebase Admin initialisé avec succès');
} catch (error) {
  console.error('Erreur lors de l\'initialisation de Firebase Admin:', error.message);
  console.error('Veuillez configurer les identifiants Firebase Admin:');
  console.error('1. Définissez la variable d\'environnement GOOGLE_APPLICATION_CREDENTIALS');
  console.error('   ou');
  console.error('2. Placez un fichier firebase-service-account.json à la racine du projet');
  process.exit(1);
}

const db = getFirestore();

// Définition des collections et leur structure de base
const collections = [
  {
    name: 'users',
    sampleDoc: {
      uid: 'sample_user_id',
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
      userType: 'client',
      profileImageUrl: '',
      phoneNumber: '',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  },
  {
    name: 'drivers',
    sampleDoc: {
      userId: 'sample_user_id',
      email: 'driver@example.com',
      firstName: 'Driver',
      lastName: 'Name',
      phoneNumber: '+237600000000',
      profileImageUrl: '',
      vehicleId: 'sample_vehicle_id',
      carTypeId: 'sample_car_type_id',
      isAvailable: true,
      isVerified: false,
      rating: 0,
      totalRatings: 0,
      totalRides: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  },
  {
    name: 'wallets',
    sampleDoc: {
      userId: 'sample_user_id',
      balance: 0,
      currency: 'XAF',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  },
  {
    name: 'transactions',
    sampleDoc: {
      userId: 'sample_user_id',
      type: 'credit',
      amount: 0,
      currency: 'XAF',
      description: 'Sample transaction',
      status: 'completed',
      bookingId: '',
      createdAt: new Date()
    }
  },
  {
    name: 'admins',
    sampleDoc: {
      userId: 'sample_admin_id',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  },
  {
    name: 'carTypes',
    sampleDoc: {
      name: 'Standard',
      description: 'Voiture standard',
      baseFare: 500,
      pricePerKm: 100,
      pricePerMinute: 20,
      imageUrl: '',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  },
  {
    name: 'ratings',
    sampleDoc: {
      driverId: 'sample_driver_id',
      userId: 'sample_user_id',
      bookingId: 'sample_booking_id',
      rating: 5,
      comment: 'Excellent service',
      createdAt: new Date()
    }
  },
  {
    name: 'parcels',
    sampleDoc: {
      senderId: 'sample_user_id',
      recipientName: 'Recipient',
      recipientPhone: '+237600000000',
      pickupLocation: {
        address: 'Pickup Address',
        latitude: 3.8488,
        longitude: 11.5021
      },
      dropoffLocation: {
        address: 'Dropoff Address',
        latitude: 3.8488,
        longitude: 11.5021
      },
      description: 'Sample parcel',
      weight: 1,
      status: 'pending',
      price: 1000,
      currency: 'XAF',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }
];

async function createCollections() {
  console.log('🔍 Vérification des collections Firestore...\n');

  // Lister les collections existantes
  const existingCollections = await db.listCollections();
  const existingCollectionNames = existingCollections.map(col => col.id);
  
  console.log('Collections existantes:', existingCollectionNames);
  console.log();

  // Créer les collections manquantes
  for (const collection of collections) {
    const collectionRef = db.collection(collection.name);
    
    if (!existingCollectionNames.includes(collection.name)) {
      console.log(` Collection "${collection.name}" manquante`);
      console.log(`📝 Création de la collection "${collection.name}"...`);
      
      try {
        // Créer un document vide pour créer la collection
        const sampleDoc = collection.sampleDoc;
        const docRef = await collectionRef.add(sampleDoc);
        console.log(` Collection "${collection.name}" créée avec succès (document ID: ${docRef.id})`);
        
        // Supprimer immédiatement le document de test
        await docRef.delete();
        console.log(`🗑️  Document de test supprimé de "${collection.name}"`);
        console.log();
      } catch (error) {
        console.error(`Erreur lors de la création de "${collection.name}":`, error.message);
        console.log();
      }
    } else {
      console.log(` Collection "${collection.name}" existe déjà`);
      console.log();
    }
  }

  // Vérifier les sous-collections de bookings
  console.log('🔍 Vérification des sous-collections de bookings...\n');
  
  const bookingsSnapshot = await db.collection('bookings').limit(1).get();
  
  if (bookingsSnapshot.empty) {
    console.log(' Aucun document dans la collection bookings');
    console.log('📝 Création d\'un document de test pour créer les sous-collections...');
    
    try {
      const bookingRef = await db.collection('bookings').add({
        userId: 'sample_user_id',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      const bookingId = bookingRef.id;
      console.log(` Document de test créé dans bookings (ID: ${bookingId})`);
      
      // Créer la sous-collection candidates
      const candidatesRef = bookingRef.collection('candidates');
      const candidateDoc = await candidatesRef.add({
        driverId: 'sample_driver_id',
        status: 'pending',
        proposedPrice: 1000,
        createdAt: new Date()
      });
      console.log(` Sous-collection "candidates" créée`);
      await candidateDoc.delete();
      
      // Créer la sous-collection messages
      const messagesRef = bookingRef.collection('messages');
      const messageDoc = await messagesRef.add({
        senderId: 'sample_user_id',
        message: 'Sample message',
        createdAt: new Date()
      });
      console.log(` Sous-collection "messages" créée`);
      await messageDoc.delete();
      
      // Supprimer le document de test
      await bookingRef.delete();
      console.log(`🗑️  Document de test supprimé de bookings`);
      console.log();
    } catch (error) {
      console.error(`Erreur lors de la création des sous-collections:`, error.message);
      console.log();
    }
  } else {
    console.log(' Collection bookings contient des documents');
    console.log('📝 Les sous-collections seront créées automatiquement lors de l\'utilisation');
    console.log();
  }

  // Vérification finale
  console.log('🔍 Vérification finale des collections...\n');
  const finalCollections = await db.listCollections();
  const finalCollectionNames = finalCollections.map(col => col.id);
  
  console.log('Collections finales:', finalCollectionNames);
  console.log();

  // Comparaison
  const expectedCollections = collections.map(c => c.name);
  const missingCollections = expectedCollections.filter(c => !finalCollectionNames.includes(c));
  
  if (missingCollections.length === 0) {
    console.log(' Toutes les collections requises existent maintenant!');
  } else {
    console.log(' Collections toujours manquantes:', missingCollections);
  }
  
  console.log('\n📊 Résumé:');
  console.log(`   Collections existantes: ${finalCollectionNames.length}`);
  console.log(`   Collections attendues: ${expectedCollections.length}`);
  console.log(`   Collections manquantes: ${missingCollections.length}`);
}

createCollections()
  .then(() => {
    console.log('\n Opération terminée avec succès');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nErreur:', error);
    process.exit(1);
  });
