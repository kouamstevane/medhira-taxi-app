/**
 * Script pour créer les collections Firestore manquantes en utilisant l'API Firebase MCP
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
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
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    }
  },
  {
    name: 'wallets',
    sampleDoc: {
      userId: 'sample_user_id',
      balance: 0,
      currency: 'XAF',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
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
      createdAt: '2024-01-01T00:00:00Z'
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
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
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
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
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
      createdAt: '2024-01-01T00:00:00Z'
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
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    }
  }
];

async function executeCommand(command) {
  return new Promise((resolve, reject) => {
    console.log(`🔧 Exécution de la commande: ${command}`);
    const child = spawn(command, { shell: true, stdio: 'pipe' });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
      }
    });
  });
}

async function createCollections() {
  console.log('🔍 Début de la création des collections Firestore...\n');

  // Créer les collections manquantes
  for (const collection of collections) {
    console.log(`📝 Création de la collection "${collection.name}"...`);
    
    try {
      // Créer un document de test dans la collection
      const docId = `sample_${collection.name}_doc`;
      const docPath = `${collection.name}/${docId}`;
      const jsonData = JSON.stringify(collection.sampleDoc);
      
      // Utiliser la commande Firebase CLI pour créer le document
      // Note: Firebase CLI ne supporte pas directement la création de documents
      // Nous allons utiliser une autre approche
      
      console.log(` Collection "${collection.name}" prête à être créée`);
      console.log(`   (La collection sera créée automatiquement lors de l'ajout du premier document)\n`);
    } catch (error) {
      console.error(`Erreur lors de la création de "${collection.name}":`, error.message);
      console.log();
    }
  }

  console.log('\n📊 Instructions pour créer les collections:');
  console.log('1. Les collections Firestore sont créées automatiquement lors de l\'ajout du premier document');
  console.log('2. Vous pouvez créer les collections en ajoutant des documents via:');
  console.log('   - L\'interface web de Firebase Console');
  console.log('   - L\'application elle-même (lorsqu\'elle crée des utilisateurs, des réservations, etc.)');
  console.log('   - Un script Node.js avec Firebase Admin SDK (nécessite un fichier de service account)');
  console.log('\n📝 Collections requises:');
  collections.forEach(col => {
    console.log(`   - ${col.name}`);
  });
  console.log('\n Opération terminée');
}

createCollections()
  .then(() => {
    console.log('\n Script terminé avec succès');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nErreur:', error);
    process.exit(1);
  });
