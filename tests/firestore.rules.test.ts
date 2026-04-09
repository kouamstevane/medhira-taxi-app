/**
 * Suite de tests pour les règles de sécurité Firestore - Medjira Taxi App
 * 
 * Ce fichier teste toutes les règles Firestore définies dans firestore.rules
 * 
 * Pour exécuter ces tests :
 * 1. Assurez-vous que les émulateurs Firebase sont installés
 * 2. Lancez les émulateurs : firebase emulators:start
 * 3. Exécutez les tests : npm run test:firestore
 * 
 * Ou utilisez la commande combinée : firebase emulators:exec "npm run test:firestore"
 */

import { 
  initializeTestEnvironment, 
  RulesTestEnvironment,
  RulesTestContext,
  assertFails,
  assertSucceeds
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, addDoc, query, where } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// CONFIGURATION ET SETUP
// ============================================================================

describe('Tests des règles Firestore - Medjira Taxi App', () => {
  let testEnv: RulesTestEnvironment;

  // IDs de test pour les différents utilisateurs
  const aliceId = 'alice-user-id';
  const bobId = 'bob-user-id';
  const charlieId = 'charlie-user-id';
  const adminId = 'admin-user-id';
  const driverId = 'driver-user-id';
  const driverUnverifiedId = 'driver-unverified-id';

  beforeAll(async () => {
    // Initialiser l'environnement de test avec les règles Firestore
    testEnv = await initializeTestEnvironment({
      projectId: 'medjira-taxi-test',
      firestore: {
        rules: readFileSync(join(__dirname, '../firestore.rules'), 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    // Nettoyer l'environnement de test
    await testEnv.cleanup();
  });

  // Nettoyer la base de données avant chaque test
  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  /**
   * Crée un utilisateur authentifié avec les options spécifiées
   */
  const getAuthContext = (uid: string, emailVerified = false) => ({
    token: { email_verified: emailVerified },
  });

  /**
   * Crée un utilisateur admin dans la collection admins
   */
  const setupAdmin = async () => {
    const adminDb = testEnv.authenticatedContext(adminId, getAuthContext(adminId, true).token).firestore();
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      const admin = context.firestore();
      await setDoc(doc(admin, 'admins', adminId), { 
        uid: adminId,
        email: 'admin@medjira.com',
        role: 'admin',
        createdAt: new Date().toISOString()
      });
    });
  };

  /**
   * Crée un utilisateur client dans la collection users
   */
  const setupUser = async (uid: string, email?: string, phoneNumber?: string) => {
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', uid), {
        uid,
        userType: 'client',
        email: email || null,
        phoneNumber: phoneNumber || null,
        createdAt: new Date().toISOString(),
        emailVerified: !!email,
        phoneVerified: !!phoneNumber,
      });
    });
  };

  /**
   * Crée un chauffeur dans la collection drivers
   */
  const setupDriver = async (uid: string, email: string, status: string) => {
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
      const db = context.firestore();
      await setDoc(doc(db, 'drivers', uid), {
        uid,
        userType: 'chauffeur',
        email,
        phoneNumber: null,
        status,
        createdAt: new Date().toISOString(),
      });
    });
  };

  // ============================================================================
  // TESTS D'AUTHENTIFICATION
  // ============================================================================

  describe('Tests d\'authentification', () => {
    test('Utilisateur non authentifié ne peut pas accéder aux données', async () => {
      const anonDb = testEnv.unauthenticatedContext().firestore();
      
      // Tentative de lecture sans authentification
      await assertFails(getDoc(doc(anonDb, 'users', aliceId)));
      
      // Tentative d'écriture sans authentification
      await assertFails(setDoc(doc(anonDb, 'users', aliceId), { 
        userType: 'client' 
      }));
    });

    test('Utilisateur authentifié peut accéder aux données publiques', async () => {
      await setupUser(aliceId);
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      // Lecture réussie avec authentification
      await assertSucceeds(getDoc(doc(aliceDb, 'users', aliceId)));
    });
  });

  // ============================================================================
  // TESTS POUR LA COLLECTION USERS (CLIENTS)
  // ============================================================================

  describe('Collection users (clients)', () => {
    test('Création de compte client avec email', async () => {
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(setDoc(doc(aliceDb, 'users', aliceId), {
        uid: aliceId,
        userType: 'client',
        email: 'alice@example.com',
        emailVerified: true,
        phoneNumber: null,
        createdAt: new Date().toISOString(),
      }));
    });

    test('Création de compte client avec téléphone', async () => {
      const bobDb = testEnv.authenticatedContext(bobId).firestore();
      
      await assertSucceeds(setDoc(doc(bobDb, 'users', bobId), {
        uid: bobId,
        userType: 'client',
        email: null,
        phoneNumber: '+237123456789',
        phoneVerified: true,
        createdAt: new Date().toISOString(),
      }));
    });

    test('Création de compte client avec email ET téléphone', async () => {
      const charlieDb = testEnv.authenticatedContext(charlieId).firestore();
      
      await assertSucceeds(setDoc(doc(charlieDb, 'users', charlieId), {
        uid: charlieId,
        userType: 'client',
        email: 'charlie@example.com',
        phoneNumber: '+237987654321',
        emailVerified: true,
        phoneVerified: true,
        createdAt: new Date().toISOString(),
      }));
    });

    test('Lecture par le propriétaire', async () => {
      await setupUser(aliceId, 'alice@example.com');
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(getDoc(doc(aliceDb, 'users', aliceId)));
    });

    test('Lecture par d\'autres utilisateurs authentifiés', async () => {
      await setupUser(aliceId, 'alice@example.com');
      await setupUser(bobId, 'bob@example.com');
      
      const bobDb = testEnv.authenticatedContext(bobId).firestore();
      
      // Bob peut lire les données d'Alice (les chauffeurs doivent voir les clients)
      await assertSucceeds(getDoc(doc(bobDb, 'users', aliceId)));
    });

    test('Mise à jour par le propriétaire', async () => {
      await setupUser(aliceId, 'alice@example.com');
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(updateDoc(doc(aliceDb, 'users', aliceId), {
        email: 'newalice@example.com',
      }));
    });

    test('Mise à jour par un autre utilisateur doit échouer', async () => {
      await setupUser(aliceId, 'alice@example.com');
      await setupUser(bobId, 'bob@example.com');
      
      const bobDb = testEnv.authenticatedContext(bobId).firestore();
      
      await assertFails(updateDoc(doc(bobDb, 'users', aliceId), {
        email: 'hacked@example.com',
      }));
    });

    test('Suppression de compte client doit échouer', async () => {
      await setupUser(aliceId, 'alice@example.com');
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(deleteDoc(doc(aliceDb, 'users', aliceId)));
    });

    test('Création de compte avec mauvais userType doit échouer', async () => {
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(setDoc(doc(aliceDb, 'users', aliceId), {
        uid: aliceId,
        userType: 'chauffeur', // Mauvais type pour users
        email: 'alice@example.com',
      }));
    });
  });

  // ============================================================================
  // TESTS POUR LA COLLECTION DRIVERS (CHAUFFEURS)
  // ============================================================================

  describe('Collection drivers (chauffeurs)', () => {
    test('Création de compte chauffeur SANS email vérifié doit échouer', async () => {
      const driverDb = testEnv.authenticatedContext(driverId, getAuthContext(driverId, false)).firestore();
      
      await assertFails(setDoc(doc(driverDb, 'drivers', driverId), {
        uid: driverId,
        userType: 'chauffeur',
        email: 'driver@example.com',
        phoneNumber: null,
        status: 'pending',
      }));
    });

    test('Création de compte chauffeur AVEC email vérifié doit réussir', async () => {
      const driverDb = testEnv.authenticatedContext(driverId, getAuthContext(driverId, true)).firestore();
      
      await assertSucceeds(setDoc(doc(driverDb, 'drivers', driverId), {
        uid: driverId,
        userType: 'chauffeur',
        email: 'driver@example.com',
        phoneNumber: null,
        status: 'pending',
      }));
    });

    test('Création de compte chauffeur avec phoneNumber doit échouer', async () => {
      const driverDb = testEnv.authenticatedContext(driverId, getAuthContext(driverId, true)).firestore();
      
      await assertFails(setDoc(doc(driverDb, 'drivers', driverId), {
        uid: driverId,
        userType: 'chauffeur',
        email: 'driver@example.com',
        phoneNumber: '+237123456789', // Interdit pour les chauffeurs
        status: 'pending',
      }));
    });

    test('Création de compte chauffeur sans email doit échouer', async () => {
      const driverDb = testEnv.authenticatedContext(driverId, getAuthContext(driverId, true)).firestore();
      
      await assertFails(setDoc(doc(driverDb, 'drivers', driverId), {
        uid: driverId,
        userType: 'chauffeur',
        email: null, // Email requis
        phoneNumber: null,
        status: 'pending',
      }));
    });

    test('Création de compte chauffeur avec statut différent de pending doit échouer', async () => {
      const driverDb = testEnv.authenticatedContext(driverId, getAuthContext(driverId, true)).firestore();
      
      await assertFails(setDoc(doc(driverDb, 'drivers', driverId), {
        uid: driverId,
        userType: 'chauffeur',
        email: 'driver@example.com',
        phoneNumber: null,
        status: 'approved', // Doit être 'pending' à la création
      }));
    });

    test('Lecture par un utilisateur authentifié', async () => {
      await setupDriver(driverId, 'driver@example.com', 'approved');
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      // Les clients peuvent lire les infos des chauffeurs
      await assertSucceeds(getDoc(doc(aliceDb, 'drivers', driverId)));
    });

    test('Mise à jour par le propriétaire avec email vérifié', async () => {
      await setupDriver(driverId, 'driver@example.com', 'approved');
      
      const driverDb = testEnv.authenticatedContext(driverId, getAuthContext(driverId, true)).firestore();
      
      await assertSucceeds(updateDoc(doc(driverDb, 'drivers', driverId), {
        vehicleModel: 'Toyota Camry',
      }));
    });

    test('Mise à jour par le propriétaire SANS email vérifié doit échouer', async () => {
      await setupDriver(driverId, 'driver@example.com', 'approved');
      
      const driverDb = testEnv.authenticatedContext(driverId, getAuthContext(driverId, false)).firestore();
      
      await assertFails(updateDoc(doc(driverDb, 'drivers', driverId), {
        vehicleModel: 'Toyota Camry',
      }));
    });

    test('Mise à jour du statut par admin', async () => {
      await setupDriver(driverId, 'driver@example.com', 'pending');
      await setupAdmin();
      
      const adminDb = testEnv.authenticatedContext(adminId, getAuthContext(adminId, true)).firestore();
      
      await assertSucceeds(updateDoc(doc(adminDb, 'drivers', driverId), {
        status: 'approved',
      }));
    });

    test('Suppression par admin', async () => {
      await setupDriver(driverId, 'driver@example.com', 'approved');
      await setupAdmin();
      
      const adminDb = testEnv.authenticatedContext(adminId, getAuthContext(adminId, true)).firestore();
      
      await assertSucceeds(deleteDoc(doc(adminDb, 'drivers', driverId)));
    });

    test('Suppression par propriétaire si statut = rejected', async () => {
      await setupDriver(driverId, 'driver@example.com', 'rejected');
      
      const driverDb = testEnv.authenticatedContext(driverId, getAuthContext(driverId, true)).firestore();
      
      await assertSucceeds(deleteDoc(doc(driverDb, 'drivers', driverId)));
    });

    test('Suppression par propriétaire si statut != rejected doit échouer', async () => {
      await setupDriver(driverId, 'driver@example.com', 'approved');
      
      const driverDb = testEnv.authenticatedContext(driverId, getAuthContext(driverId, true)).firestore();
      
      await assertFails(deleteDoc(doc(driverDb, 'drivers', driverId)));
    });
  });

  // ============================================================================
  // TESTS POUR LA COLLECTION CALLS (VOIP)
  // ============================================================================

  describe('Collection calls (VoIP)', () => {
    const callId = 'test-call-id';
    const rideId = 'test-ride-id';

    test('Création d\'appel par caller authentifié avec nouveaux champs channel/token', async () => {
      await setupUser(aliceId, 'alice@example.com');
      await setupUser(bobId, 'bob@example.com');
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(setDoc(doc(aliceDb, 'calls', callId), {
        callerId: aliceId,
        calleeId: bobId,
        rideId,
        status: 'ringing',
        channel: 'test-channel',
        token: 'test-token',
        callerMetadata: {
          uid: aliceId,
          name: 'Alice',
        },
        createdAt: new Date().toISOString(),
      }));
    });

    test('Création d\'appel sans callerId correspondant doit échouer', async () => {
      await setupUser(bobId, 'bob@example.com');
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(setDoc(doc(aliceDb, 'calls', callId), {
        callerId: 'different-user-id', // Ne correspond pas à request.auth.uid
        calleeId: bobId,
        rideId,
        status: 'ringing',
        channel: 'test-channel',
        token: 'test-token',
        callerMetadata: {
          uid: 'different-user-id',
        },
      }));
    });

    test('Création d\'appel sans calleeId valide (utilisateur inexistant) doit échouer', async () => {
      await setupUser(aliceId, 'alice@example.com');
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(setDoc(doc(aliceDb, 'calls', callId), {
        callerId: aliceId,
        calleeId: 'non-existent-user', // Cet utilisateur n'existe pas
        rideId,
        status: 'ringing',
        channel: 'test-channel',
        token: 'test-token',
        callerMetadata: {
          uid: aliceId,
        },
      }));
    });

    test('Création d\'appel avec anciens champs agoraChannel/agoraToken doit échouer', async () => {
      await setupUser(aliceId, 'alice@example.com');
      await setupUser(bobId, 'bob@example.com');
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(setDoc(doc(aliceDb, 'calls', callId), {
        callerId: aliceId,
        calleeId: bobId,
        rideId,
        status: 'ringing',
        agoraChannel: 'test-channel', // Ancien champ
        agoraToken: 'test-token', // Ancien champ
        callerMetadata: {
          uid: aliceId,
        },
      }));
    });

    test('Lecture d\'appel par caller', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'calls', callId), {
          callerId: aliceId,
          calleeId: bobId,
          rideId,
          status: 'ringing',
          channel: 'test-channel',
          token: 'test-token',
          callerMetadata: { uid: aliceId },
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(getDoc(doc(aliceDb, 'calls', callId)));
    });

    test('Lecture d\'appel par callee', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'calls', callId), {
          callerId: aliceId,
          calleeId: bobId,
          rideId,
          status: 'ringing',
          channel: 'test-channel',
          token: 'test-token',
          callerMetadata: { uid: aliceId },
          createdAt: new Date().toISOString(),
        });
      });
      
      const bobDb = testEnv.authenticatedContext(bobId).firestore();
      
      await assertSucceeds(getDoc(doc(bobDb, 'calls', callId)));
    });

    test('Lecture d\'appel par tiers doit échouer', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'calls', callId), {
          callerId: aliceId,
          calleeId: bobId,
          rideId,
          status: 'ringing',
          channel: 'test-channel',
          token: 'test-token',
          callerMetadata: { uid: aliceId },
          createdAt: new Date().toISOString(),
        });
      });
      
      const charlieDb = testEnv.authenticatedContext(charlieId).firestore();
      
      await assertFails(getDoc(doc(charlieDb, 'calls', callId)));
    });

    test('Mise à jour du statut par callee (accept)', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'calls', callId), {
          callerId: aliceId,
          calleeId: bobId,
          rideId,
          status: 'ringing',
          channel: 'test-channel',
          token: 'test-token',
          callerMetadata: { uid: aliceId },
          createdAt: new Date().toISOString(),
        });
      });
      
      const bobDb = testEnv.authenticatedContext(bobId).firestore();
      
      await assertSucceeds(updateDoc(doc(bobDb, 'calls', callId), {
        status: 'accepted',
        answerTime: new Date().toISOString(),
      }));
    });

    test('Mise à jour du statut par callee (decline)', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'calls', callId), {
          callerId: aliceId,
          calleeId: bobId,
          rideId,
          status: 'ringing',
          channel: 'test-channel',
          token: 'test-token',
          callerMetadata: { uid: aliceId },
          createdAt: new Date().toISOString(),
        });
      });
      
      const bobDb = testEnv.authenticatedContext(bobId).firestore();
      
      await assertSucceeds(updateDoc(doc(bobDb, 'calls', callId), {
        status: 'declined',
        reason: 'Busy',
      }));
    });

    test('Mise à jour du statut par caller (end call)', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'calls', callId), {
          callerId: aliceId,
          calleeId: bobId,
          rideId,
          status: 'accepted',
          channel: 'test-channel',
          token: 'test-token',
          callerMetadata: { uid: aliceId },
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(updateDoc(doc(aliceDb, 'calls', callId), {
        status: 'ended',
        endTime: new Date().toISOString(),
      }));
    });

    test('Mise à jour de champs non autorisés doit échouer', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'calls', callId), {
          callerId: aliceId,
          calleeId: bobId,
          rideId,
          status: 'ringing',
          channel: 'test-channel',
          token: 'test-token',
          callerMetadata: { uid: aliceId },
          createdAt: new Date().toISOString(),
        });
      });
      
      const bobDb = testEnv.authenticatedContext(bobId).firestore();
      
      // Tentative de modifier le channel (non autorisé)
      await assertFails(updateDoc(doc(bobDb, 'calls', callId), {
        channel: 'new-channel',
      }));
    });

    test('Suppression d\'appel doit échouer', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'calls', callId), {
          callerId: aliceId,
          calleeId: bobId,
          rideId,
          status: 'ringing',
          channel: 'test-channel',
          token: 'test-token',
          callerMetadata: { uid: aliceId },
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(deleteDoc(doc(aliceDb, 'calls', callId)));
    });
  });

  // ============================================================================
  // TESTS POUR LA COLLECTION BOOKINGS
  // ============================================================================

  describe('Collection bookings', () => {
    const bookingId = 'test-booking-id';

    test('Création de booking par client', async () => {
      await setupUser(aliceId, 'alice@example.com');
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(addDoc(collection(aliceDb, 'bookings'), {
        userId: aliceId,
        driverId: null,
        status: 'pending',
        pickupAddress: 'Douala, Cameroun',
        dropoffAddress: 'Yaoundé, Cameroun',
        price: 15000,
        createdAt: new Date().toISOString(),
      }));
    });

    test('Lecture de booking par client', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bookings', bookingId), {
          userId: aliceId,
          driverId: driverId,
          status: 'accepted',
          pickupAddress: 'Douala, Cameroun',
          dropoffAddress: 'Yaoundé, Cameroun',
          price: 15000,
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(getDoc(doc(aliceDb, 'bookings', bookingId)));
    });

    test('Lecture de booking par chauffeur assigné', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bookings', bookingId), {
          userId: aliceId,
          driverId: driverId,
          status: 'accepted',
          pickupAddress: 'Douala, Cameroun',
          dropoffAddress: 'Yaoundé, Cameroun',
          price: 15000,
          createdAt: new Date().toISOString(),
        });
      });
      
      const driverDb = testEnv.authenticatedContext(driverId).firestore();
      
      await assertSucceeds(getDoc(doc(driverDb, 'bookings', bookingId)));
    });

    test('Lecture de bookings en attente par chauffeurs', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bookings', bookingId), {
          userId: aliceId,
          driverId: null,
          status: 'pending',
          pickupAddress: 'Douala, Cameroun',
          dropoffAddress: 'Yaoundé, Cameroun',
          price: 15000,
          createdAt: new Date().toISOString(),
        });
      });
      
      const driverDb = testEnv.authenticatedContext(driverId).firestore();
      
      // Les chauffeurs peuvent voir les bookings en attente
      await assertSucceeds(getDoc(doc(driverDb, 'bookings', bookingId)));
    });

    test('Mise à jour de booking par client', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bookings', bookingId), {
          userId: aliceId,
          driverId: null,
          status: 'pending',
          pickupAddress: 'Douala, Cameroun',
          dropoffAddress: 'Yaoundé, Cameroun',
          price: 15000,
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(updateDoc(doc(aliceDb, 'bookings', bookingId), {
        pickupAddress: 'Nouvelle adresse de départ',
      }));
    });

    test('Mise à jour de booking par chauffeur assigné', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bookings', bookingId), {
          userId: aliceId,
          driverId: driverId,
          status: 'accepted',
          pickupAddress: 'Douala, Cameroun',
          dropoffAddress: 'Yaoundé, Cameroun',
          price: 15000,
          createdAt: new Date().toISOString(),
        });
      });
      
      const driverDb = testEnv.authenticatedContext(driverId).firestore();
      
      await assertSucceeds(updateDoc(doc(driverDb, 'bookings', bookingId), {
        status: 'in_progress',
      }));
    });

    test('Acceptation de course par chauffeur', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bookings', bookingId), {
          userId: aliceId,
          driverId: null,
          status: 'pending',
          pickupAddress: 'Douala, Cameroun',
          dropoffAddress: 'Yaoundé, Cameroun',
          price: 15000,
          createdAt: new Date().toISOString(),
        });
      });
      
      const driverDb = testEnv.authenticatedContext(driverId).firestore();
      
      await assertSucceeds(updateDoc(doc(driverDb, 'bookings', bookingId), {
        status: 'accepted',
        driverId: driverId,
      }));
    });

    test('Annulation de course par client', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bookings', bookingId), {
          userId: aliceId,
          driverId: driverId,
          status: 'accepted',
          pickupAddress: 'Douala, Cameroun',
          dropoffAddress: 'Yaoundé, Cameroun',
          price: 15000,
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(updateDoc(doc(aliceDb, 'bookings', bookingId), {
        status: 'cancelled',
        cancelledBy: 'client',
      }));
    });

    test('Suppression de booking doit échouer', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bookings', bookingId), {
          userId: aliceId,
          driverId: driverId,
          status: 'completed',
          pickupAddress: 'Douala, Cameroun',
          dropoffAddress: 'Yaoundé, Cameroun',
          price: 15000,
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(deleteDoc(doc(aliceDb, 'bookings', bookingId)));
    });
  });

  // ============================================================================
  // TESTS POUR LA SOUS-COLLECTION BOOKINGS/MESSAGES
  // ============================================================================

  describe('Sous-collection bookings/{bookingId}/messages', () => {
    const bookingId = 'test-booking-id';
    const messageId = 'test-message-id';

    beforeEach(async () => {
      // Créer un booking pour les tests
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bookings', bookingId), {
          userId: aliceId,
          driverId: driverId,
          status: 'accepted',
          pickupAddress: 'Douala, Cameroun',
          dropoffAddress: 'Yaoundé, Cameroun',
          price: 15000,
          createdAt: new Date().toISOString(),
        });
      });
    });

    test('Création de message par client', async () => {
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(addDoc(collection(aliceDb, 'bookings', bookingId, 'messages'), {
        senderId: aliceId,
        content: 'Je suis en route',
        timestamp: new Date().toISOString(),
        read: false,
      }));
    });

    test('Création de message par chauffeur', async () => {
      const driverDb = testEnv.authenticatedContext(driverId).firestore();
      
      await assertSucceeds(addDoc(collection(driverDb, 'bookings', bookingId, 'messages'), {
        senderId: driverId,
        content: 'J\'arrive dans 5 minutes',
        timestamp: new Date().toISOString(),
        read: false,
      }));
    });

    test('Création de message par tiers doit échouer', async () => {
      const bobDb = testEnv.authenticatedContext(bobId).firestore();
      
      await assertFails(addDoc(collection(bobDb, 'bookings', bookingId, 'messages'), {
        senderId: bobId,
        content: 'Message non autorisé',
        timestamp: new Date().toISOString(),
        read: false,
      }));
    });

    test('Lecture de messages par client', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bookings', bookingId, 'messages', messageId), {
          senderId: driverId,
          content: 'Message test',
          timestamp: new Date().toISOString(),
          read: false,
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(getDoc(doc(aliceDb, 'bookings', bookingId, 'messages', messageId)));
    });

    test('Lecture de messages par chauffeur', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bookings', bookingId, 'messages', messageId), {
          senderId: aliceId,
          content: 'Message test',
          timestamp: new Date().toISOString(),
          read: false,
        });
      });
      
      const driverDb = testEnv.authenticatedContext(driverId).firestore();
      
      await assertSucceeds(getDoc(doc(driverDb, 'bookings', bookingId, 'messages', messageId)));
    });

    test('Marquer message comme lu', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bookings', bookingId, 'messages', messageId), {
          senderId: driverId,
          content: 'Message test',
          timestamp: new Date().toISOString(),
          read: false,
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(updateDoc(doc(aliceDb, 'bookings', bookingId, 'messages', messageId), {
        read: true,
      }));
    });

    test('Suppression de message doit échouer', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bookings', bookingId, 'messages', messageId), {
          senderId: aliceId,
          content: 'Message test',
          timestamp: new Date().toISOString(),
          read: false,
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(deleteDoc(doc(aliceDb, 'bookings', bookingId, 'messages', messageId)));
    });
  });

  // ============================================================================
  // TESTS POUR LA COLLECTION WALLETS
  // ============================================================================

  describe('Collection wallets', () => {
    test('Création de wallet par propriétaire', async () => {
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(setDoc(doc(aliceDb, 'wallets', aliceId), {
        balance: 0,
        currency: 'XAF',
        createdAt: new Date().toISOString(),
      }));
    });

    test('Création de wallet par autre utilisateur doit échouer', async () => {
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(setDoc(doc(aliceDb, 'wallets', bobId), {
        balance: 0,
        currency: 'XAF',
      }));
    });

    test('Lecture de wallet par propriétaire', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'wallets', aliceId), {
          balance: 50000,
          currency: 'XAF',
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(getDoc(doc(aliceDb, 'wallets', aliceId)));
    });

    test('Lecture de wallet par tiers doit échouer', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'wallets', aliceId), {
          balance: 50000,
          currency: 'XAF',
          createdAt: new Date().toISOString(),
        });
      });
      
      const bobDb = testEnv.authenticatedContext(bobId).firestore();
      
      await assertFails(getDoc(doc(bobDb, 'wallets', aliceId)));
    });

    test('Mise à jour de wallet par propriétaire', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'wallets', aliceId), {
          balance: 50000,
          currency: 'XAF',
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(updateDoc(doc(aliceDb, 'wallets', aliceId), {
        balance: 45000,
      }));
    });

    test('Mise à jour de wallet par tiers doit échouer', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'wallets', aliceId), {
          balance: 50000,
          currency: 'XAF',
          createdAt: new Date().toISOString(),
        });
      });
      
      const bobDb = testEnv.authenticatedContext(bobId).firestore();
      
      await assertFails(updateDoc(doc(bobDb, 'wallets', aliceId), {
        balance: 0,
      }));
    });

    test('Suppression de wallet doit échouer', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'wallets', aliceId), {
          balance: 50000,
          currency: 'XAF',
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(deleteDoc(doc(aliceDb, 'wallets', aliceId)));
    });
  });

  // ============================================================================
  // TESTS POUR LA COLLECTION TRANSACTIONS
  // ============================================================================

  describe('Collection transactions', () => {
    const transactionId = 'test-transaction-id';

    test('Création de transaction par utilisateur', async () => {
      await setupUser(aliceId, 'alice@example.com');
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(addDoc(collection(aliceDb, 'transactions'), {
        userId: aliceId,
        driverId: null,
        amount: 15000,
        type: 'credit',
        status: 'completed',
        createdAt: new Date().toISOString(),
      }));
    });

    test('Lecture de transaction par client propriétaire', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'transactions', transactionId), {
          userId: aliceId,
          driverId: null,
          amount: 15000,
          type: 'credit',
          status: 'completed',
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(getDoc(doc(aliceDb, 'transactions', transactionId)));
    });

    test('Lecture de transaction par chauffeur impliqué', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'transactions', transactionId), {
          userId: aliceId,
          driverId: driverId,
          amount: 15000,
          type: 'payment',
          status: 'completed',
          createdAt: new Date().toISOString(),
        });
      });
      
      const driverDb = testEnv.authenticatedContext(driverId).firestore();
      
      await assertSucceeds(getDoc(doc(driverDb, 'transactions', transactionId)));
    });

    test('Lecture de transaction par tiers doit échouer', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'transactions', transactionId), {
          userId: aliceId,
          driverId: driverId,
          amount: 15000,
          type: 'payment',
          status: 'completed',
          createdAt: new Date().toISOString(),
        });
      });
      
      const bobDb = testEnv.authenticatedContext(bobId).firestore();
      
      await assertFails(getDoc(doc(bobDb, 'transactions', transactionId)));
    });

    test('Mise à jour de transaction doit échouer', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'transactions', transactionId), {
          userId: aliceId,
          driverId: null,
          amount: 15000,
          type: 'credit',
          status: 'completed',
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(updateDoc(doc(aliceDb, 'transactions', transactionId), {
        amount: 20000,
      }));
    });

    test('Suppression de transaction doit échouer', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'transactions', transactionId), {
          userId: aliceId,
          driverId: null,
          amount: 15000,
          type: 'credit',
          status: 'completed',
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(deleteDoc(doc(aliceDb, 'transactions', transactionId)));
    });
  });

  // ============================================================================
  // TESTS POUR LA COLLECTION VEHICLES
  // ============================================================================

  describe('Collection vehicles', () => {
    const vehicleId = 'test-vehicle-id';

    test('Lecture de véhicule par utilisateur authentifié', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'vehicles', vehicleId), {
          ownerId: driverId,
          make: 'Toyota',
          model: 'Camry',
          year: 2020,
          plateNumber: 'CE 123 AB',
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      // Les clients peuvent lire les infos des véhicules
      await assertSucceeds(getDoc(doc(aliceDb, 'vehicles', vehicleId)));
    });

    test('Création de véhicule par propriétaire', async () => {
      const driverDb = testEnv.authenticatedContext(driverId).firestore();
      
      await assertSucceeds(setDoc(doc(driverDb, 'vehicles', vehicleId), {
        ownerId: driverId,
        make: 'Toyota',
        model: 'Camry',
        year: 2020,
        plateNumber: 'CE 123 AB',
      }));
    });

    test('Création de véhicule par non-propriétaire doit échouer', async () => {
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(setDoc(doc(aliceDb, 'vehicles', vehicleId), {
        ownerId: driverId, // Alice n'est pas le propriétaire
        make: 'Toyota',
        model: 'Camry',
        year: 2020,
        plateNumber: 'CE 123 AB',
      }));
    });

    test('Mise à jour de véhicule par propriétaire', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'vehicles', vehicleId), {
          ownerId: driverId,
          make: 'Toyota',
          model: 'Camry',
          year: 2020,
          plateNumber: 'CE 123 AB',
        });
      });
      
      const driverDb = testEnv.authenticatedContext(driverId).firestore();
      
      await assertSucceeds(updateDoc(doc(driverDb, 'vehicles', vehicleId), {
        year: 2021,
      }));
    });

    test('Suppression de véhicule par propriétaire', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'vehicles', vehicleId), {
          ownerId: driverId,
          make: 'Toyota',
          model: 'Camry',
          year: 2020,
          plateNumber: 'CE 123 AB',
        });
      });
      
      const driverDb = testEnv.authenticatedContext(driverId).firestore();
      
      await assertSucceeds(deleteDoc(doc(driverDb, 'vehicles', vehicleId)));
    });
  });

  // ============================================================================
  // TESTS POUR LA COLLECTION CONFIG
  // ============================================================================

  describe('Collection config', () => {
    test('Lecture de config par utilisateur authentifié', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'config', 'settings'), {
          baseFare: 500,
          pricePerKm: 100,
          pricePerMinute: 50,
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(getDoc(doc(aliceDb, 'config', 'settings')));
    });

    test('Écriture de config par utilisateur doit échouer', async () => {
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(setDoc(doc(aliceDb, 'config', 'settings'), {
        baseFare: 1000,
      }));
    });
  });

  // ============================================================================
  // TESTS POUR LA COLLECTION CARTYPES
  // ============================================================================

  describe('Collection carTypes', () => {
    test('Lecture de carTypes par utilisateur authentifié', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'carTypes', 'standard'), {
          name: 'Standard',
          basePrice: 500,
          pricePerKm: 100,
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(getDoc(doc(aliceDb, 'carTypes', 'standard')));
    });

    test('Écriture de carTypes par utilisateur doit échouer', async () => {
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(setDoc(doc(aliceDb, 'carTypes', 'standard'), {
        name: 'Standard',
        basePrice: 500,
      }));
    });
  });

  // ============================================================================
  // TESTS POUR LA COLLECTION PARCELS
  // ============================================================================

  describe('Collection parcels', () => {
    const parcelId = 'test-parcel-id';

    test('Création de colis par expéditeur', async () => {
      await setupUser(aliceId, 'alice@example.com');
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(addDoc(collection(aliceDb, 'parcels'), {
        senderId: aliceId,
        receiverId: bobId,
        driverId: null,
        pickupAddress: 'Douala, Cameroun',
        deliveryAddress: 'Yaoundé, Cameroun',
        status: 'pending',
        price: 10000,
        createdAt: new Date().toISOString(),
      }));
    });

    test('Lecture de colis par expéditeur', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'parcels', parcelId), {
          senderId: aliceId,
          receiverId: bobId,
          driverId: driverId,
          pickupAddress: 'Douala, Cameroun',
          deliveryAddress: 'Yaoundé, Cameroun',
          status: 'in_transit',
          price: 10000,
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(getDoc(doc(aliceDb, 'parcels', parcelId)));
    });

    test('Lecture de colis par destinataire', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'parcels', parcelId), {
          senderId: aliceId,
          receiverId: bobId,
          driverId: driverId,
          pickupAddress: 'Douala, Cameroun',
          deliveryAddress: 'Yaoundé, Cameroun',
          status: 'in_transit',
          price: 10000,
          createdAt: new Date().toISOString(),
        });
      });
      
      const bobDb = testEnv.authenticatedContext(bobId).firestore();
      
      await assertSucceeds(getDoc(doc(bobDb, 'parcels', parcelId)));
    });

    test('Lecture de colis par chauffeur', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'parcels', parcelId), {
          senderId: aliceId,
          receiverId: bobId,
          driverId: driverId,
          pickupAddress: 'Douala, Cameroun',
          deliveryAddress: 'Yaoundé, Cameroun',
          status: 'in_transit',
          price: 10000,
          createdAt: new Date().toISOString(),
        });
      });
      
      const driverDb = testEnv.authenticatedContext(driverId).firestore();
      
      await assertSucceeds(getDoc(doc(driverDb, 'parcels', parcelId)));
    });

    test('Mise à jour de colis par expéditeur', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'parcels', parcelId), {
          senderId: aliceId,
          receiverId: bobId,
          driverId: null,
          pickupAddress: 'Douala, Cameroun',
          deliveryAddress: 'Yaoundé, Cameroun',
          status: 'pending',
          price: 10000,
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(updateDoc(doc(aliceDb, 'parcels', parcelId), {
        deliveryAddress: 'Nouvelle adresse',
      }));
    });

    test('Mise à jour de colis par chauffeur', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'parcels', parcelId), {
          senderId: aliceId,
          receiverId: bobId,
          driverId: driverId,
          pickupAddress: 'Douala, Cameroun',
          deliveryAddress: 'Yaoundé, Cameroun',
          status: 'in_transit',
          price: 10000,
          createdAt: new Date().toISOString(),
        });
      });
      
      const driverDb = testEnv.authenticatedContext(driverId).firestore();
      
      await assertSucceeds(updateDoc(doc(driverDb, 'parcels', parcelId), {
        status: 'delivered',
      }));
    });

    test('Suppression de colis doit échouer', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'parcels', parcelId), {
          senderId: aliceId,
          receiverId: bobId,
          driverId: driverId,
          pickupAddress: 'Douala, Cameroun',
          deliveryAddress: 'Yaoundé, Cameroun',
          status: 'delivered',
          price: 10000,
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(deleteDoc(doc(aliceDb, 'parcels', parcelId)));
    });
  });

  // ============================================================================
  // TESTS POUR LA COLLECTION ADMINS
  // ============================================================================

  describe('Collection admins', () => {
    test('Lecture de collection admins par utilisateur authentifié', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'admins', adminId), {
          uid: adminId,
          email: 'admin@medjira.com',
          role: 'admin',
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(getDoc(doc(aliceDb, 'admins', adminId)));
    });

    test('Écriture dans admins par utilisateur doit échouer', async () => {
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(setDoc(doc(aliceDb, 'admins', adminId), {
        uid: adminId,
        email: 'admin@medjira.com',
        role: 'admin',
      }));
    });

    test('Suppression dans admins par utilisateur doit échouer', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'admins', adminId), {
          uid: adminId,
          email: 'admin@medjira.com',
          role: 'admin',
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertFails(deleteDoc(doc(aliceDb, 'admins', adminId)));
    });
  });

  // ============================================================================
  // TESTS POUR LA COLLECTION ACTIVE_BOOKINGS
  // ============================================================================

  describe('Collection active_bookings', () => {
    const activeBookingId = 'test-active-booking-id';

    test('Création d\'active_booking par propriétaire', async () => {
      await setupUser(aliceId, 'alice@example.com');
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(setDoc(doc(aliceDb, 'active_bookings', activeBookingId), {
        userId: aliceId,
        driverId: driverId,
        status: 'in_progress',
        pickupAddress: 'Douala, Cameroun',
        dropoffAddress: 'Yaoundé, Cameroun',
        createdAt: new Date().toISOString(),
      }));
    });

    test('Lecture d\'active_booking par client', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'active_bookings', activeBookingId), {
          userId: aliceId,
          driverId: driverId,
          status: 'in_progress',
          pickupAddress: 'Douala, Cameroun',
          dropoffAddress: 'Yaoundé, Cameroun',
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(getDoc(doc(aliceDb, 'active_bookings', activeBookingId)));
    });

    test('Lecture d\'active_booking par chauffeur assigné', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'active_bookings', activeBookingId), {
          userId: aliceId,
          driverId: driverId,
          status: 'in_progress',
          pickupAddress: 'Douala, Cameroun',
          dropoffAddress: 'Yaoundé, Cameroun',
          createdAt: new Date().toISOString(),
        });
      });
      
      const driverDb = testEnv.authenticatedContext(driverId).firestore();
      
      await assertSucceeds(getDoc(doc(driverDb, 'active_bookings', activeBookingId)));
    });

    test('Lecture d\'active_booking par tiers doit échouer', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'active_bookings', activeBookingId), {
          userId: aliceId,
          driverId: driverId,
          status: 'in_progress',
          pickupAddress: 'Douala, Cameroun',
          dropoffAddress: 'Yaoundé, Cameroun',
          createdAt: new Date().toISOString(),
        });
      });
      
      const bobDb = testEnv.authenticatedContext(bobId).firestore();
      
      await assertFails(getDoc(doc(bobDb, 'active_bookings', activeBookingId)));
    });

    test('Mise à jour d\'active_booking par client', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'active_bookings', activeBookingId), {
          userId: aliceId,
          driverId: driverId,
          status: 'in_progress',
          pickupAddress: 'Douala, Cameroun',
          dropoffAddress: 'Yaoundé, Cameroun',
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(updateDoc(doc(aliceDb, 'active_bookings', activeBookingId), {
        status: 'completed',
      }));
    });

    test('Suppression d\'active_booking par client', async () => {
      await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
        const db = context.firestore();
        await setDoc(doc(db, 'active_bookings', activeBookingId), {
          userId: aliceId,
          driverId: driverId,
          status: 'completed',
          pickupAddress: 'Douala, Cameroun',
          dropoffAddress: 'Yaoundé, Cameroun',
          createdAt: new Date().toISOString(),
        });
      });
      
      const aliceDb = testEnv.authenticatedContext(aliceId).firestore();
      
      await assertSucceeds(deleteDoc(doc(aliceDb, 'active_bookings', activeBookingId)));
    });
  });
});
