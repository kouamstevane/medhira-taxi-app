/**
 * Script pour créer un utilisateur admin dans Firestore
 * 
 * Usage: node scripts/create-admin.cjs <email>
 * Exemple: node scripts/create-admin.cjs tewewilson@gmail.com
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Configuration
const ADMIN_EMAIL = process.argv[2] || 'tewewilson@gmail.com';
const USER_UID = 'rPi3nLHTMfNfKQGcfUBaLm4T4RI2'; // UID de l'utilisateur tewewilson@gmail.com

async function createAdmin() {
  try {
    // Initialiser Firebase Admin
    // Chercher le fichier de configuration Firebase
    const serviceAccountPath = path.join(process.cwd(), 'service-account-key.json');
    
    if (!fs.existsSync(serviceAccountPath)) {
      console.error('Erreur: Fichier service-account-key.json non trouvé');
      console.log('📋 Instructions pour obtenir la clé de service:');
      console.log('1. Allez dans Firebase Console: https://console.firebase.google.com/');
      console.log('2. Sélectionnez votre projet');
      console.log('3. Allez dans Paramètres du projet > Comptes de service');
      console.log('4. Cliquez sur "Générer une nouvelle clé privée"');
      console.log('5. Téléchargez le fichier JSON et renommez-le en "service-account-key.json"');
      console.log('6. Placez-le à la racine du projet');
      process.exit(1);
    }

    const serviceAccount = require(serviceAccountPath);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    const db = admin.firestore();
    const auth = admin.auth();

    console.log(`🔍 Recherche de l'utilisateur: ${ADMIN_EMAIL}`);

    // Vérifier si l'utilisateur existe déjà dans Auth
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(ADMIN_EMAIL);
      console.log(` Utilisateur trouvé: ${userRecord.displayName} (${userRecord.uid})`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.log(` L'utilisateur n'existe pas dans Firebase Auth`);
        console.log(`📧 Création de l'utilisateur...`);
        
        // Créer l'utilisateur
        userRecord = await auth.createUser({
          email: ADMIN_EMAIL,
          emailVerified: true,
          displayName: 'Admin Tewe Wilson',
        });
        
        console.log(` Utilisateur créé: ${userRecord.uid}`);
      } else {
        throw error;
      }
    }

    // Vérifier si l'utilisateur est déjà admin
    const adminDoc = await db.collection('admins').doc(userRecord.uid).get();
    
    if (adminDoc.exists) {
      console.log(` L'utilisateur est déjà admin`);
      console.log(`📊 Données admin actuelles:`, adminDoc.data());
    } else {
      // Ajouter l'utilisateur à la collection admins avec l'UID comme ID du document
      console.log(`📝 Ajout de l'utilisateur à la collection admins...`);
      console.log(`🔑 UID du document: ${userRecord.uid}`);
      
      await db.collection('admins').doc(userRecord.uid).set({
        email: ADMIN_EMAIL,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(` Utilisateur ajouté comme admin avec succès!`);
    }

    console.log('\n📋 Résumé:');
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log(`   UID: ${userRecord.uid}`);
    console.log(`   Nom: ${userRecord.displayName || 'Non défini'}`);
    console.log(`   Vérifié: ${userRecord.emailVerified ? 'Oui' : 'Non'}`);
    console.log('\n✨ L\'utilisateur peut maintenant effectuer les actions administratives!');
    console.log('\n🔐 La fonction isAdmin() dans firestore.rules vérifiera maintenant:');
    console.log(`   exists(/databases/$(database)/documents/admins/${userRecord.uid})`);

  } catch (error) {
    console.error('Erreur lors de la création de l\'admin:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Exécuter le script
createAdmin();