'use client';

import { useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, deleteDoc, doc, getDoc, listCollections, serverTimestamp, query, getDocs } from 'firebase/firestore';

export default function CreateCollectionsPage() {
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const log = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '📝';
    setLogs(prev => [...prev, `[${timestamp}] ${prefix} ${message}`]);
  };

  const showStatus = (message: string, type: 'success' | 'error' | 'info') => {
    setStatus({ type, message });
  };

  const createCollections = async () => {
    setIsCreating(true);
    setLogs([]);
    log('🔍 Début de la création des collections...', 'info');

    try {
      // Initialiser Firebase
      const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDMXeXZCFAVGeSFW_-3MYkrqV2bN1SXY-8",
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "medjira-service.firebaseapp.com",
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "medjira-service",
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "medjira-service.firebasestorage.app",
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "113581657187",
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:113581657187:web:cd8e2ef19a25b4a424bc56",
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-3LNHS26HML"
      };

      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);

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
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
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
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }
        },
        {
          name: 'wallets',
          sampleDoc: {
            userId: 'sample_user_id',
            balance: 0,
            currency: 'XAF',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
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
            createdAt: serverTimestamp()
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
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
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
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
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
            createdAt: serverTimestamp()
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
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }
        }
      ];

      // Lister les collections existantes
      log('📋 Récupération des collections existantes...', 'info');
      const existingCollections = await listCollections(db);
      const existingCollectionNames = existingCollections.map(col => col.id);
      
      log(`Collections existantes: ${existingCollectionNames.join(', ')}`, 'info');
      log('');

      // Créer les collections manquantes
      for (const collection of collections) {
        log(`📝 Vérification de la collection "${collection.name}"...`, 'info');
        
        if (!existingCollectionNames.includes(collection.name)) {
          log(`⚠️  Collection "${collection.name}" manquante`, 'info');
          log(`📝 Création de la collection "${collection.name}"...`, 'info');
          
          try {
            // Créer un document vide pour créer la collection
            const sampleDoc = collection.sampleDoc;
            const docRef = await addDoc(collection(db, collection.name), sampleDoc);
            log(`✅ Collection "${collection.name}" créée avec succès (document ID: ${docRef.id})`, 'success');
            
            // Supprimer immédiatement le document de test
            await deleteDoc(doc(db, collection.name, docRef.id));
            log(`🗑️  Document de test supprimé de "${collection.name}"`, 'info');
            log('');
          } catch (error: any) {
            log(`❌ Erreur lors de la création de "${collection.name}": ${error.message}`, 'error');
            log('');
          }
        } else {
          log(`✅ Collection "${collection.name}" existe déjà`, 'success');
          log('');
        }
      }

      // Vérifier les sous-collections de bookings
      log('🔍 Vérification des sous-collections de bookings...', 'info');
      
      const bookingsQuery = query(collection(db, 'bookings'));
      const bookingsSnapshot = await getDocs(bookingsQuery);
      
      if (bookingsSnapshot.empty) {
        log('⚠️  Aucun document dans la collection bookings', 'info');
        log('📝 Création d\'un document de test pour créer les sous-collections...', 'info');
        
        try {
          const bookingRef = await addDoc(collection(db, 'bookings'), {
            userId: 'sample_user_id',
            status: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          
          const bookingId = bookingRef.id;
          log(`✅ Document de test créé dans bookings (ID: ${bookingId})`, 'success');
          
          // Créer la sous-collection candidates
          const candidateDoc = await addDoc(collection(db, 'bookings', bookingId, 'candidates'), {
            driverId: 'sample_driver_id',
            status: 'pending',
            proposedPrice: 1000,
            createdAt: serverTimestamp()
          });
          log(`✅ Sous-collection "candidates" créée`, 'success');
          await deleteDoc(doc(db, 'bookings', bookingId, 'candidates', candidateDoc.id));
          
          // Créer la sous-collection messages
          const messageDoc = await addDoc(collection(db, 'bookings', bookingId, 'messages'), {
            senderId: 'sample_user_id',
            message: 'Sample message',
            createdAt: serverTimestamp()
          });
          log(`✅ Sous-collection "messages" créée`, 'success');
          await deleteDoc(doc(db, 'bookings', bookingId, 'messages', messageDoc.id));
          
          // Supprimer le document de test
          await deleteDoc(doc(db, 'bookings', bookingId));
          log(`🗑️  Document de test supprimé de bookings`, 'info');
          log('');
        } catch (error: any) {
          log(`❌ Erreur lors de la création des sous-collections: ${error.message}`, 'error');
          log('');
        }
      } else {
        log('✅ Collection bookings contient des documents', 'success');
        log('📝 Les sous-collections seront créées automatiquement lors de l\'utilisation', 'info');
        log('');
      }

      // Vérification finale
      log('🔍 Vérification finale des collections...', 'info');
      const finalCollections = await listCollections(db);
      const finalCollectionNames = finalCollections.map(col => col.id);
      
      log(`Collections finales: ${finalCollectionNames.join(', ')}`, 'info');
      log('');

      // Comparaison
      const expectedCollections = collections.map(c => c.name);
      const missingCollections = expectedCollections.filter(c => !finalCollectionNames.includes(c));
      
      if (missingCollections.length === 0) {
        log('✅ Toutes les collections requises existent maintenant!', 'success');
        showStatus('✅ Toutes les collections requises existent maintenant!', 'success');
      } else {
        log(`⚠️  Collections toujours manquantes: ${missingCollections.join(', ')}`, 'error');
        showStatus(`⚠️  Collections toujours manquantes: ${missingCollections.join(', ')}`, 'error');
      }
      
      log('');
      log('📊 Résumé:', 'info');
      log(`   Collections existantes: ${finalCollectionNames.length}`, 'info');
      log(`   Collections attendues: ${expectedCollections.length}`, 'info');
      log(`   Collections manquantes: ${missingCollections.length}`, 'info');

    } catch (error: any) {
      log(`❌ Erreur générale: ${error.message}`, 'error');
      showStatus(`❌ Erreur: ${error.message}`, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const verifyCollections = async () => {
    setIsVerifying(true);
    setLogs([]);
    log('🔍 Vérification des collections...', 'info');

    try {
      // Initialiser Firebase
      const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDMXeXZCFAVGeSFW_-3MYkrqV2bN1SXY-8",
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "medjira-service.firebaseapp.com",
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "medjira-service",
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "medjira-service.firebasestorage.app",
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "113581657187",
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:113581657187:web:cd8e2ef19a25b4a424bc56",
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-3LNHS26HML"
      };

      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);

      const existingCollections = await listCollections(db);
      const existingCollectionNames = existingCollections.map(col => col.id);
      
      log(`Collections existantes: ${existingCollectionNames.join(', ')}`, 'info');
      log('');
      
      const expectedCollections = ['users', 'drivers', 'wallets', 'transactions', 'bookings', 'admins', 'carTypes', 'ratings', 'parcels'];
      const missingCollections = expectedCollections.filter(c => !existingCollectionNames.includes(c));
      
      if (missingCollections.length === 0) {
        log('✅ Toutes les collections requises existent!', 'success');
        showStatus('✅ Toutes les collections requises existent!', 'success');
      } else {
        log(`⚠️  Collections manquantes: ${missingCollections.join(', ')}`, 'error');
        showStatus(`⚠️  Collections manquantes: ${missingCollections.join(', ')}`, 'error');
      }
      
      log('');
      log('📊 Résumé:', 'info');
      log(`   Collections existantes: ${existingCollectionNames.length}`, 'info');
      log(`   Collections attendues: ${expectedCollections.length}`, 'info');
      log(`   Collections manquantes: ${missingCollections.length}`, 'info');

    } catch (error: any) {
      log(`❌ Erreur lors de la vérification: ${error.message}`, 'error');
      showStatus(`❌ Erreur: ${error.message}`, 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">
            Créer les collections Firestore
          </h1>
          
          <p className="text-gray-600 mb-8 text-center">
            Ce script va créer toutes les collections Firestore nécessaires pour le projet Medjira Taxi App.
          </p>

          {status && (
            <div className={`mb-6 p-4 rounded-lg ${
              status.type === 'success' ? 'bg-green-100 text-green-800 border border-green-300' :
              status.type === 'error' ? 'bg-red-100 text-red-800 border border-red-300' :
              'bg-blue-100 text-blue-800 border border-blue-300'
            }`}>
              {status.message}
            </div>
          )}

          <div className="flex gap-4 mb-8">
            <button
              onClick={createCollections}
              disabled={isCreating || isVerifying}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isCreating ? 'Création en cours...' : 'Créer les collections'}
            </button>
            
            <button
              onClick={verifyCollections}
              disabled={isCreating || isVerifying}
              className="flex-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isVerifying ? 'Vérification en cours...' : 'Vérifier les collections'}
            </button>
          </div>

          {logs.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">Journal d'exécution</h2>
              <div className="space-y-1 font-mono text-sm">
                {logs.map((log, index) => (
                  <div key={index} className="text-gray-800">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
